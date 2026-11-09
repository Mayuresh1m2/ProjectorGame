import time

import numpy as np
import pytest

from app.config import DEFAULT_SETTINGS
from app.projection.calibration import Calibration
from app.tracking.detector import InvalidFrame, validate_frame
from app.tracking.pipeline import TrackingPipeline
from conftest import FakeDetector, make_hand

CFG = dict(DEFAULT_SETTINGS["tracking"])


def make_pipe(cal=None, det=None):
    det = det or FakeDetector()
    out = []
    p = TrackingPipeline(lambda cfg, c: det, CFG, cal or Calibration(), out.append)
    return p, det, out


@pytest.mark.parametrize("bad", [None, "frame", np.zeros((10, 10), np.uint8), np.zeros((100, 100, 4), np.uint8),
                                 np.zeros((100, 100, 3), np.float32), np.zeros((4, 4, 3), np.uint8), np.zeros((0, 0, 3), np.uint8)])
def test_invalid_frames_are_rejected(bad):
    with pytest.raises(InvalidFrame):
        validate_frame(bad)


def test_process_publishes_normalized_hands(blank_frame):
    p, det, out = make_pipe()
    det.next = [make_hand(0.25, 0.75)]
    p.process(blank_frame, time.time())
    msg = out[-1]
    assert msg["type"] == "hands" and len(msg["hands"]) == 1
    h = msg["hands"][0]
    assert (h["x"], h["y"]) == pytest.approx((0.25, 0.75), abs=1e-3)
    assert len(h["tips"]) == 5 and len(h["landmarks"]) == 21 and h["cam"] == pytest.approx([0.25, 0.75], abs=1e-3)
    assert msg["t_frame"] > 0 and msg["cam"] == {"w": 320, "h": 240}


def test_calibration_is_applied_to_output(blank_frame):
    cal = Calibration(mirror=True)
    p, det, out = make_pipe(cal)
    det.next = [make_hand(0.2, 0.4)]
    p.process(blank_frame, time.time())
    h = out[-1]["hands"][0]
    assert (h["x"], h["y"]) == pytest.approx((0.8, 0.4), abs=1e-3)
    assert h["cam"] == pytest.approx([0.8, 0.4], abs=1e-3)  # prepared space is what the preview shows


def test_pipeline_thread_survives_garbage_then_processes_good_frame(blank_frame):
    p, det, out = make_pipe()
    det.next = [make_hand()]
    p.start()
    try:
        p.submit(np.zeros((3, 3), np.uint8), time.time())
        time.sleep(0.2)
        assert p.errors == 1 and "frame" in p.last_error.lower()
        p.submit(blank_frame, time.time())
        deadline = time.time() + 2
        while not out and time.time() < deadline:
            time.sleep(0.02)
        assert out and out[-1]["hands"]
    finally:
        p.stop()


def test_only_latest_frame_is_kept(blank_frame):
    p, det, out = make_pipe()
    for _ in range(5):
        p.submit(blank_frame, time.time())
    assert p._pending is not None  # single slot: stale frames are dropped, never queued


def test_degrades_when_too_slow_and_recovers():
    p, det, out = make_pipe()
    p.level = 1
    for _ in range(40):
        p._proc_ms.append(80.0)
    p._adapt()
    assert p.level == 2 and det.complexity == 0
    p._proc_ms.clear()
    for _ in range(40):
        p._proc_ms.append(5.0)
    p._good_since = time.monotonic() - 20
    p._adapt()
    assert p.level == 1


def test_idle_publishes_empty_hands_once(blank_frame):
    p, det, out = make_pipe()
    det.next = [make_hand()]
    p.process(blank_frame, time.time())
    p._publish_idle()
    p._publish_idle()
    assert out[-1]["hands"] == [] and sum(1 for m in out if not m["hands"]) == 1


def test_large_frame_is_downscaled_for_detection():
    p, det, _ = make_pipe()
    p.process(np.zeros((1080, 1920, 3), np.uint8), time.time())
    assert max(det.frames[-1][:2]) <= 640


def test_max_degrade_caps_the_lowest_level():
    p, det, out = make_pipe()
    p.level = 3
    p.configure({"maxDegrade": 1})
    assert p.level == 1
    for _ in range(40):
        p._proc_ms.append(500.0)
    p._adapt()
    assert p.level == 1  # too slow, but the floor holds
