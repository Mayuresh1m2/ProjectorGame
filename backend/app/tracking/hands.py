"""Hand data model + pure helpers (independent of MediaPipe and of the game).

All coordinates are normalized: x, y in 0.0..1.0 (clamped), origin top-left of the image.
MediaPipe landmark indices: 0 wrist, 4/8/12/16/20 thumb..pinky tips, 5/9/13/17 finger bases.
"""
from __future__ import annotations

from dataclasses import dataclass, field

FINGERTIP_IDS = (4, 8, 12, 16, 20)
PALM_IDS = (0, 5, 9, 13, 17)
NUM_LANDMARKS = 21


def clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else v


def normalize_point(x: float, y: float, width: float = 1.0, height: float = 1.0) -> tuple[float, float]:
    """Pixel (or already-normalized when width=height=1) coordinates -> clamped 0..1."""
    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    return clamp01(x / width), clamp01(y / height)


def palm_center(landmarks: list[tuple[float, float]]) -> tuple[float, float]:
    """Palm center: mean of wrist and the four finger-base (MCP) landmarks."""
    if len(landmarks) != NUM_LANDMARKS:
        raise ValueError(f"expected {NUM_LANDMARKS} landmarks, got {len(landmarks)}")
    xs = [landmarks[i][0] for i in PALM_IDS]
    ys = [landmarks[i][1] for i in PALM_IDS]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def fingertips(landmarks: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [landmarks[i] for i in FINGERTIP_IDS]


@dataclass
class RawHand:
    """One un-smoothed detection in image-normalized coordinates."""

    landmarks: list[tuple[float, float]]
    confidence: float = 1.0
    handedness: str = "Unknown"

    def __post_init__(self) -> None:
        if len(self.landmarks) != NUM_LANDMARKS:
            raise ValueError(f"expected {NUM_LANDMARKS} landmarks, got {len(self.landmarks)}")
        self.landmarks = [normalize_point(x, y) for x, y in self.landmarks]


@dataclass
class Hand:
    """Tracked, smoothed hand with a stable id."""

    id: int
    confidence: float
    handedness: str
    landmarks: list[tuple[float, float]]
    palm: tuple[float, float]
    tips: list[tuple[float, float]]
    velocity: tuple[float, float] = (0.0, 0.0)
    timestamp: float = 0.0
    lost: bool = False  # True while held through a short detection dropout
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        r = lambda p: [round(p[0], 4), round(p[1], 4)]  # noqa: E731
        return {
            "id": self.id,
            "confidence": round(self.confidence, 3),
            "handedness": self.handedness,
            "palm": r(self.palm),
            "tips": [r(p) for p in self.tips],
            "landmarks": [r(p) for p in self.landmarks],
            "velocity": r(self.velocity),
            "timestamp": self.timestamp,
            "lost": self.lost,
        }
