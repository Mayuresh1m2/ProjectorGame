"""Health evaluation, event log and metrics.

`evaluate()` is a pure function: it turns a snapshot of measurements into a list of checks, each with a
status (ok | info | warn | fail), a plain-language message and a hint for fixing it. `HealthMonitor` keeps
the previous result so that *changes* become events ("camera lost", "tracking recovered"). Everything is
local: events live in memory (last 500) and in a rotating log file under data/logs/.
"""
from __future__ import annotations

import logging
import logging.handlers
import threading
import time
from collections import deque
from pathlib import Path

SEVERITY = {"ok": 0, "info": 0, "warn": 1, "fail": 2}
STALL_FAIL_S = 3.0        # camera "connected" but no frame this long -> fail
FPS_WARN = 15.0           # camera or tracking below this -> warn
DISPLAY_FPS_WARN = 30.0
LATENCY_WARN_MS = 150.0


def check(id_: str, status: str, message: str, hint: str = "") -> dict:
    return {"id": id_, "status": status, "message": message, "hint": hint}


def evaluate(i: dict) -> dict:
    """i: measurements (see AppState.health_inputs). Returns {"status": ok|degraded|down, "checks": [...]}."""
    checks = [check("server", "ok", "Server running")]

    cam = i["camera"]
    state, age = cam["state"], cam.get("frameAge")
    if state == "idle":
        checks.append(check("camera", "info", "No camera connected", "Open the camera link on the iPhone and tap Start camera."))
    elif state == "connecting":
        checks.append(check("camera", "warn" if cam.get("stateAge", 0) > 15 else "info", "Camera is connecting…",
                            "If this stays for more than a few seconds: same Wi-Fi? Firewall blocking UDP? Try Stop then Start camera on the phone."))
    elif state in ("disconnected", "failed"):
        checks.append(check("camera", "fail", f"Camera connection {state}",
                            "Keep the phone screen on and the camera page open; check Wi-Fi; tap Start camera again (the page retries by itself)."))
    elif age is None or age > STALL_FAIL_S:
        checks.append(check("camera", "fail", "Camera connected but no frames are arriving" + (f" ({age:.0f} s)" if age else ""),
                            "The phone may have locked or the page went to the background. Wake the phone and keep Safari in front."))
    elif cam["fps"] < FPS_WARN:
        checks.append(check("camera", "warn", f"Camera frame rate is low ({cam['fps']:.0f} fps)",
                            "Move closer to the router, use 5 GHz Wi-Fi, or lower the resolution on the camera page."))
    else:
        checks.append(check("camera", "ok", f"Camera streaming ({cam['fps']:.0f} fps, {cam['width']}×{cam['height']})"))

    if i.get("mode") == "pose" and not i.get("poseModel", True):
        checks.append(check("pose-model", "fail", "Pose model file is missing, so Playroom Quest cannot track bodies", "Run scripts/fetch_models.sh once (needs internet), then restart."))

    t = i["tracking"]
    streaming = state == "connected"
    if not t["alive"]:
        checks.append(check("tracking", "fail", "Tracking thread is not running", "The server will try to restart it; if this persists, restart the server and check data/logs/playground.log."))
    elif streaming and t["doneAge"] is not None and t["doneAge"] > STALL_FAIL_S:
        checks.append(check("tracking", "fail", f"Tracking stalled ({t['doneAge']:.0f} s since the last processed frame)",
                            "The laptop may be overloaded; close other apps. See the log for tracking errors."))
    elif t["recentErrors"]:
        checks.append(check("tracking", "warn", f"{t['recentErrors']} tracking error(s) in the last minute: {t['lastError'] or 'unknown'}",
                            "Usually a bad frame; if constant, check data/logs/playground.log."))
    elif streaming and t["procMs"] > t["budgetMs"] * 1.15:
        checks.append(check("tracking", "warn", f"Tracking is slow ({t['procMs']:.0f} ms per frame, budget {t['budgetMs']:.0f} ms)",
                            "Quality was lowered automatically. Close other programs or lower the camera resolution."))
    elif streaming and t["level"] > 0:
        checks.append(check("tracking", "info", f"Tracking running at reduced quality (level {t['level']})", "Automatic: the laptop was too slow for full quality."))
    else:
        checks.append(check("tracking", "ok", "Tracking idle" if not streaming else f"Tracking {t['fps']:.0f} fps, {t['procMs']:.0f} ms/frame"))

    if streaming and t["latencyMs"] > LATENCY_WARN_MS:
        checks.append(check("latency", "warn", f"Frame-to-hands delay is high ({t['latencyMs']:.0f} ms)", "Tracking is falling behind the camera."))
    if streaming and t["droppedPct"] > 30:
        checks.append(check("frames", "warn", f"{t['droppedPct']:.0f}% of camera frames were skipped", "Tracking cannot keep up with the camera; this is expected if the camera runs at 60 fps."))

    d = i["displays"]
    if not d:
        checks.append(check("display", "info", "No game window is open", "Open the game from the control panel (▶ Open game)."))
    else:
        stale = [x for x in d if x["age"] > 6]
        slow = [x for x in d if x["age"] <= 6 and x["fps"] < DISPLAY_FPS_WARN]
        if slow:
            checks.append(check("display", "warn", f"Game window renders at {min(x['fps'] for x in slow):.0f} fps",
                                "Quality is lowered automatically. Close other browser tabs; use the projector's native resolution; try Chromium."))
        elif stale and len(stale) == len(d):
            checks.append(check("display", "warn", "Game window stopped reporting", "The tab may be frozen or in the background (browsers throttle hidden tabs)."))
        else:
            checks.append(check("display", "ok", f"Game window rendering ({max(x['fps'] for x in d):.0f} fps)"))

    if not i["calibrated"]:
        checks.append(check("calibration", "info", "Not calibrated: camera view fills the screen", "Control panel → Calibrate, so hands line up with the wall."))
    if not i["httpsEnabled"]:
        checks.append(check("network", "warn", "HTTPS is disabled; the iPhone camera cannot work", "Unset PLAYGROUND_HTTPS=0 and restart."))
    elif not i["ips"]:
        checks.append(check("network", "warn", "No Wi-Fi/LAN address found", "Connect the laptop to the same network as the phone."))

    worst = max(SEVERITY[c["status"]] for c in checks)
    return {"status": ["ok", "degraded", "down"][worst], "checks": checks, "t": time.time()}


class EventLog:
    """Last N notable events, with increasing ids so a page can ask for what it has not seen."""

    def __init__(self, size: int = 500):
        self._lock = threading.Lock()
        self._events: deque[dict] = deque(maxlen=size)
        self._next = 1

    def add(self, level: str, source: str, message: str) -> dict:
        with self._lock:
            ev = {"id": self._next, "t": time.time(), "level": level, "source": source, "message": message}
            self._next += 1
            self._events.append(ev)
            return ev

    def since(self, after: int = 0, limit: int = 200) -> list[dict]:
        with self._lock:
            return [e for e in self._events if e["id"] > after][-limit:]


class EventLogHandler(logging.Handler):
    """Copies WARNING+ log records into the event log so failures show up in the UI too."""

    def __init__(self, events: EventLog):
        super().__init__(logging.WARNING)
        self.events = events

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.events.add("error" if record.levelno >= logging.ERROR else "warning", record.name, record.getMessage())
        except Exception:  # logging must never raise
            pass


def setup_file_logging(log_dir: Path) -> Path:
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / "playground.log"
    h = logging.handlers.RotatingFileHandler(path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logging.getLogger().addHandler(h)
    return path


class HealthMonitor:
    """Runs evaluate() on each tick and turns status changes into events (after `confirm` consecutive ticks)."""

    LEVEL = {"ok": "info", "info": "info", "warn": "warning", "fail": "error"}

    def __init__(self, events: EventLog, confirm: int = 2):
        self.events = events
        self.confirm = confirm
        self.report: dict = {"status": "ok", "checks": [], "t": 0}
        self._announced: dict[str, str] = {}
        self._pending: dict[str, tuple[str, int]] = {}

    def update(self, inputs: dict) -> dict:
        self.report = evaluate(inputs)
        for c in self.report["checks"]:
            cid, st = c["id"], c["status"]
            if cid not in self._announced:
                self._announced[cid] = st
                if st in ("warn", "fail"):
                    self.events.add(self.LEVEL[st], cid, c["message"])
                continue
            if st == self._announced[cid]:
                self._pending.pop(cid, None)
                continue
            prev, n = self._pending.get(cid, (st, 0))
            n = n + 1 if prev == st else 1
            self._pending[cid] = (st, n)
            if n >= self.confirm:
                was = self._announced[cid]
                self._announced[cid] = st
                self._pending.pop(cid, None)
                if st in ("ok", "info") and was in ("warn", "fail"):
                    self.events.add("info", cid, f"Recovered: {c['message']}")
                else:
                    self.events.add(self.LEVEL[st], cid, c["message"])
        return self.report


def prometheus(m: dict) -> str:
    """Plain-text metrics (Prometheus exposition format) so the numbers can be graphed or scraped locally."""
    lines = []
    for name, (help_, value) in m.items():
        lines += [f"# HELP playground_{name} {help_}", f"# TYPE playground_{name} gauge", f"playground_{name} {value}"]
    return "\n".join(lines) + "\n"
