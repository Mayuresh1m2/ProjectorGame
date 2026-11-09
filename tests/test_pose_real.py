"""Real MediaPipe pose on a public sample photo. Skipped unless the model and photo were downloaded
(scripts/fetch_models.sh, scripts/fetch_test_assets.sh)."""
from pathlib import Path

import pytest

from app.tracking.pose import MODEL_PATH, PoseDetector, PoseModelMissing, model_available

PHOTO = Path(__file__).parent / "assets" / "woman_hands.jpg"


def test_missing_model_gives_a_clear_error(monkeypatch):
    monkeypatch.setattr("app.tracking.pose.MODEL_PATH", Path("/nonexistent/model.task"))
    with pytest.raises(PoseModelMissing, match="fetch_models"):
        PoseDetector()


@pytest.mark.skipif(not (model_available() and PHOTO.exists()), reason="pose model or sample photo not downloaded")
def test_detects_one_person_with_33_landmarks():
    import cv2
    det = PoseDetector(max_poses=2)
    try:
        poses = det.detect(cv2.imread(str(PHOTO)))
    finally:
        det.close()
    assert len(poses) == 1 and len(poses[0]) == 33
    assert all(0 <= x <= 1 and 0 <= y <= 1 for x, y, _ in poses[0][:17])
