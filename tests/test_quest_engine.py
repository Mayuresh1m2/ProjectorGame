import pytest

from app.quest.engine import (L_ANK, L_HIP, L_SH, L_WR, R_ANK, R_HIP, R_SH, R_WR, QuestConfigError, ZoneEngine, default_config,
                              point_in_polygon, validate_config)

STAIRS = [[0.1, 0.5], [0.5, 0.5], [0.5, 1.0], [0.1, 1.0]]
WALL = [[0.55, 0.0], [0.95, 0.0], [0.95, 0.9], [0.55, 0.9]]


def cfg(*zones):
    return {"version": 1, "zones": list(zones), "targets": {"laddu": 3}}


def zone(zid, trigger, poly, reward="laddu", **kw):
    return {"id": zid, "name": zid, "trigger": trigger, "reward": reward, "polygon": poly, **kw}


def pose(hip_x, hip_y, torso=0.2, wrists=None, vis=1.0):
    """33 landmarks, default invisible; shoulders above the hips by `torso`, ankles below by 0.3."""
    lm = [(0.0, 0.0, 0.0)] * 33
    lm = list(lm)
    lm[L_SH] = (hip_x - 0.03, hip_y - torso, vis); lm[R_SH] = (hip_x + 0.03, hip_y - torso, vis)
    lm[L_HIP] = (hip_x - 0.03, hip_y, vis); lm[R_HIP] = (hip_x + 0.03, hip_y, vis)
    lm[L_ANK] = (hip_x - 0.03, hip_y + 0.3, vis); lm[R_ANK] = (hip_x + 0.03, hip_y + 0.3, vis)
    if wrists:
        lm[L_WR] = (*wrists[0], vis)
        lm[R_WR] = (*wrists[1], vis) if len(wrists) > 1 else (0.0, 0.0, 0.0)
    return lm


def drive(eng, frames, fps=30, t0=0.0):
    ev = []
    for k, f in enumerate(frames):
        ev += eng.update(f if isinstance(f, list) and f and isinstance(f[0], list) else [f], t0 + k / fps)
    return ev


def standing(x, y, n):
    return [pose(x, y) for _ in range(n)]


def jump_frames(x, y, height=0.12, n_up=6):
    up = [pose(x, y - height * min(1, (k + 1) / n_up)) for k in range(n_up)]
    return up + [pose(x, y - height) for _ in range(2)] + [pose(x, y - height * (1 - (k + 1) / n_up)) for k in range(n_up)]


def test_point_in_polygon():
    assert point_in_polygon(0.3, 0.7, STAIRS) and not point_in_polygon(0.7, 0.7, STAIRS)


def test_jump_in_zone_fires_once_and_needs_landing_to_rearm():
    eng = ZoneEngine(cfg(zone("stairs", "jump", STAIRS)))
    frames = standing(0.3, 0.6, 40) + jump_frames(0.3, 0.6) + standing(0.3, 0.6, 30)
    ev = drive(eng, frames)
    assert [e["zone"] for e in ev] == ["stairs"] and ev[0]["reward"] == "laddu"


def test_jump_outside_zone_or_standing_still_or_small_hop_does_not_fire():
    eng = ZoneEngine(cfg(zone("stairs", "jump", STAIRS)))
    assert drive(eng, standing(0.8, 0.6, 40) + jump_frames(0.8, 0.6) + standing(0.8, 0.6, 20)) == []
    eng = ZoneEngine(cfg(zone("stairs", "jump", STAIRS)))
    assert drive(eng, standing(0.3, 0.6, 90)) == []
    eng = ZoneEngine(cfg(zone("stairs", "jump", STAIRS)))
    assert drive(eng, standing(0.3, 0.6, 40) + jump_frames(0.3, 0.6, height=0.03) + standing(0.3, 0.6, 20)) == []


def test_two_jumps_two_rewards_and_sensitivity_changes_threshold():
    eng = ZoneEngine(cfg(zone("s", "jump", STAIRS)))
    frames = standing(0.3, 0.6, 40) + jump_frames(0.3, 0.6) + standing(0.3, 0.6, 30) + jump_frames(0.3, 0.6) + standing(0.3, 0.6, 10)
    assert len(drive(eng, frames)) == 2
    small = standing(0.3, 0.6, 40) + jump_frames(0.3, 0.6, height=0.05) + standing(0.3, 0.6, 20)
    assert drive(ZoneEngine(cfg(zone("s", "jump", STAIRS))), small) == []
    assert len(drive(ZoneEngine(cfg(zone("s", "jump", STAIRS, sensitivity=2.0))), small)) == 1


def climb_frames(x, y0, y1, n):
    out = []
    for k in range(n):
        y = y0 + (y1 - y0) * k / (n - 1)
        out.append(pose(x, y, wrists=[(x - 0.04, y - 0.4), (x + 0.04, y - 0.38)]))
    return out


def test_climbing_gives_a_reward_per_step_up():
    eng = ZoneEngine(cfg(zone("wall", "climb", WALL, reward="fuljhadi")))
    ev = drive(eng, climb_frames(0.75, 0.8, 0.4, 120))   # hips rise 0.4 with torso 0.2 -> step 0.11 -> 3 rewards
    assert len(ev) == 3 and all(e["reward"] == "fuljhadi" for e in ev)


def test_hanging_still_walking_by_or_hands_down_is_not_climbing():
    assert drive(ZoneEngine(cfg(zone("wall", "climb", WALL))), climb_frames(0.75, 0.6, 0.6, 90)) == []
    walk = [pose(0.6 + 0.3 * k / 90, 0.7, wrists=[(0.6, 0.85), (0.62, 0.85)]) for k in range(90)]  # hands at the hips
    assert drive(ZoneEngine(cfg(zone("wall", "climb", WALL))), walk) == []


def test_sliding_back_down_does_not_double_count():
    eng = ZoneEngine(cfg(zone("wall", "climb", WALL)))
    ev = drive(eng, climb_frames(0.75, 0.8, 0.5, 60) + climb_frames(0.75, 0.5, 0.8, 60) + climb_frames(0.75, 0.8, 0.5, 60))
    assert len(ev) == 4  # 2 steps up, back down, 2 steps up again (the bar is re-set while sliding down)


def walk(x0, x1, y, n):
    return [pose(x0 + (x1 - x0) * k / (n - 1), y) for k in range(n)]


def test_enter_zone_fires_after_a_short_dwell_then_needs_leaving():
    eng = ZoneEngine(cfg(zone("mat", "enter", STAIRS, reward="diya")))
    ev = drive(eng, walk(0.8, 0.3, 0.7, 40) + standing(0.3, 0.7, 30) + walk(0.3, 0.8, 0.7, 40) + walk(0.8, 0.3, 0.7, 40) + standing(0.3, 0.7, 30))
    assert len(ev) == 2


def test_walking_straight_through_a_zone_does_not_count_as_entering():
    eng = ZoneEngine(cfg(zone("mat", "enter", STAIRS, reward="diya")))
    assert drive(eng, walk(0.8, 0.0, 0.7, 12)) == []  # crosses in well under 0.4 s


def test_multiple_people_get_separate_ids_and_each_can_score():
    eng = ZoneEngine(cfg(zone("stairs", "jump", STAIRS)))
    a, b = standing(0.2, 0.6, 40), standing(0.4, 0.6, 40)
    both = [[x, y] for x, y in zip(a, b)]
    jumps = [[p, q] for p, q in zip(jump_frames(0.2, 0.6), jump_frames(0.4, 0.6))]
    rest = [[p, q] for p, q in zip(standing(0.2, 0.6, 20), standing(0.4, 0.6, 20))]
    ev = drive(eng, both + jumps + rest)
    assert sorted(e["person"] for e in ev) == [1, 2]


def test_person_leaves_and_is_forgotten():
    eng = ZoneEngine(cfg(zone("s", "jump", STAIRS)))
    drive(eng, standing(0.3, 0.6, 5))
    assert len(eng.people) == 1
    eng.update([], 10.0)
    assert eng.people == {}


def test_low_visibility_poses_are_ignored():
    eng = ZoneEngine(cfg(zone("s", "jump", STAIRS)))
    assert drive(eng, [pose(0.3, 0.6, vis=0.1) for _ in range(30)]) == []


@pytest.mark.parametrize("bad", [
    {"zones": [{"id": "a", "trigger": "fly", "reward": "laddu", "polygon": STAIRS}]},
    {"zones": [{"id": "a", "trigger": "jump", "reward": "gold", "polygon": STAIRS}]},
    {"zones": [{"id": "a", "trigger": "jump", "reward": "laddu", "polygon": [[0, 0], [1, 1]]}]},
    {"zones": [{"id": "a", "trigger": "jump", "reward": "laddu", "polygon": [[0, 0], [1, "x"], [1, 1]]}]},
    {"zones": [{"id": "a", "trigger": "jump", "reward": "laddu", "polygon": STAIRS}] * 2},
    {"zones": [{"id": "a", "trigger": "jump", "reward": "laddu", "polygon": STAIRS, "sensitivity": 99}]},
    {"zones": [], "targets": {"laddu": 0}},
    {"zones": [], "targets": {"gold": 5}},
])
def test_config_validation_rejects_bad_input(bad):
    with pytest.raises(QuestConfigError):
        validate_config(bad)


def test_default_config_is_valid():
    assert validate_config(default_config())["targets"] == {"laddu": 10, "fuljhadi": 5}
