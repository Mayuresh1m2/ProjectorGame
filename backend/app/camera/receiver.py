"""WebRTC receiver: accepts the phone's video track and hands frames to the tracking pipeline.

Frames are never written to disk. Only the most recent frame is kept in memory.
"""
from __future__ import annotations

import asyncio
import logging
import time

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamError

log = logging.getLogger("camera")


class FpsCounter:
    def __init__(self, window: float = 2.0):
        self.window = window
        self.stamps: list[float] = []

    def tick(self, now: float | None = None) -> None:
        now = now or time.monotonic()
        self.stamps.append(now)
        cut = now - self.window
        while self.stamps and self.stamps[0] < cut:
            self.stamps.pop(0)

    @property
    def fps(self) -> float:
        if len(self.stamps) < 2:
            return 0.0
        span = self.stamps[-1] - self.stamps[0]
        return (len(self.stamps) - 1) / span if span > 0 else 0.0


class CameraReceiver:
    def __init__(self, on_frame, on_change=None):
        self.on_frame = on_frame      # callable(av_frame, t_recv)
        self.on_change = on_change    # callable() when state changes
        self.pc: RTCPeerConnection | None = None
        self.state = "idle"           # idle | connecting | connected | disconnected | failed
        self.width = 0
        self.height = 0
        self.fps = FpsCounter()
        self._task: asyncio.Task | None = None
        self.frames = 0
        self.last_frame = 0.0   # monotonic
        self.state_since = time.monotonic()

    def _set(self, state: str) -> None:
        if state != self.state:
            self.state = state
            self.state_since = time.monotonic()
            log.info("camera state: %s", state)
            if self.on_change:
                self.on_change()

    async def handle_offer(self, sdp: str, type_: str) -> dict:
        if type_ != "offer" or not sdp:
            raise ValueError("expected an SDP offer")
        await self.stop()  # one phone at a time; a new offer replaces the old session
        pc = RTCPeerConnection()
        self.pc = pc
        self._set("connecting")

        @pc.on("track")
        def on_track(track):
            if track.kind == "video":
                self._task = asyncio.ensure_future(self._consume(track, pc))

        @pc.on("connectionstatechange")
        async def on_state():
            if pc is not self.pc:
                return
            s = pc.connectionState
            if s == "connected":
                self._set("connected")
            elif s in ("failed", "closed", "disconnected"):
                self._set("disconnected" if s != "failed" else "failed")
                self.width = self.height = 0

        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type=type_))
        await pc.setLocalDescription(await pc.createAnswer())
        return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}

    async def _consume(self, track, pc) -> None:
        try:
            while pc is self.pc:
                frame = await track.recv()
                now = time.time()
                self.fps.tick()
                self.frames += 1
                self.last_frame = time.monotonic()
                self.width, self.height = frame.width, frame.height
                try:
                    self.on_frame(frame, now)
                except Exception:
                    log.exception("frame handler failed")
        except MediaStreamError:
            pass
        except asyncio.CancelledError:
            raise
        finally:
            if pc is self.pc:
                self.width = self.height = 0

    async def stop(self) -> None:
        pc, self.pc = self.pc, None
        if pc is not None:
            await pc.close()
        if self._task:
            self._task.cancel()
            self._task = None
        self.fps = FpsCounter()
        self.width = self.height = 0
        self.last_frame = 0.0
        self._set("idle")

    def frame_age(self) -> float | None:
        return time.monotonic() - self.last_frame if self.last_frame else None

    def stats(self) -> dict:
        return {"state": self.state, "fps": round(self.fps.fps, 1), "width": self.width, "height": self.height}
