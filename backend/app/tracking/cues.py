"""Cue detectors: turn camera frames and tracked hands into named events ("presence", "gesture-fist-open", ...).

Cues carry no identity: presence is plain motion in the picture, gestures are hand shapes. Nothing is stored.
"""
from __future__ import annotations

import math

import numpy as np

TIPS = (4, 8, 12, 16, 20)


def openness(landmarks) -> float:
    """Mean fingertip distance from the wrist, relative to palm length (wrist to middle knuckle). ~1 closed fist, ~2 open hand."""
    wx, wy = landmarks[0]
    palm = math.hypot(landmarks[9][0] - wx, landmarks[9][1] - wy) or 1e-6
    return sum(math.hypot(landmarks[i][0] - wx, landmarks[i][1] - wy) for i in TIPS) / len(TIPS) / palm


class MotionPresence:
    """Frame differencing on a tiny grey image. Emits "presence" when sustained motion starts after a quiet period
    and "presence-end" after `off_s` seconds without motion. Whole-picture brightness jumps (auto-exposure, a
    projector flash) are ignored so they are not mistaken for people."""

    def __init__(self, pixel_thr: int = 14, frac_thr: float = 0.015, on_s: float = 0.4, off_s: float = 4.0, exposure_jump: float = 12.0):
        self.pixel_thr, self.frac_thr, self.on_s, self.off_s, self.exposure_jump = pixel_thr, frac_thr, on_s, off_s, exposure_jump
        self.prev: np.ndarray | None = None
        self.present = False
        self._moving_since: float | None = None
        self._last_motion = 0.0
        self.level = 0.0

    def update(self, gray: np.ndarray, now: float) -> list[str]:
        g = gray.astype(np.float32)
        out: list[str] = []
        prev, self.prev = self.prev, g
        if prev is None or prev.shape != g.shape:
            return out
        if abs(float(g.mean()) - float(prev.mean())) > self.exposure_jump:
            self._moving_since = None
            return out
        self.level = float((np.abs(g - prev) > self.pixel_thr).mean())
        if self.level > self.frac_thr:
            self._last_motion = now
            if self._moving_since is None:
                self._moving_since = now
            if not self.present and now - self._moving_since >= self.on_s:
                self.present = True
                out.append("presence")
        else:
            self._moving_since = None
            if self.present and now - self._last_motion >= self.off_s:
                self.present = False
                out.append("presence-end")
        return out


class GestureDetector:
    """A closed fist that opens within `window_s` -> "gesture-fist-open" (with a cooldown). Two hands at once ->
    "two-hands" when the second one appears."""

    def __init__(self, closed: float = 1.25, opened: float = 1.7, hold_s: float = 0.12, window_s: float = 1.5, cooldown_s: float = 1.5):
        self.closed, self.opened, self.hold_s, self.window_s, self.cooldown_s = closed, opened, hold_s, window_s, cooldown_s
        self._state: dict[int, dict] = {}
        self._cool = 0.0
        self._had_two = False

    def update(self, hands, now: float) -> list[str]:
        out: list[str] = []
        ids = {h.id for h in hands}
        self._state = {k: v for k, v in self._state.items() if k in ids}
        for h in hands:
            o = openness(h.landmarks)
            s = self._state.setdefault(h.id, {"closed_since": None, "closed_at": None})
            if o < self.closed:
                s["closed_since"] = s["closed_since"] if s["closed_since"] is not None else now
                if now - s["closed_since"] >= self.hold_s:
                    s["closed_at"] = now
            else:
                s["closed_since"] = None
                if o > self.opened and s["closed_at"] is not None and now - s["closed_at"] <= self.window_s and now >= self._cool:
                    out.append("gesture-fist-open")
                    self._cool = now + self.cooldown_s
                    s["closed_at"] = None
        two = len(hands) >= 2
        if two and not self._had_two:
            out.append("two-hands")
        self._had_two = two
        return out
