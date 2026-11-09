import numpy as np
import pytest

from app.tracking.hands import RawHand


def make_hand(cx=0.5, cy=0.5, size=0.1, conf=0.9, label="Right"):
    """Synthetic 21-landmark hand centred near (cx, cy). Palm centre == (cx, cy) by construction."""
    lms = [(cx, cy)] * 21
    lms = [(cx + (i % 5 - 2) * size * 0.1, cy + (i // 5 - 2) * size * 0.1) for i in range(21)]
    # force wrist + 4 MCPs to average exactly to (cx, cy)
    for i in (0, 5, 9, 13, 17):
        lms[i] = (cx, cy)
    return RawHand(lms, conf, label)


class FakeDetector:
    """Detector stub: returns whatever `.next` holds. Records frames it was given."""

    def __init__(self, cfg=None, complexity=0):
        self.next: list[RawHand] = []
        self.frames = []
        self.complexity = complexity

    def detect(self, bgr):
        self.frames.append(bgr.shape)
        return self.next

    def set_complexity(self, c):
        self.complexity = c

    def close(self):
        pass


@pytest.fixture
def blank_frame():
    return np.zeros((240, 320, 3), np.uint8)
