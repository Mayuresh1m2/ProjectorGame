"""Full-body pose detection (MediaPipe Pose Landmarker, up to 4 people) for Playroom Quest.

Needs the model file models/pose_landmarker_lite.task (scripts/fetch_models.sh downloads it once; after that
everything runs offline).
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from .. import config

MODEL_PATH = Path(os.environ.get("PLAYGROUND_POSE_MODEL", config.ROOT / "models" / "pose_landmarker_lite.task"))
KEY_JOINTS = (0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28)  # nose, shoulders, elbows, wrists, hips, knees, ankles


# (wrist, pinky, index, thumb) landmark ids for the left and right hand of a 33-point pose
_HAND_IDS = ((15, 17, 19, 21), (16, 18, 20, 22))


def pose_hands(pose, min_vis: float = 0.4) -> list:
    """Synthesize one RawHand per visible wrist of a pose, for games that expect hands.

    A wall-touching hand is often edge-on or a fist, which the hand model handles badly, but the arm is
    still clearly a body part. The hand point is the mean of the wrist/finger-base points the pose model
    can see; the fingertip is the index landmark. Only those two points are real: the other landmarks repeat
    the hand point, so games that use the full hand skeleton see a blob.
    """
    from .hands import NUM_LANDMARKS, RawHand
    hands = []
    for side, ids in zip(("Left", "Right"), _HAND_IDS):
        if pose[ids[0]][2] < min_vis:
            continue
        pts = [pose[i][:2] for i in ids if pose[i][2] >= min_vis]
        cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        tip = pose[ids[2]][:2] if pose[ids[2]][2] >= min_vis else (cx, cy)
        lm = [(cx, cy)] * NUM_LANDMARKS
        for i in (4, 8, 12, 16, 20):  # fingertip ids used by games
            lm[i] = tip
        hands.append(RawHand(landmarks=lm, confidence=float(pose[ids[0]][2]), handedness=side))
    return hands


class PoseModelMissing(RuntimeError):
    pass


def model_available() -> bool:
    return MODEL_PATH.is_file()


class PoseDetector:
    """detect(bgr) -> list of poses; each pose = 33 (x, y, visibility) tuples in normalized image coordinates."""

    def __init__(self, max_poses: int = 4, min_conf: float = 0.5):
        if not model_available():
            raise PoseModelMissing(f"pose model not found at {MODEL_PATH}; run scripts/fetch_models.sh")
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
        self._mp = mp
        opts = vision.PoseLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=str(MODEL_PATH)), running_mode=vision.RunningMode.VIDEO,
            num_poses=max_poses, min_pose_detection_confidence=min_conf, min_pose_presence_confidence=min_conf, min_tracking_confidence=min_conf)
        self._lm = vision.PoseLandmarker.create_from_options(opts)
        self._ts = 0

    def detect(self, bgr: np.ndarray) -> list[list[tuple[float, float, float]]]:
        import cv2
        rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        self._ts += 33  # VIDEO mode needs strictly increasing timestamps
        res = self._lm.detect_for_video(self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb), self._ts)
        return [[(l.x, l.y, getattr(l, "visibility", 1.0) or 0.0) for l in pose] for pose in res.pose_landmarks]

    def set_complexity(self, _c: int) -> None:  # level changes only change the input size for pose
        pass

    def close(self) -> None:
        try:
            self._lm.close()
        except Exception:
            pass
