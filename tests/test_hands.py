import pytest

from app.tracking.hands import FINGERTIP_IDS, RawHand, clamp01, fingertips, normalize_point, palm_center
from conftest import make_hand


def test_normalize_pixels():
    assert normalize_point(320, 240, 640, 480) == (0.5, 0.5)
    assert normalize_point(0, 0, 640, 480) == (0.0, 0.0)


def test_normalize_clamps_out_of_range():
    assert normalize_point(700, -5, 640, 480) == (1.0, 0.0)
    assert clamp01(1.0000001) == 1.0


def test_normalize_rejects_bad_size():
    with pytest.raises(ValueError):
        normalize_point(1, 1, 0, 480)


def test_palm_center_and_fingertips():
    h = make_hand(0.3, 0.7)
    assert palm_center(h.landmarks) == pytest.approx((0.3, 0.7))
    assert len(fingertips(h.landmarks)) == 5
    assert fingertips(h.landmarks)[1] == h.landmarks[FINGERTIP_IDS[1]]


def test_rawhand_requires_21_landmarks_and_clamps():
    with pytest.raises(ValueError):
        RawHand([(0.5, 0.5)] * 20)
    h = RawHand([(1.7, -0.2)] * 21)
    assert h.landmarks[0] == (1.0, 0.0)
