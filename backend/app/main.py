"""Butterfly Playground server.

* HTTP  on 127.0.0.1:8000 -> the laptop (game output + control panel). Loopback is a secure context.
* HTTPS on 0.0.0.0:8443   -> the phone (camera page). Self-signed cert, required by iOS Safari.
Everything that exposes camera frames, media or settings is restricted to loopback clients.
"""
from __future__ import annotations

import asyncio
import contextlib
import hmac
import io
import json
import logging
import secrets
import time
from pathlib import Path

import segno
import uvicorn
from fastapi import Body, Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import config, netinfo
from .camera.receiver import CameraReceiver
from .certs import ensure_cert
from .health import evaluate, EventLog, EventLogHandler, HealthMonitor, prometheus, setup_file_logging
from .hub import Hub
from .latency import LatencyProbe
from .projection.calibration import MAX_GRIDS, Calibration, CalibrationError, Grid, find_markers, order_prepared, prepare
from .quest.engine import QuestConfigError, default_config as quest_default, validate_config as validate_quest
from .projection.presets import PRESETS, listing as preset_listing
from .tracking.pipeline import TrackingPipeline

log = logging.getLogger("playground")
LOOPBACK = {"127.0.0.1", "::1", "localhost"}
CLIENT_CUES = {"clap"}
DISPLAY_COMMANDS = {"hello", "output-size"}  # the only commands a paired network display may send


def is_local(host: str | None) -> bool:
    return host in LOOPBACK


async def local_only(request: Request) -> None:
    if not is_local(request.client.host if request.client else None):
        raise HTTPException(403, "this endpoint is only available on the laptop itself")


DISPLAY_COOKIE = "pg_display"


def _display_ok(request, token: str) -> bool:
    """True when the request carries the cookie set by /pair (a paired network display, e.g. the projector's browser)."""
    got = request.cookies.get(DISPLAY_COOKIE, "")
    return bool(got) and hmac.compare_digest(got, token)


async def local_or_display(request: Request) -> None:
    """Read-only resources the game window needs (media files, the Quest photo): the laptop or a paired display."""
    if is_local(request.client.host if request.client else None) or _display_ok(request, request.app.state.pg.display_token):
        return
    raise HTTPException(403, "pair this display first: open the projector link shown in the control panel")


class AppState:
    def __init__(self, data_dir: Path | None = None, detector_factory=None, pose_factory=None):
        self.settings_store = config.JsonStore("settings.json", config.DEFAULT_SETTINGS, data_dir)
        self.scene_store = config.JsonStore("scene.json", config.DEFAULT_SCENE, data_dir)
        self.interactions: dict[str, int] = {}  # surface name -> times a hand woke/changed it (reported by the game window)
        self._interaction_logged: dict[str, float] = {}
        self.cal_store = config.JsonStore("calibration.json", Calibration().to_dict(), data_dir)
        self.data_dir = data_dir or config.DATA_DIR
        self.hub = Hub()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.settings = self.settings_store.load()
        self.scene = self.scene_store.load()
        try:
            self.calibration = Calibration.from_dict(self.cal_store.load())
        except CalibrationError:
            self.calibration = Calibration()
        self.detector_factory = detector_factory or self._mediapipe_factory
        self.quest_store = config.JsonStore("quest.json", quest_default(), data_dir)
        try:
            self.quest = validate_quest(self.quest_store.load())
        except QuestConfigError:
            self.quest = quest_default()
        self.pipeline = TrackingPipeline(self.detector_factory, self.settings["tracking"], self.calibration, self._publish, pose_factory=pose_factory)
        self.pipeline.zones.configure(self.quest)
        self.pipeline.cues_enabled = self.settings["cues"]["enabled"]
        self.latency = LatencyProbe()
        self.events = EventLog()
        self.monitor = HealthMonitor(self.events)
        self.started = time.time()
        self.displays: dict[int, dict] = {}  # websocket id -> latest report from a game window
        self._ips: list[str] = []
        self._ips_t = 0.0
        self.receiver = CameraReceiver(self._on_frame, self._on_camera_change)
        self.token = self._load_token()
        self.display_token = self._load_token("display_token")

    # -- helpers ---------------------------------------------------------
    @staticmethod
    def _mediapipe_factory(cfg: dict, complexity: int):
        from .tracking.detector import MediaPipeDetector
        return MediaPipeDetector(cfg["maxHands"], complexity, cfg["minConfidence"], cfg["minConfidence"])

    def _load_token(self, name: str = "camera_token") -> str:
        p = self.data_dir / name
        try:
            return p.read_text().strip()
        except FileNotFoundError:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            tok = secrets.token_urlsafe(9)
            p.write_text(tok)
            p.chmod(0o600)
            return tok

    def _publish(self, msg: dict) -> None:  # called from the tracking thread
        if self.loop:
            self.hub.broadcast_threadsafe(self.loop, msg)

    def _on_frame(self, frame, t_recv: float) -> None:
        self.latency.feed(frame, t_recv)
        self.pipeline.submit(frame, t_recv)

    def _on_camera_change(self) -> None:
        if self.loop:
            asyncio.ensure_future(self.hub.broadcast(self.stats(), remember=True))

    def stats(self) -> dict:
        return {"type": "stats", "camera": self.receiver.stats(), "tracking": self.pipeline.stats(),
                "calibrated": self.calibration.calibrated, "interactions": dict(self.interactions), "t": time.time()}

    def health_inputs(self) -> dict:
        cam = self.receiver.stats()
        now = time.monotonic()
        cam["frameAge"] = self.receiver.frame_age()
        cam["stateAge"] = now - self.receiver.state_since
        trk = self.pipeline.stats()
        trk.update(self.pipeline.health())
        displays = [{"fps": d["fps"], "age": now - d["seen"]} for d in self.displays.values()]
        from .tracking.pose import model_available
        return {"mode": self.pipeline.mode, "poseModel": model_available() or self.pipeline._pose_factory is not None,
                "camera": cam, "tracking": trk, "displays": displays, "calibrated": self.calibration.calibrated,
                "httpsEnabled": config.HTTPS_ENABLED, "ips": self._ips}

    async def watchdog(self) -> None:
        """Self-healing: restart a dead tracking thread; drop a camera session that went silent so the phone reconnects."""
        if self.pipeline.ensure_alive():
            self.events.add("error", "tracking", "Tracking thread had died; restarted it")
        age = self.receiver.frame_age()
        if self.receiver.state == "connected" and age is not None and age > 10:
            self.events.add("error", "camera", f"No camera frames for {age:.0f} s; resetting the session so the phone can reconnect")
            await self.receiver.stop()

    def metrics(self) -> dict:
        cam, trk = self.receiver.stats(), self.pipeline.stats()
        h = self.pipeline.health()
        disp = [d["fps"] for d in self.displays.values()]
        return {
            "uptime_seconds": ("Seconds since the server started", round(time.time() - self.started)),
            "health_status": ("0 ok, 1 degraded, 2 down", {"ok": 0, "degraded": 1, "down": 2}[self.monitor.report["status"]]),
            "camera_connected": ("1 when a phone is streaming", int(cam["state"] == "connected")),
            "camera_fps": ("Camera frames per second received", cam["fps"]),
            "camera_frames_total": ("Camera frames received", self.receiver.frames),
            "tracking_fps": ("Frames per second processed by tracking", trk["fps"]),
            "tracking_ms": ("Average tracking time per frame (ms)", trk["procMs"]),
            "tracking_latency_ms": ("Average delay from frame arrival to hands published (ms)", trk["latencyMs"]),
            "tracking_level": ("Quality level, 0 best", trk["level"]),
            "tracking_errors_total": ("Frames that failed in tracking", trk["errors"]),
            "tracking_frames_dropped_total": ("Frames skipped because tracking was busy", self.pipeline.frames_dropped),
            "tracking_thread_alive": ("1 when the tracking thread runs", int(h["alive"])),
            "cues_total": ("Cues fired (presence, gestures, claps)", sum(self.pipeline.cue_counts.values())),
            "display_windows": ("Game windows reporting", len(disp)),
            "display_fps": ("Lowest reported game render rate", min(disp) if disp else 0),
        }

    async def stats_loop(self) -> None:
        while True:
            await asyncio.sleep(1.0)
            try:
                if time.monotonic() - self._ips_t > 30:  # `hostname -I` is a subprocess: refresh rarely, off the event loop
                    self._ips_t = time.monotonic()
                    self._ips = [i for i in await asyncio.to_thread(netinfo.lan_ips) if not i.startswith(("172.17.", "169.254."))]
                self.displays = {k: v for k, v in self.displays.items() if time.monotonic() - v["seen"] < 30}
                await self.watchdog()
                report = self.monitor.update(self.health_inputs())
                await self.hub.broadcast({"type": "health", **report}, remember=True)
            except Exception:  # the monitor must never take the stats loop down
                log.exception("health evaluation failed")
            await self.hub.broadcast(self.stats(), remember=True)


def create_app(state: AppState | None = None) -> FastAPI:
    st = state or AppState()

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        st.loop = asyncio.get_running_loop()
        st.pipeline.start()
        st.events.add("info", "server", "Server started")
        stats_task = asyncio.ensure_future(st.stats_loop())
        await st.hub.broadcast({"type": "settings", "settings": st.settings}, remember=True)
        await st.hub.broadcast({"type": "scene", "scene": st.scene}, remember=True)
        await st.hub.broadcast({"type": "calibration", "calibration": st.calibration.to_dict()}, remember=True)
        await st.hub.broadcast({"type": "quest", "quest": st.quest}, remember=True)
        try:
            yield
        finally:
            stats_task.cancel()
            st.events.add("info", "server", "Server stopping")
            await st.receiver.stop()
            st.pipeline.stop()

    app = FastAPI(title="Butterfly Playground", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.pg = st

    # -- settings / scene / calibration ---------------------------------
    @app.get("/api/settings", dependencies=[Depends(local_only)])
    async def get_settings():
        return st.settings

    @app.put("/api/settings", dependencies=[Depends(local_only)])
    async def put_settings(body: dict = Body(...)):
        merged = config.deep_merge(st.settings, body)
        t = merged["tracking"]
        for k, lo, hi in (("maxHands", 1, 4), ("minCutoff", 0.05, 10), ("beta", 0, 100), ("holdMs", 0, 3000),
                          ("minConfidence", 0.1, 0.99), ("targetFps", 5, 60), ("maxDegrade", 0, 3)):
            if not isinstance(t.get(k), (int, float)) or not lo <= t[k] <= hi:
                raise HTTPException(422, f"tracking.{k} must be a number in [{lo}, {hi}]")
        if not isinstance(t.get("handsFromPose"), bool):
            raise HTTPException(422, "tracking.handsFromPose must be true or false")
        if t.get("mode") not in ("hands", "pose"):
            raise HTTPException(422, "tracking.mode must be hands|pose")
        if not isinstance(merged.get("cues", {}).get("enabled"), bool):
            raise HTTPException(422, "cues.enabled must be true or false")
        o = merged["output"]
        if o.get("mode") not in ("fill", "fixed") or o.get("fit") not in ("contain", "stretch"):
            raise HTTPException(422, "output.mode must be fill|fixed and output.fit contain|stretch")
        for k in ("width", "height"):
            if not isinstance(o.get(k), int) or not 160 <= o[k] <= 7680:
                raise HTTPException(422, f"output.{k} must be an integer in [160, 7680]")
        gm = merged["game"]
        if gm.get("difficulty") not in ("easy", "normal", "hard"):
            raise HTTPException(422, "game.difficulty must be easy|normal|hard")
        for k, lo, hi in (("shyCount", 1, 60), ("shySize", 0.3, 3.0)):
            if not isinstance(gm.get(k), (int, float)) or isinstance(gm.get(k), bool) or not lo <= gm[k] <= hi:
                raise HTTPException(422, f"game.{k} must be a number in [{lo}, {hi}]")
        st.settings = st.settings_store.save(merged)
        st.pipeline.configure(st.settings["tracking"])
        st.pipeline.cues_enabled = st.settings["cues"]["enabled"]
        await st.hub.broadcast({"type": "settings", "settings": st.settings}, remember=True)
        return st.settings

    @app.get("/api/scene", dependencies=[Depends(local_only)])
    async def get_scene():
        return st.scene

    @app.put("/api/scene", dependencies=[Depends(local_only)])
    async def put_scene(body: dict = Body(...)):
        from .projection.scene import validate_scene, SceneError
        try:
            scene = validate_scene(body)
        except SceneError as e:
            raise HTTPException(422, str(e))
        st.scene = st.scene_store.save(scene)
        await st.hub.broadcast({"type": "scene", "scene": st.scene}, remember=True)
        return st.scene

    @app.get("/api/presets", dependencies=[Depends(local_only)])
    async def presets():
        return {"presets": preset_listing()}

    @app.post("/api/presets/{name}/apply", dependencies=[Depends(local_only)])
    async def apply_preset(name: str):
        if name not in PRESETS:
            raise HTTPException(404, f"no preset called {name!r}")
        st.scene = st.scene_store.save(PRESETS[name]["scene"])
        st.events.add("info", "scene", f"Applied layout preset {name!r}")
        await st.hub.broadcast({"type": "scene", "scene": st.scene}, remember=True)
        return st.scene

    @app.get("/api/calibration", dependencies=[Depends(local_only)])
    async def get_cal():
        return st.calibration.to_dict()

    async def _set_cal(cal: Calibration):
        st.calibration = cal
        st.pipeline.set_calibration(cal)
        st.cal_store.save(cal.to_dict())
        await st.hub.broadcast({"type": "calibration", "calibration": cal.to_dict()}, remember=True)
        return cal.to_dict()

    @app.post("/api/calibration/solve", dependencies=[Depends(local_only)])
    async def solve_cal(body: dict = Body(...)):
        try:
            cal = Calibration.from_dict({**body, "matrix": None, "extra_grids": []}).solve()
        except CalibrationError as e:
            raise HTTPException(422, str(e))
        old = st.calibration
        if (cal.mirror, cal.rotation) == (old.mirror, old.rotation):
            cal.extra_grids = list(old.extra_grids)  # re-solving the main grid keeps the other regions
        return await _set_cal(cal)

    @app.put("/api/calibration/base", dependencies=[Depends(local_only)])
    async def put_cal_base(body: dict = Body(...)):
        """Change mirror/rotation. Invalidates any solved homography (its points were in the old orientation)."""
        try:
            cal = Calibration.from_dict({"mirror": body.get("mirror", False), "rotation": body.get("rotation", 0)})
        except CalibrationError as e:
            raise HTTPException(422, str(e))
        return await _set_cal(cal)

    @app.post("/api/calibration/grids/{gid}", dependencies=[Depends(local_only)])
    async def put_grid(gid: str, body: dict = Body(...)):
        """Create or replace an extra calibrated region (another wall or section). 'main' is set via /solve."""
        if gid == "main":
            raise HTTPException(422, "use /api/calibration/solve for the main grid")
        try:
            g = Grid.build(gid, body.get("name", ""), body.get("camera_points", []), body.get("screen_points", []))
        except CalibrationError as e:
            raise HTTPException(422, str(e))
        cal = Calibration.from_dict(st.calibration.to_dict())
        others = [x for x in cal.extra_grids if x.id != gid]
        if len(others) + 1 >= MAX_GRIDS:
            raise HTTPException(422, f"at most {MAX_GRIDS} grids")
        cal.extra_grids = others + [g]
        st.events.add("info", "calibration", f"Calibrated grid {g.name!r}")
        return await _set_cal(cal)

    @app.delete("/api/calibration/grids/{gid}", dependencies=[Depends(local_only)])
    async def delete_grid(gid: str):
        cal = Calibration.from_dict(st.calibration.to_dict())
        if not any(x.id == gid for x in cal.extra_grids):
            raise HTTPException(404, f"no grid {gid!r}")
        cal.extra_grids = [x for x in cal.extra_grids if x.id != gid]
        return await _set_cal(cal)

    @app.post("/api/calibration/auto", dependencies=[Depends(local_only)])
    async def auto_cal(body: dict = Body(...)):
        """Project four bright discs at the screen corners, photograph them with the camera and return where they appear
        (prepared space). The caller then solves with the same screen points. Needs a game window open on the projector."""
        try:
            scr = [(float(a), float(b)) for a, b in body.get("screen_points", [])]
            mirror, rot = bool(body.get("mirror", False)), int(body.get("rotation", 0))
            prepare(0.5, 0.5, mirror, rot)
        except (TypeError, ValueError, CalibrationError):
            raise HTTPException(422, "screen_points must be 4 [x,y] pairs and rotation a multiple of 90")
        if len(scr) != 4 or not all(0 <= v <= 1 for p in scr for v in p):
            raise HTTPException(422, "need 4 screen points inside the screen")
        if not st.displays:
            raise HTTPException(409, "no game window is open; open the game window on the projector first")

        async def grab(mode: str):
            await st.hub.broadcast({"type": "command", "cmd": "calib", "show": True, "points": scr, "mode": mode})
            t0 = time.monotonic() + 1.0  # let the projector draw it and the camera/stream catch up
            await asyncio.sleep(1.0)
            for _ in range(40):
                fr = st.pipeline.latest_frame()
                if fr and fr[0] >= t0:
                    return fr[1].copy()
                await asyncio.sleep(0.1)
            raise HTTPException(409, "no fresh camera frames; is the camera connected?")
        try:
            on = await grab("discs")
            off = await grab("black")
        finally:
            await st.hub.broadcast({"type": "command", "cmd": "calib", "show": True, "points": scr, "mode": "grid"})
        try:
            pts = order_prepared(find_markers(on, off), mirror, rot)
        except CalibrationError as e:
            st.events.add("warning", "calibration", f"Auto-detect failed: {e}")
            raise HTTPException(422, str(e))
        st.events.add("info", "calibration", "Auto-detect found the four projected corners")
        return {"camera_points": [list(p) for p in pts]}

    @app.delete("/api/calibration", dependencies=[Depends(local_only)])
    async def reset_cal():
        old = st.calibration
        return await _set_cal(Calibration(mirror=old.mirror, rotation=old.rotation))

    # -- camera ----------------------------------------------------------
    @app.post("/api/camera/offer")
    async def camera_offer(body: dict = Body(...)):
        if not hmac.compare_digest(str(body.get("token", "")), st.token):
            raise HTTPException(403, "bad camera token - open the link shown on the laptop")
        try:
            return await st.receiver.handle_offer(body.get("sdp", ""), body.get("type", ""))
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.post("/api/camera/stop")
    async def camera_stop(request: Request, body: dict = Body(default={})):
        local = is_local(request.client.host if request.client else None)
        if not local and not hmac.compare_digest(str(body.get("token", "")), st.token):
            raise HTTPException(403, "bad camera token")
        await st.receiver.stop()
        st.pipeline.tracker.reset()
        return {"ok": True}

    @app.get("/api/preview.jpg", dependencies=[Depends(local_only)])
    async def preview():
        data = st.pipeline.want_preview()
        if not data:
            return Response(status_code=204)
        return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.get("/api/stats", dependencies=[Depends(local_only)])
    async def get_stats():
        return st.stats()

    # -- Playroom Quest ---------------------------------------------------
    quest_photo = lambda: st.data_dir / "quest_photo.jpg"  # noqa: E731

    @app.get("/api/quest", dependencies=[Depends(local_only)])
    async def get_quest():
        return {**st.quest, "hasPhoto": quest_photo().is_file()}

    @app.put("/api/quest", dependencies=[Depends(local_only)])
    async def put_quest(body: dict = Body(...)):
        try:
            cfg = validate_quest(body)
        except QuestConfigError as e:
            raise HTTPException(422, str(e))
        st.quest = st.quest_store.save(cfg)
        st.pipeline.zones.configure(cfg)
        await st.hub.broadcast({"type": "quest", "quest": st.quest}, remember=True)
        return st.quest

    @app.get("/api/quest/photo.jpg", dependencies=[Depends(local_or_display)])
    async def get_quest_photo():
        if not quest_photo().is_file():
            return Response(status_code=204)  # "no photo yet" is a normal state, not an error
        return Response(quest_photo().read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.post("/api/quest/photo", dependencies=[Depends(local_only)])
    async def post_quest_photo(request: Request):
        """Save the playroom photo (stays in data/, never leaves the laptop). Body = raw image bytes, or empty to use the latest camera frame."""
        import cv2
        import numpy as np
        raw = await request.body()
        if len(raw) > 12_000_000:
            raise HTTPException(413, "photo too large (max 12 MB)")
        if raw:
            img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if img is None or min(img.shape[:2]) < 64:
                raise HTTPException(422, "that is not a usable image (JPEG or PNG, at least 64 px)")
        else:
            data = st.pipeline.snapshot_jpeg()
            if data is None:
                raise HTTPException(409, "the camera is not streaming, so there is no frame to use; upload a photo instead")
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        s = min(1.0, 1600 / max(img.shape[:2]))
        if s < 1.0:
            img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        quest_photo().write_bytes(buf.tobytes())
        quest_photo().chmod(0o600)
        st.events.add("info", "quest", f"Playroom photo saved ({img.shape[1]}x{img.shape[0]})")
        return {"ok": True, "width": img.shape[1], "height": img.shape[0]}

    @app.delete("/api/quest/photo", dependencies=[Depends(local_only)])
    async def delete_quest_photo():
        quest_photo().unlink(missing_ok=True)
        return {"ok": True}

    # -- health / observability ------------------------------------------
    @app.get("/api/health", dependencies=[Depends(local_only)])
    async def health():
        return st.monitor.report if st.monitor.report["checks"] else evaluate(st.health_inputs())

    @app.get("/api/events", dependencies=[Depends(local_only)])
    async def events(after: int = 0, limit: int = 200):
        return {"events": st.events.since(after, min(max(limit, 1), 500))}

    @app.get("/api/metrics", dependencies=[Depends(local_only)])
    async def metrics():
        return Response(prometheus(st.metrics()), media_type="text/plain; version=0.0.4")

    # -- latency probe (setup page) -------------------------------------
    @app.post("/api/latency/arm", dependencies=[Depends(local_only)])
    async def latency_arm(body: dict = Body(default={})):
        seconds = body.get("seconds", 30)
        if not isinstance(seconds, (int, float)) or isinstance(seconds, bool):
            raise HTTPException(422, "seconds must be a number")
        st.latency.arm(float(seconds), time.time())
        return {"ok": True, "camera": st.receiver.stats()}

    @app.post("/api/latency/analyze", dependencies=[Depends(local_only)])
    async def latency_analyze(body: dict = Body(...)):
        flashes = body.get("flashes")
        if (not isinstance(flashes, list) or not 1 <= len(flashes) <= 50
                or not all(isinstance(t, (int, float)) and not isinstance(t, bool) for t in flashes)):
            raise HTTPException(422, "flashes must be 1-50 wall-clock times in seconds")
        res = st.latency.analyze([float(t) for t in flashes])
        res["trackingMs"] = st.pipeline.stats().get("procMs")
        return res

    # -- info / media ----------------------------------------------------
    @app.get("/api/info", dependencies=[Depends(local_only)])
    async def info():
        ips = [i for i in netinfo.lan_ips() if not i.startswith(("172.17.", "169.254."))]  # skip docker/link-local
        urls = [f"https://{ip}:{config.HTTPS_PORT}/camera.html?k={st.token}" for ip in ips]
        svg = ""
        if urls and config.HTTPS_ENABLED:
            buf = io.BytesIO()
            segno.make(urls[0], error="m").save(buf, kind="svg", scale=6, border=2, dark="#222", light="#fff", omitsize=True)
            svg = buf.getvalue().decode()
        durls = [f"https://{ip}:{config.HTTPS_PORT}/pair?d={st.display_token}" for ip in ips] if config.HTTPS_ENABLED else []
        dsvg = ""
        if durls:
            buf = io.BytesIO()
            segno.make(durls[0], error="m").save(buf, kind="svg", scale=6, border=2, dark="#222", light="#fff", omitsize=True)
            dsvg = buf.getvalue().decode()
        return {"ips": ips, "cameraUrls": urls if config.HTTPS_ENABLED else [], "qrSvg": svg, "displayUrls": durls, "displayQrSvg": dsvg,
                "httpsEnabled": config.HTTPS_ENABLED, "displays": netinfo.displays()}

    @app.get("/pair")
    async def pair(request: Request, d: str = ""):
        """Open on the projector's browser (from the QR code / link in the control panel): sets a cookie that lets this
        browser show the game (read-only), then goes to the game page."""
        if not hmac.compare_digest(d, st.display_token):
            st.events.add("warning", "display", f"Display pairing refused (wrong token) from {request.client.host if request.client else '?'}")
            raise HTTPException(403, "wrong or old pairing link; scan the current QR code in the control panel")
        resp = RedirectResponse("/play.html?autofs=1", status_code=303)
        resp.set_cookie(DISPLAY_COOKIE, st.display_token, max_age=365 * 86400, httponly=True, samesite="lax", secure=request.url.scheme == "https")
        st.events.add("info", "display", f"Display paired from {request.client.host if request.client else '?'}")
        return resp

    @app.post("/api/display/reset", dependencies=[Depends(local_only)])
    async def reset_display():
        """Revoke every paired display: new token, remote sockets dropped. Re-pair by scanning the new QR code."""
        (st.data_dir / "display_token").unlink(missing_ok=True)
        st.display_token = st._load_token("display_token")
        await st.hub.drop_remote()
        st.events.add("info", "display", "Display pairing reset; all network displays disconnected")
        return {"ok": True}

    @app.get("/api/media", dependencies=[Depends(local_only)])
    async def list_media():
        files = []
        if config.MEDIA_DIR.is_dir():
            for p in sorted(config.MEDIA_DIR.rglob("*")):
                if p.is_file() and p.suffix.lower() in config.MEDIA_EXTENSIONS:
                    rel = p.relative_to(config.MEDIA_DIR).as_posix()
                    files.append({"name": rel, "url": "/media/" + rel, "size": p.stat().st_size,
                                  "kind": "image" if p.suffix.lower() in config.IMAGE_EXTENSIONS else "video"})
        return {"files": files}

    @app.get("/media/{path:path}", dependencies=[Depends(local_or_display)])
    async def media(path: str):
        base = config.MEDIA_DIR.resolve()
        f = (base / path).resolve()
        if base not in f.parents or not f.is_file() or f.suffix.lower() not in config.MEDIA_EXTENSIONS:
            raise HTTPException(404)
        headers = {"Content-Security-Policy": "sandbox"} if f.suffix.lower() == ".svg" else None  # an SVG opened directly cannot run scripts
        return FileResponse(f, headers=headers)  # Range requests supported (video seeking)

    # -- websocket -------------------------------------------------------
    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        host = websocket.client.host if websocket.client else None
        remote = False
        if not is_local(host):
            if not _display_ok(websocket, st.display_token):  # only a paired display (cookie from /pair) may connect from the network
                await websocket.close(code=1008)
                return
            remote = True
        await st.hub.connect(websocket, remote=remote)
        try:
            while True:
                msg = json.loads(await websocket.receive_text())
                if msg.get("type") == "command":  # relay UI commands (start game, show calibration, ...)
                    if remote and msg.get("cmd") not in DISPLAY_COMMANDS:  # a paired display is read-only: it may only announce itself
                        continue
                    await st.hub.broadcast(msg, exclude=websocket)
                elif msg.get("type") == "cue" and msg.get("name") in CLIENT_CUES:  # e.g. a clap heard by a game window
                    st.pipeline.cue_counts[msg["name"]] = st.pipeline.cue_counts.get(msg["name"], 0) + 1
                    await st.hub.broadcast({"type": "cue", "name": msg["name"], "source": "client", "t": time.time()}, exclude=websocket)
                elif msg.get("type") == "activity" and isinstance(msg.get("name"), str) and msg.get("kind") in ("wake", "next"):
                    name, now = msg["name"][:60], time.monotonic()  # a surface reacted to a hand: count it, log it at most every 5 s per surface
                    if name in st.interactions or len(st.interactions) < 100:
                        st.interactions[name] = st.interactions.get(name, 0) + 1
                    if now - st._interaction_logged.get(name, -99) > 5:
                        st._interaction_logged[name] = now
                        st.events.add("info", "interaction", f"{name!r}: {'woke up' if msg['kind'] == 'wake' else 'changed to the next item'} (hand)")
                elif msg.get("type") == "report" and isinstance(msg.get("fps"), (int, float)):  # game window self-report
                    st.displays[id(websocket)] = {"fps": float(msg["fps"]), "seen": time.monotonic()}
        except (WebSocketDisconnect, json.JSONDecodeError):
            pass
        finally:
            st.hub.disconnect(websocket)
            st.displays.pop(id(websocket), None)

    @app.get("/")
    async def root():
        return RedirectResponse("/index.html")

    class NoCacheStatic(StaticFiles):
        async def get_response(self, path, scope):
            resp = await super().get_response(path, scope)
            resp.headers["Cache-Control"] = "no-cache"
            return resp

    app.mount("/", NoCacheStatic(directory=config.FRONTEND_DIR, html=True), name="frontend")
    return app


class _QuietServer(uvicorn.Server):
    @contextlib.contextmanager
    def capture_signals(self):  # only the primary server handles Ctrl-C
        yield


async def serve() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    log_path = setup_file_logging(config.DATA_DIR / "logs")
    logging.getLogger("aioice").setLevel(logging.WARNING)
    logging.getLogger("aiortc").setLevel(logging.WARNING)
    app = create_app()
    logging.getLogger().addHandler(EventLogHandler(app.state.pg.events))
    http = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=config.HTTP_PORT, log_level="warning"))
    servers = [http]
    ips = netinfo.lan_ips()
    if config.HTTPS_ENABLED:
        crt, key = ensure_cert(config.DATA_DIR / "certs", ips)
        https = _QuietServer(uvicorn.Config(app, host="0.0.0.0", port=config.HTTPS_PORT, log_level="warning",
                                            ssl_certfile=str(crt), ssl_keyfile=str(key)))
        servers.append(https)
    token = app.state.pg.token
    print("\n  Butterfly Playground is running\n")
    print(f"  Game / control (this laptop):  http://localhost:{config.HTTP_PORT}/")
    if config.HTTPS_ENABLED:
        for ip in [i for i in ips if not i.startswith(("172.17.", "169.254."))][:2]:
            print(f"  iPhone camera page:            https://{ip}:{config.HTTPS_PORT}/camera.html?k={token}")
            print(f"  Projector's own browser:       https://{ip}:{config.HTTPS_PORT}/pair?d={app.state.pg.display_token}   (or HDMI + 'Open game')")
    print(f"  Health check:                  http://localhost:{config.HTTP_PORT}/api/health   (log: {log_path})")
    print("  Stop with Ctrl-C.\n")
    tasks = [asyncio.ensure_future(s.serve()) for s in servers]
    await tasks[0]
    for s in servers[1:]:
        s.should_exit = True
    await asyncio.gather(*tasks, return_exceptions=True)


def run() -> None:
    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    run()
