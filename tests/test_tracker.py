from app.config import DEFAULT_SETTINGS
from app.tracking.tracker import HandTracker
from conftest import make_hand

CFG = dict(DEFAULT_SETTINGS["tracking"])


def run(tr, positions, t0=0.0, fps=30):
    out = None
    for i, pos in enumerate(positions):
        dets = [make_hand(*p) for p in pos]
        out = tr.update(dets, t0 + i / fps)
    return out


def test_stable_id_while_moving():
    tr = HandTracker(CFG)
    run(tr, [[(0.2 + 0.01 * i, 0.5)] for i in range(10)])
    hands = tr.update([make_hand(0.31, 0.5)], 10 / 30)
    assert [h.id for h in hands] == [1]


def test_two_hands_get_distinct_ids_and_keep_them():
    tr = HandTracker(CFG)
    out = run(tr, [[(0.2, 0.5), (0.8, 0.5)]] * 5)
    assert sorted(h.id for h in out) == [1, 2]
    left = next(h for h in out if h.palm[0] < 0.5).id
    out = run(tr, [[(0.8, 0.5), (0.22, 0.5)]] * 3, t0=0.2)  # detection order swapped
    assert next(h for h in out if h.palm[0] < 0.5).id == left


def test_max_hands_enforced():
    tr = HandTracker({**CFG, "maxHands": 1})
    out = tr.update([make_hand(0.2, 0.2, conf=0.7), make_hand(0.8, 0.8, conf=0.95)], 0.0)
    assert len(out) == 1 and out[0].palm[0] > 0.5  # kept the more confident one


def test_low_confidence_dropped():
    tr = HandTracker(CFG)
    assert tr.update([make_hand(conf=0.2)], 0.0) == []


def test_short_dropout_holds_hand_flagged_lost_then_recovers_same_id():
    tr = HandTracker(CFG)
    run(tr, [[(0.4, 0.4)]] * 5)
    held = tr.update([], 5 / 30)
    assert len(held) == 1 and held[0].lost and held[0].velocity == (0.0, 0.0)
    again = tr.update([make_hand(0.41, 0.4)], 6 / 30)
    assert again[0].id == 1 and not again[0].lost


def test_long_dropout_drops_hand_and_new_hand_gets_new_id_without_jump():
    tr = HandTracker(CFG)
    run(tr, [[(0.1, 0.1)]] * 5)
    assert tr.update([], 5 / 30 + 1.0) == []  # beyond holdMs
    h = tr.update([make_hand(0.9, 0.9)], 5 / 30 + 1.1)[0]
    assert h.id == 2
    assert h.palm == (0.9, 0.9)  # fresh filter: no drift from the stale position


def test_far_jump_is_a_new_hand_not_a_teleport():
    tr = HandTracker(CFG)
    run(tr, [[(0.1, 0.1)]] * 5)
    out = tr.update([make_hand(0.9, 0.9)], 5 / 30)
    ids = sorted(h.id for h in out)
    assert ids == [1, 2]  # old hand held (lost), new one separate


def test_output_contains_all_required_fields():
    tr = HandTracker(CFG)
    d = tr.update([make_hand(0.5, 0.5)], 1.0)[0].to_dict()
    for key in ("id", "confidence", "landmarks", "palm", "tips", "timestamp", "velocity", "lost", "handedness"):
        assert key in d
    assert len(d["landmarks"]) == 21 and len(d["tips"]) == 5
    assert all(0 <= v <= 1 for p in d["landmarks"] for v in p)


def test_smoothing_reduces_jitter_in_tracker():
    tr = HandTracker({**CFG, "minCutoff": 1.0, "beta": 0.0})
    xs = []
    for i in range(90):
        j = 0.01 if i % 2 else -0.01
        xs.append(tr.update([make_hand(0.5 + j, 0.5)], i / 30)[0].palm[0])
    assert max(xs[30:]) - min(xs[30:]) < 0.01
