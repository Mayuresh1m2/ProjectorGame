import math

from app.tracking.smoothing import OneEuroFilter


def test_first_sample_passes_through():
    f = OneEuroFilter()
    assert f(0.3, 0.0) == 0.3


def test_jitter_is_reduced_when_still():
    f = OneEuroFilter(min_cutoff=1.0, beta=0.0)
    raw, out = [], []
    for i in range(120):
        n = 0.004 * math.sin(i * 2.7)  # +-0.4% noise on a still hand
        raw.append(0.5 + n); out.append(f(0.5 + n, i / 30))
    spread = lambda v: max(v[30:]) - min(v[30:])  # noqa: E731
    assert spread(out) < spread(raw) * 0.5


def test_follows_fast_motion_with_little_lag():
    f = OneEuroFilter(min_cutoff=1.2, beta=12.0)
    x = 0.0
    for i in range(30):
        x = i * 0.03  # 0.9 units/s
        y = f(x, i / 30)
    assert abs(y - x) < 0.04  # lag well under 5% of the screen


def test_more_smoothing_means_more_lag():
    def lag(cutoff):
        f = OneEuroFilter(min_cutoff=cutoff, beta=0.0)
        for i in range(30):
            y = f(i * 0.03, i / 30)
        return abs(y - 29 * 0.03)
    assert lag(0.3) > lag(3.0)


def test_duplicate_timestamp_does_not_blow_up():
    f = OneEuroFilter()
    f(0.1, 1.0)
    assert f(0.2, 1.0) == 0.1  # unchanged, no division by zero


def test_step_jump_converges():
    f = OneEuroFilter()
    f(0.1, 0.0)
    y = 0
    for i in range(1, 40):
        y = f(0.9, i / 30)
    assert abs(y - 0.9) < 0.02
