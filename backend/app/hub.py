"""WebSocket hub: fan-out of hands/stats/scene to every connected page (output, control)."""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket

log = logging.getLogger("hub")


# What a paired network display (a projector's browser) may receive: everything a game window draws from, nothing else.
DISPLAY_TYPES = {"hands", "settings", "scene", "calibration", "stats", "health", "quest", "cue", "zone", "command"}


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.remote: set[WebSocket] = set()  # paired network displays: get only DISPLAY_TYPES
        self.state: dict[str, dict] = {}  # last message per type, replayed to new clients

    async def connect(self, ws: WebSocket, remote: bool = False) -> None:
        await ws.accept()
        self.clients.add(ws)
        if remote:
            self.remote.add(ws)
        for key in ("settings", "scene", "calibration", "stats", "health", "quest"):
            if key in self.state:
                await ws.send_text(self.state[key])

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)
        self.remote.discard(ws)

    async def drop_remote(self) -> None:
        """Disconnect every paired network display (used when the pairing token is reset)."""
        for ws in list(self.remote):
            self.disconnect(ws)
            try:
                await ws.close(code=1008)
            except Exception:
                pass

    async def broadcast(self, message: dict, remember: bool = False, exclude: WebSocket | None = None) -> None:
        text = json.dumps(message, separators=(",", ":"))
        if remember:
            self.state[message["type"]] = text
        dead = []
        allowed = message.get("type") in DISPLAY_TYPES
        for ws in list(self.clients):
            if ws is exclude or (ws in self.remote and not allowed):
                continue
            try:
                await ws.send_text(text)
            except Exception:  # client went away mid-send
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast_threadsafe(self, loop: asyncio.AbstractEventLoop, message: dict, remember: bool = False) -> None:
        if not self.clients and not remember:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(message, remember), loop)
