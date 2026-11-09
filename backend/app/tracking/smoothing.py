"""One-Euro filter: adaptive low-pass. Smooth when still (no jitter), responsive when fast (no lag)."""
from __future__ import annotations

import math


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuroFilter:
    def __init__(self, min_cutoff: float = 1.2, beta: float = 12.0, d_cutoff: float = 1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x: float | None = None
        self._dx = 0.0
        self._t: float | None = None

    def reset(self) -> None:
        self._x = None
        self._dx = 0.0
        self._t = None

    @property
    def velocity(self) -> float:
        return self._dx

    def __call__(self, x: float, t: float) -> float:
        if self._x is None or self._t is None:
            self._x, self._t, self._dx = x, t, 0.0
            return x
        dt = t - self._t
        if dt <= 1e-6:  # duplicate/out-of-order timestamp: keep previous estimate
            return self._x
        self._t = t
        dx = (x - self._x) / dt
        self._dx += _alpha(self.d_cutoff, dt) * (dx - self._dx)
        cutoff = self.min_cutoff + self.beta * abs(self._dx)
        self._x += _alpha(cutoff, dt) * (x - self._x)
        return self._x


class PointFilter:
    """2-D point smoothing built from two One-Euro filters."""

    def __init__(self, min_cutoff: float, beta: float):
        self.fx = OneEuroFilter(min_cutoff, beta)
        self.fy = OneEuroFilter(min_cutoff, beta)

    def __call__(self, x: float, y: float, t: float) -> tuple[float, float]:
        return self.fx(x, t), self.fy(y, t)

    @property
    def velocity(self) -> tuple[float, float]:
        return self.fx.velocity, self.fy.velocity
