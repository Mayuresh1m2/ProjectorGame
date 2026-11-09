"""Runs real MediaPipe on a photo of two hands. Skipped if tests/assets/woman_hands.jpg is absent
(it is the public MediaPipe test image; scripts/fetch_test_assets.sh downloads it)."""
import pathlib

import cv2
import numpy as np
import pytest

from app.tracking.hands import NUM_LANDMARKS

IMG = pathlib.Path(__file__).parent / "assets" / "woman_hands.jpg"
pytestmark = pytest.mark.skipif(not IMG.exists(), reason="test image not downloaded")


@pytest.fixture(scope="module")
def detector():
    from app.tracking.detector import MediaPipeDetector
    d = MediaPipeDetector(2, 0)
    yield d
    d.close()


def test_detects_two_hands_with_normalized_landmarks(detector):
    hands = detector.detect(cv2.imread(str(IMG)))
    assert len(hands) == 2
    for h in hands:
        assert len(h.landmarks) == NUM_LANDMARKS and h.confidence > 0.5
        assert all(0 <= x <= 1 and 0 <= y <= 1 for x, y in h.landmarks)


def test_no_hands_in_blank_frame(detector):
    assert detector.detect(np.full((480, 640, 3), 127, np.uint8)) == []


def test_pipeline_end_to_end_with_real_detector():
    import time
    from app.config import DEFAULT_SETTINGS
    from app.projection.calibration import Calibration
    from app.tracking.detector import MediaPipeDetector
    from app.tracking.pipeline import TrackingPipeline
    out = []
    p = TrackingPipeline(lambda cfg, c: MediaPipeDetector(2, c), dict(DEFAULT_SETTINGS["tracking"]), Calibration(mirror=True), out.append)
    img = cv2.imread(str(IMG))
    for i in range(6):
        p.process(img, time.time())
    hands = out[-1]["hands"]
    assert len(hands) == 2 and {h["id"] for h in hands} == {1, 2}  # ids stable across frames
    assert all(0 <= h["x"] <= 1 for h in hands)
    p.stop()
