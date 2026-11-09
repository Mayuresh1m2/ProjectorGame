"""Display-to-camera latency probe.

The setup page flashes the projector white at known wall-clock times; the phone camera sees the
flash and the server notes when the brighter frame arrives. Browser and server run on the same
laptop, so both timestamps come from the same clock. The result covers projector display delay,
phone capture/encode, Wi-Fi/WebRTC and decode -- everything except tracking and drawing, which the
stats panel measures separately.

Only a 32x18 mean-brightness number is kept per frame (never the image), and only while armed.
"""
from __future__ import annotations

import statistics
import threading
from collections import deque

import numpy as np

MIN_STEP = 6.0       # least brightness step (0-255) between dark and flash for a trial to count
MAX_ARM_S = 120.0


def mean_luma(frame) -> float:
    """Mean brightness (0-255) of an av.VideoFrame or an ndarray, from a tiny downscale."""
    if hasattr(frame, "reformat"):
        small = frame.reformat(width=32, height=18, format="gray").to_ndarray()
    else:
        a = np.asarray(frame)
        small = a if a.ndim == 2 else a[..., :3].mean(axis=2)
    return float(np.mean(small))


def measure_flashes(samples: list[tuple[float, float]], on_times: list[float], lead: float = 0.45,
                    settle: float = 0.5, hold: float = 0.35, max_wait: float = 1.2) -> dict:
    """samples: (t_arrival_s, luma) sorted by time; on_times: wall-clock seconds when each flash turned on.

    For each flash: dark level = median luma just before it, bright level = median luma `settle`..`settle+hold`
    seconds after it; latency = arrival time of the first frame past half the step, minus the flash time.
    """
    trials = []
    for t_on in on_times:
        before = [v for t, v in samples if t_on - lead <= t < t_on - 0.03]
        after = [v for t, v in samples if t_on + settle <= t <= t_on + settle + hold]
        if len(before) < 3 or len(after) < 3:
            trials.append({"t": t_on, "ok": False, "reason": "no camera frames around this flash"})
            continue
        dark, bright = statistics.median(before), statistics.median(after)
        step = bright - dark
        if step < MIN_STEP:
            trials.append({"t": t_on, "ok": False, "reason": f"camera saw only a {step:.1f}/255 brightness change"})
            continue
        level = dark + step / 2
        hit = next((t for t, v in samples if t >= t_on - 0.01 and v >= level), None)
        if hit is None or hit - t_on > max_wait:
            trials.append({"t": t_on, "ok": False, "reason": "flash not seen within 1.2 s"})
            continue
        trials.append({"t": t_on, "ok": True, "ms": round(max(0.0, hit - t_on) * 1000, 1), "step": round(step, 1)})
    good = sorted(t["ms"] for t in trials if t["ok"])
    out = {"trials": trials, "valid": len(good), "total": len(trials)}
    if good:
        out.update({"medianMs": round(statistics.median(good), 1), "minMs": good[0], "maxMs": good[-1]})
    return out


class LatencyProbe:
    def __init__(self, keep_s: float = 60.0, fps_cap: int = 60):
        self._lock = threading.Lock()
        self._samples: deque[tuple[float, float]] = deque(maxlen=int(keep_s * fps_cap))
        self._armed_until = 0.0

    def arm(self, seconds: float, now: float) -> None:
        with self._lock:
            self._samples.clear()
            self._armed_until = now + min(max(seconds, 1.0), MAX_ARM_S)

    def disarm(self) -> None:
        with self._lock:
            self._armed_until = 0.0

    def armed(self, now: float) -> bool:
        return now < self._armed_until

    def feed(self, frame, t_arrival: float) -> None:
        if not self.armed(t_arrival):
            return
        luma = mean_luma(frame)
        with self._lock:
            self._samples.append((t_arrival, luma))

    def analyze(self, on_times: list[float]) -> dict:
        with self._lock:
            samples = list(self._samples)
            self._armed_until = 0.0
        result = measure_flashes(samples, on_times)
        result["frames"] = len(samples)
        return result
