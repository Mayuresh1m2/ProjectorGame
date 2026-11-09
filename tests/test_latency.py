import numpy as np
import pytest

from app.latency import LatencyProbe, mean_luma, measure_flashes


def synth(on_times, delay, fps=30, dark=20.0, bright=120.0, hold=0.9, start=0.0, end=20.0):
    """Camera luma samples for a screen that turns bright for `hold` s at each on-time, seen `delay` s later."""
    out, t = [], start
    while t < end:
        lit = any(on + delay <= t < on + delay + hold for on in on_times)
        out.append((t, bright if lit else dark))
        t += 1 / fps
    return out


def test_measures_known_delay_within_one_frame():
    ons = [2.0, 5.0, 8.3, 11.1]
    r = measure_flashes(synth(ons, delay=0.18), ons)
    assert r["valid"] == 4
    assert abs(r["medianMs"] - 180) <= 34  # one 30 fps frame


def test_no_flash_visible_is_reported_not_guessed():
    ons = [2.0, 5.0]
    flat = [(i / 30, 50.0) for i in range(600)]
    r = measure_flashes(flat, ons)
    assert r["valid"] == 0 and "medianMs" not in r
    assert all(not t["ok"] and "brightness change" in t["reason"] for t in r["trials"])


def test_no_frames_is_reported():
    r = measure_flashes([], [1.0])
    assert r["trials"][0]["reason"].startswith("no camera frames")


def test_late_flash_beyond_window_is_rejected():
    ons = [2.0]
    r = measure_flashes(synth(ons, delay=1.5, hold=2.0), ons)
    assert r["valid"] == 0


def test_mean_luma_ndarray():
    assert mean_luma(np.full((90, 160, 3), 100, np.uint8)) == pytest.approx(100)
    assert mean_luma(np.full((90, 160), 200, np.uint8)) == pytest.approx(200)


def test_probe_only_records_while_armed():
    p = LatencyProbe()
    f = np.full((18, 32, 3), 80, np.uint8)
    p.feed(f, 10.0)
    assert p.analyze([10.0])["frames"] == 0
    p.arm(5, now=100.0)
    p.feed(f, 101.0)
    p.feed(f, 106.0)  # after the armed window
    assert p.analyze([101.0])["frames"] == 1
    p.feed(f, 102.0)  # analyze disarmed it: nothing new is recorded
    assert p.analyze([102.0])["frames"] == 1
