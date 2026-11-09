import numpy as np

from app.tracking.cues import GestureDetector, MotionPresence, openness
from app.tracking.hands import Hand


def hand_with(open_amount, hid=1):
    """Synthetic landmarks: wrist at origin, middle knuckle 1 unit up, fingertips `open_amount` units away."""
    lms = [(0.0, 0.0)] * 21
    lms[9] = (0.0, -1.0)
    for k, i in enumerate((4, 8, 12, 16, 20)):
        lms[i] = (k * 0.01, -open_amount)
    return Hand(id=hid, confidence=0.9, handedness="Right", landmarks=lms, palm=(0, 0), tips=[], velocity=(0, 0), timestamp=0)


def test_openness_separates_fist_from_open_hand():
    assert openness(hand_with(0.9).landmarks) < 1.25
    assert openness(hand_with(2.0).landmarks) > 1.7


def run(det, seq, dt=0.05, t0=0.0):
    out, t = [], t0
    for amount in seq:
        out += det.update([hand_with(amount)], t)
        t += dt
    return out


def test_fist_then_open_fires_once_with_cooldown():
    det = GestureDetector()
    assert run(det, [2.0] * 5 + [0.9] * 6 + [2.0] * 4) == ["gesture-fist-open"]
    assert run(det, [0.9] * 6 + [2.0] * 4, t0=1.0) == []  # inside the cooldown
    assert run(det, [0.9] * 6 + [2.0] * 4, t0=5.0) == ["gesture-fist-open"]


def test_open_hand_alone_or_slow_open_does_not_fire():
    det = GestureDetector()
    assert run(det, [2.0] * 20) == []
    det = GestureDetector()
    assert run(det, [0.9] * 6 + [1.4] * 40 + [2.0] * 3) == []  # opened far too late (window expired)


def test_two_hands_cue():
    det = GestureDetector()
    assert det.update([hand_with(2.0, 1)], 0) == []
    assert det.update([hand_with(2.0, 1), hand_with(2.0, 2)], 0.1) == ["two-hands"]
    assert det.update([hand_with(2.0, 1), hand_with(2.0, 2)], 0.2) == []


def frames(motion_cols, n, base=60):
    for k in range(n):
        f = np.full((36, 64), base, np.uint8)
        if motion_cols:
            c = (k * 5) % 40
            f[:, c:c + motion_cols] = 200  # a bar sweeping across: pixels change every frame
        yield f


def feed(mp, gen, t0, dt=0.1):
    out, t = [], t0
    for f in gen:
        out += mp.update(f, t)
        t += dt
    return out, t


def test_presence_needs_sustained_motion_then_ends_after_quiet():
    mp = MotionPresence()
    out, t = feed(mp, frames(0, 10), 0.0)
    assert out == []
    out, t = feed(mp, frames(8, 12), t)
    assert out == ["presence"]
    out, t = feed(mp, frames(0, 60), t)
    assert out == ["presence-end"]


def test_single_blip_is_not_presence():
    mp = MotionPresence()
    feed(mp, frames(0, 5), 0.0)
    out, t = feed(mp, frames(8, 2), 0.5)
    out2, _ = feed(mp, frames(0, 30), t)
    assert out == [] and out2 == []


def test_global_brightness_jump_is_ignored():
    mp = MotionPresence()
    flat = lambda v: np.full((36, 64), v, np.uint8)  # noqa: E731
    out = []
    for k, v in enumerate([40] * 5 + [180] * 10 + [40] * 10):  # projector flash / auto exposure
        out += mp.update(flat(v), k * 0.1)
    assert out == []
