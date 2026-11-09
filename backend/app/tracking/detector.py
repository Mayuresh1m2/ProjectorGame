"""MediaPipe Hands wrapper. Only module that imports mediapipe; returns RawHand objects."""
from __future__ import annotations

import numpy as np

from .hands import RawHand


class InvalidFrame(ValueError):
    pass


def validate_frame(frame) -> np.ndarray:
    if frame is None or not isinstance(frame, np.ndarray):
        raise InvalidFrame("frame is not an ndarray")
    if frame.ndim != 3 or frame.shape[2] != 3 or frame.dtype != np.uint8:
        raise InvalidFrame(f"expected HxWx3 uint8 BGR frame, got {frame.shape} {frame.dtype}")
    if frame.shape[0] < 16 or frame.shape[1] < 16:
        raise InvalidFrame(f"frame too small: {frame.shape}")
    return frame


class MediaPipeDetector:
    def __init__(self, max_hands: int = 2, complexity: int = 0, min_detection: float = 0.5, min_tracking: float = 0.5):
        import mediapipe as mp  # imported lazily: heavy, and tests of other modules do not need it

        self._mp = mp
        self._args = dict(max_hands=max_hands, min_detection=min_detection, min_tracking=min_tracking)
        self.complexity = complexity
        self._hands = self._make()

    def _make(self):
        a = self._args
        return self._mp.solutions.hands.Hands(
            static_image_mode=False, max_num_hands=a["max_hands"], model_complexity=self.complexity,
            min_detection_confidence=a["min_detection"], min_tracking_confidence=a["min_tracking"],
        )

    def set_complexity(self, c: int) -> None:
        if c != self.complexity:
            self.complexity = c
            self._hands.close()
            self._hands = self._make()

    def detect(self, bgr: np.ndarray) -> list[RawHand]:
        validate_frame(bgr)
        rgb = bgr[:, :, ::-1]  # BGR -> RGB view; mediapipe needs contiguous
        res = self._hands.process(np.ascontiguousarray(rgb))
        out: list[RawHand] = []
        if not res.multi_hand_landmarks:
            return out
        for i, lm in enumerate(res.multi_hand_landmarks):
            cls = res.multi_handedness[i].classification[0]
            out.append(RawHand([(p.x, p.y) for p in lm.landmark], float(cls.score), cls.label))
        return out

    def close(self) -> None:
        self._hands.close()
