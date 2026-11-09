"""Tracking pipeline: latest-frame hand-off, detection thread, calibration mapping, degradation."""
from __future__ import annotations

import logging
import threading
import time
from collections import deque

import cv2
import numpy as np

from ..projection.calibration import Calibration
from .cues import GestureDetector, MotionPresence
from ..quest.engine import ZoneEngine
from .detector import InvalidFrame, validate_frame
from .pose import KEY_JOINTS, pose_hands
from .tracker import HandTracker

log = logging.getLogger("tracking")

# (mediapipe model_complexity, max processing side in px). Higher level = cheaper.
LEVELS = [(1, 640), (0, 640), (0, 480), (0, 320)]


class TrackingPipeline:
    def __init__(self, detector_factory, tracking_cfg: dict, calibration: Calibration, publish, pose_factory=None):
        self._detector_factory = detector_factory
        self._pose_factory = pose_factory
        self.mode = tracking_cfg.get("mode", "hands")  # "hands" (butterflies etc.) or "pose" (Playroom Quest)
        self.zones = ZoneEngine()
        self._last_bgr: np.ndarray | None = None  # most recent frame, memory only; used for an explicit "use this as the photo"
        self.detector = None
        self.tracker = HandTracker(tracking_cfg)
        self.cfg = dict(tracking_cfg)
        self.calibration = calibration
        self.publish = publish  # callable(dict) -- must be thread-safe
        self.level = 1  # start on the lighter model; step up only if there is headroom
        self._lock = threading.Condition()
        self._pending = None  # (frame, t_recv) -- av.VideoFrame or ndarray
        self._thread: threading.Thread | None = None
        self._running = False
        self._proc_ms: deque[float] = deque(maxlen=30)
        self._lat_ms: deque[float] = deque(maxlen=30)
        self._stamps: deque[float] = deque(maxlen=60)
        self._good_since = time.monotonic()
        self.last_hands = 0
        self.errors = 0
        self.last_error = ""
        self._preview_until = 0.0
        self._preview_jpeg: bytes | None = None
        self._last_frame: tuple[float, np.ndarray] | None = None
        self._preview_t = 0.0
        self.frame_size = (0, 0)
        self._frames_seen = 0
        self.frames_in = 0
        self.cues_enabled = True
        self.motion = MotionPresence()
        self.gestures = GestureDetector()
        self.cue_counts: dict[str, int] = {}
        self.frames_dropped = 0
        self._drop_hist: deque[int] = deque(maxlen=150)  # rolling window: 1 = frame replaced before it was processed
        self.last_done = 0.0  # monotonic time of the last processed frame
        self._error_times: deque[float] = deque(maxlen=50)

    # -- lifecycle -------------------------------------------------------
    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, name="tracking", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        with self._lock:
            self._lock.notify_all()
        if self._thread:
            self._thread.join(timeout=2)
        if self.detector:
            self.detector.close()
            self.detector = None
        self.tracker.reset()

    def configure(self, cfg: dict) -> None:
        self.cfg.update(cfg)
        cap = int(self.cfg.get("maxDegrade", len(LEVELS) - 1))
        if self.mode == "hands" and self.level > cap:
            self._set_level(cap)
        self.tracker.configure({k: v for k, v in cfg.items() if k != "mode"})
        mode = cfg.get("mode", self.mode)
        if mode != self.mode:  # switching detectors: drop the old one; the worker builds the new one on its next frame
            self.mode = mode
            self.level = 1  # a level lowered for the other detector says nothing about this one
            self._proc_ms.clear()
            self._frames_seen = 0
            self.tracker.reset()
            self.zones.people.clear()
            if self.detector:
                self.detector.close()
                self.detector = None

    def set_calibration(self, cal: Calibration) -> None:
        self.calibration = cal

    # -- input -----------------------------------------------------------
    def submit(self, frame, t_recv: float) -> None:
        with self._lock:
            self.frames_in += 1
            dropped = self._pending is not None
            self._drop_hist.append(int(dropped))
            if dropped:
                self.frames_dropped += 1
            self._pending = (frame, t_recv)  # overwrites: drop stale frames, never queue
            self._lock.notify()

    def want_preview(self) -> bytes | None:
        self._preview_until = time.monotonic() + 3.0
        return self._preview_jpeg

    # -- worker ----------------------------------------------------------
    def _run(self) -> None:
        while self._running:
            with self._lock:
                while self._pending is None and self._running:
                    self._lock.wait(timeout=0.5)
                    if self._pending is None:
                        self._publish_idle()
                item, self._pending = self._pending, None
            if item is None:
                continue
            frame, t_recv = item
            try:
                self.process(frame, t_recv)
            except InvalidFrame as e:
                self._note_error(str(e))
            except Exception as e:  # keep the thread alive on any single-frame failure
                self._note_error(repr(e))
                log.exception("tracking failed on a frame")

    def _make_detector(self):
        if self.mode == "pose":
            if self._pose_factory is None:
                from .pose import PoseDetector
                return PoseDetector(max_poses=4, min_conf=self.cfg.get("minConfidence", 0.5))
            return self._pose_factory(self.cfg)
        return self._detector_factory(self.cfg, LEVELS[self.level][0])

    def _process_pose(self, bgr: np.ndarray, t_recv: float, t0: float) -> dict:
        poses = self.detector.detect(bgr)
        events = self.zones.update(poses, time.monotonic())
        now = time.time()
        people = [{"id": pid, "j": [[i, round(lm[i][0], 4), round(lm[i][1], 4), round(lm[i][2], 2)] for i in KEY_JOINTS]} for pid, lm in self.zones.last_people]
        self.last_hands = len(people)
        self.publish({"type": "poses", "t": now, "t_frame": t_recv, "poses": people, "cam": {"w": self.frame_size[0], "h": self.frame_size[1]}})
        if self.cfg.get("handsFromPose", True):  # kids touching a wall show edge-on hands/fists: follow the arm instead
            hands = self.tracker.update([h for p in poses for h in pose_hands(p)], time.monotonic())
            self.publish({"type": "hands", "t": now, "t_frame": t_recv, "hands": self._hands_out(hands),
                          "cam": {"w": self.frame_size[0], "h": self.frame_size[1]}})
        for ev in events:
            key = f"zone:{ev['zone']}"
            self.cue_counts[key] = self.cue_counts.get(key, 0) + 1
            self.publish({**ev, "t": now})
        proc = (time.perf_counter() - t0) * 1000
        if self._frames_seen >= 5:
            self._proc_ms.append(proc)
        self._frames_seen += 1
        self._lat_ms.append((now - t_recv) * 1000)
        self._stamps.append(time.monotonic())
        self.last_done = time.monotonic()
        self._maybe_preview(bgr)
        self._adapt()
        return {"poses": people, "events": events, "proc_ms": proc}

    def snapshot_jpeg(self) -> bytes | None:
        """JPEG of the latest camera frame, only when explicitly asked for (the Quest photo). Never stored unless the caller saves it."""
        bgr = self._last_bgr
        if bgr is None:
            return None
        ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])
        return buf.tobytes() if ok else None

    def _note_error(self, msg: str) -> None:
        self.errors += 1
        self.last_error = msg
        self._error_times.append(time.monotonic())

    def budget_ms(self) -> float:
        """Time allowed per frame. Body pose is far heavier than hands and 20 fps is enough to see a jump, so it gets a longer budget."""
        fps = max(1, self.cfg.get("targetFps", 30))
        return 1000.0 / (min(fps, 20) if self.mode == "pose" else fps)

    def alive(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def ensure_alive(self) -> bool:
        """Restart the worker thread if it died. Returns True when a restart was needed."""
        if self._running and not self.alive():
            self._thread = threading.Thread(target=self._run, name="tracking", daemon=True)
            self._thread.start()
            return True
        return False

    def health(self) -> dict:
        now = time.monotonic()
        recent = sum(1 for t in self._error_times if now - t < 60)
        hist = self._drop_hist
        dropped_pct = 100.0 * sum(hist) / len(hist) if len(hist) >= 60 else 0.0  # too few frames to judge
        return {"alive": self.alive(), "doneAge": (now - self.last_done) if self.last_done else None,
                "recentErrors": recent, "lastError": self.last_error, "droppedPct": dropped_pct,
                "budgetMs": self.budget_ms()}

    def _publish_idle(self) -> None:
        """No frames arriving: tell clients there are no hands (avoids ghost hands)."""
        if self.last_hands:
            self.tracker.reset()
            self.zones.people.clear()
            self.last_hands = 0
            if self.mode == "pose":
                self.publish({"type": "poses", "t": time.time(), "t_frame": 0, "poses": [], "cam": {"w": 0, "h": 0}})
            else:
                self.publish({"type": "hands", "t": time.time(), "t_frame": 0, "hands": [], "cam": {"w": 0, "h": 0}})

    def _to_bgr(self, frame) -> np.ndarray:
        if hasattr(frame, "to_ndarray"):  # av.VideoFrame
            _, max_side = LEVELS[self.level]
            w, h = frame.width, frame.height
            s = min(1.0, max_side / max(w, h))
            if s < 1.0:
                frame = frame.reformat(width=max(16, int(w * s) // 2 * 2), height=max(16, int(h * s) // 2 * 2), format="bgr24")
            return frame.to_ndarray(format="bgr24")
        bgr = frame
        validate_frame(bgr)
        h, w = bgr.shape[:2]
        s = min(1.0, LEVELS[self.level][1] / max(w, h))
        return cv2.resize(bgr, (int(w * s), int(h * s))) if s < 1.0 else bgr

    def _hands_out(self, hands) -> list[dict]:
        """Smoothed hands -> message dicts: camera-space for the preview, projector-space for the games."""
        cal = self.calibration
        out = []
        for h in hands:
            d = h.to_dict()
            d["cam"] = list(cal.prepared(*h.palm))
            d["camTips"] = [list(cal.prepared(*p)) for p in h.tips]
            sx, sy = cal.apply(*h.palm)
            d["x"], d["y"] = round(sx, 4), round(sy, 4)
            d["tips"] = [[round(v, 4) for v in cal.apply(*p)] for p in h.tips]
            d["landmarks"] = [[round(v, 4) for v in cal.apply(*p)] for p in h.landmarks]
            d["palm"] = [d["x"], d["y"]]
            vx, vy = h.velocity  # screen-space velocity: finite difference of mapped palm over 20 ms
            nx, ny = cal.apply(h.palm[0] + vx * 0.02, h.palm[1] + vy * 0.02)
            d["velocity"] = [round((nx - sx) / 0.02, 3), round((ny - sy) / 0.02, 3)]
            out.append(d)
        return out

    def process(self, frame, t_recv: float) -> dict:
        t0 = time.perf_counter()
        bgr = self._to_bgr(frame)
        validate_frame(bgr)
        self._last_bgr = bgr
        if self.detector is None:
            self.detector = self._make_detector()
        self.frame_size = (bgr.shape[1], bgr.shape[0])
        if self.mode == "pose":
            return self._process_pose(bgr, t_recv, t0)
        raw = self.detector.detect(bgr)
        hands = self.tracker.update(raw, time.monotonic())
        out = self._hands_out(hands)
        self.last_hands = len(out)
        self._cues(bgr, hands)
        now = time.time()
        self.publish({"type": "hands", "t": now, "t_frame": t_recv, "hands": out,
                      "cam": {"w": self.frame_size[0], "h": self.frame_size[1]}})
        proc = (time.perf_counter() - t0) * 1000
        if self._frames_seen >= 5:  # the first frames include model initialisation; do not judge speed by them
            self._proc_ms.append(proc)
        self._frames_seen += 1
        self._lat_ms.append((now - t_recv) * 1000)
        self._stamps.append(time.monotonic())
        self.last_done = time.monotonic()
        self._maybe_preview(bgr)
        self._adapt()
        return {"hands": out, "proc_ms": proc}

    def _cues(self, bgr: np.ndarray, hands) -> None:
        if not self.cues_enabled:
            return
        mono = time.monotonic()
        small = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), (64, 36), interpolation=cv2.INTER_AREA)
        names = self.motion.update(small, mono) + self.gestures.update(hands, mono)
        for name in names:
            self.cue_counts[name] = self.cue_counts.get(name, 0) + 1
            self.publish({"type": "cue", "name": name, "source": "camera", "t": time.time()})

    def latest_frame(self) -> tuple[float, np.ndarray] | None:
        """(monotonic time, BGR frame) of the most recent processed frame, for one-off analysis such as marker detection."""
        return self._last_frame

    def _maybe_preview(self, bgr: np.ndarray) -> None:
        now = time.monotonic()
        self._last_frame = (now, bgr)
        if now > self._preview_until or now - self._preview_t < 0.1:
            return
        self._preview_t = now
        small = bgr if max(bgr.shape[:2]) <= 480 else cv2.resize(bgr, None, fx=480 / max(bgr.shape[:2]), fy=480 / max(bgr.shape[:2]))
        ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ok:
            self._preview_jpeg = buf.tobytes()

    def _adapt(self) -> None:
        """Graceful degradation: step down model/resolution when too slow, step up when comfortably fast."""
        if self.mode == "pose":  # pose cost is dominated by its fixed-size networks: shrinking the input only hurts accuracy
            return
        if len(self._proc_ms) < 30:  # also skips model warm-up: the deque is cleared on every level change
            return
        avg = sum(self._proc_ms) / len(self._proc_ms)
        budget = self.budget_ms()
        now = time.monotonic()
        if avg > budget * 1.15 and self.level < min(len(LEVELS) - 1, int(self.cfg.get("maxDegrade", len(LEVELS) - 1))):
            self._set_level(self.level + 1)
            self._good_since = now
        elif avg < budget * 0.6 and self.level > 0 and now - self._good_since > 8:
            self._set_level(self.level - 1)
            self._good_since = now
        elif avg >= budget * 0.6:
            self._good_since = now

    def _set_level(self, level: int) -> None:
        log.info("tracking level %d -> %d", self.level, level)
        self.level = level
        self._proc_ms.clear()
        if self.detector:
            self.detector.set_complexity(LEVELS[level][0])

    def stats(self) -> dict:
        fps = 0.0
        if len(self._stamps) > 1 and time.monotonic() - self._stamps[-1] < 2:
            span = self._stamps[-1] - self._stamps[0]
            fps = (len(self._stamps) - 1) / span if span > 0 else 0.0
        avg = lambda d: round(sum(d) / len(d), 1) if d else 0.0  # noqa: E731
        return {"fps": round(fps, 1), "procMs": avg(self._proc_ms), "latencyMs": avg(self._lat_ms),
                "hands": self.last_hands, "mode": self.mode, "level": self.level, "errors": self.errors, "lastError": self.last_error}
