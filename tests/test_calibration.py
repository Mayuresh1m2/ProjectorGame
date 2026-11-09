import pytest

from app.projection.calibration import Calibration, CalibrationError, prepare


def test_uncalibrated_is_identity():
    assert Calibration().apply(0.3, 0.7) == pytest.approx((0.3, 0.7))


def test_mirror():
    assert Calibration(mirror=True).apply(0.2, 0.4) == pytest.approx((0.8, 0.4))


@pytest.mark.parametrize("rot,expected", [(0, (0.2, 0.4)), (90, (0.6, 0.2)), (180, (0.8, 0.6)), (270, (0.4, 0.8))])
def test_rotation_clockwise(rot, expected):
    assert prepare(0.2, 0.4, False, rot) == pytest.approx(expected)


def test_rotation_must_be_multiple_of_90():
    with pytest.raises(CalibrationError):
        prepare(0.5, 0.5, False, 45)


def test_homography_maps_corners_exactly():
    cam = [(0.2, 0.15), (0.85, 0.2), (0.9, 0.8), (0.1, 0.9)]      # a perspective-distorted view
    scr = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]
    c = Calibration(camera_points=cam, screen_points=scr).solve()
    for p, s in zip(cam, scr):
        assert c.apply(*p) == pytest.approx(s, abs=1e-5)


def test_homography_interpolates_center_inside_quad():
    cam = [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)]
    c = Calibration(camera_points=cam).solve()
    assert c.apply(0.5, 0.5) == pytest.approx((0.5, 0.5), abs=1e-5)


def test_perspective_correction_is_not_affine():
    # trapezoid (camera looks at the wall from below): top edge shorter than bottom
    cam = [(0.3, 0.2), (0.7, 0.2), (0.9, 0.8), (0.1, 0.8)]
    c = Calibration(camera_points=cam, screen_points=[(0, 0), (1, 0), (1, 1), (0, 1)]).solve()
    x_top, _ = c.apply(0.4, 0.2)
    x_bot, _ = c.apply(0.4, 0.8)
    assert x_top != pytest.approx(x_bot, abs=0.05)  # same camera x maps differently at different heights


def test_different_aspect_ratio_screen_targets():
    cam = [(0, 0), (1, 0), (1, 1), (0, 1)]
    c = Calibration(camera_points=cam, screen_points=[(0, 0), (1, 0), (1, 1), (0, 1)]).solve()
    assert c.apply(0.25, 0.75) == pytest.approx((0.25, 0.75), abs=1e-6)  # normalized: resolution independent


def test_calibration_applies_after_mirror():
    cam = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]  # in prepared (mirrored) space
    c = Calibration(mirror=True, camera_points=cam, screen_points=[(0, 0), (1, 0), (1, 1), (0, 1)]).solve()
    assert c.apply(0.9, 0.1) == pytest.approx((0.0, 0.0), abs=1e-5)  # raw right edge -> prepared left -> screen left


def test_collinear_points_rejected():
    with pytest.raises(CalibrationError):
        Calibration(camera_points=[(0.1, 0.1), (0.2, 0.2), (0.3, 0.3), (0.4, 0.4)]).solve()


def test_wrong_order_rejected():
    with pytest.raises(CalibrationError):
        Calibration(camera_points=[(0.1, 0.1), (0.9, 0.9), (0.9, 0.1), (0.1, 0.9)]).solve()  # bow-tie


def test_too_few_points_rejected():
    with pytest.raises(CalibrationError):
        Calibration(camera_points=[(0.1, 0.1)] * 3).solve()


def test_nan_rejected():
    with pytest.raises(CalibrationError):
        Calibration(camera_points=[(float("nan"), 0), (1, 0), (1, 1), (0, 1)]).solve()


def test_roundtrip_serialization():
    cam = [(0.2, 0.2), (0.8, 0.25), (0.85, 0.8), (0.15, 0.75)]
    c = Calibration(mirror=True, rotation=90, camera_points=cam).solve()
    c2 = Calibration.from_dict(c.to_dict())
    assert c2.apply(0.4, 0.4) == pytest.approx(c.apply(0.4, 0.4))
    assert c2.calibrated and c2.mirror and c2.rotation == 90


@pytest.mark.parametrize("bad", [{"rotation": 45}, {"matrix": [[1, 2], [3, 4]]}, {"camera_points": [["a", "b"]]}])
def test_from_dict_rejects_garbage(bad):
    with pytest.raises(CalibrationError):
        Calibration.from_dict(bad)


def test_clamp_option():
    c = Calibration(clamp=True, mirror=False)
    c.matrix = [[2, 0, 0], [0, 2, 0], [0, 0, 1]]
    assert c.apply(0.9, 0.9) == (1.0, 1.0)


def _scene(points, w=640, h=480, r=6):
    import numpy as np, cv2
    img = np.full((h, w, 3), 40, np.uint8)
    for x, y in points:
        cv2.circle(img, (int(x * w), int(y * h)), r, (255, 255, 255), -1)
    return img


def test_find_markers_orders_clockwise_from_top_left():
    from app.projection.calibration import find_markers
    pts = [(0.2, 0.15), (0.85, 0.2), (0.9, 0.8), (0.1, 0.9)]
    off = _scene([])
    got = find_markers(_scene([pts[2], pts[0], pts[3], pts[1]]), off)
    assert [v for p in got for v in p] == pytest.approx([v for p in pts for v in p], abs=0.01)


def test_find_markers_reports_dark_scene():
    from app.projection.calibration import find_markers
    with pytest.raises(CalibrationError, match="cannot see"):
        find_markers(_scene([]), _scene([]))


def test_find_markers_reports_missing_corner():
    from app.projection.calibration import find_markers
    with pytest.raises(CalibrationError, match="3 of 4"):
        find_markers(_scene([(0.2, 0.2), (0.8, 0.2), (0.8, 0.8)]), _scene([]))


def test_find_markers_rejects_extra_spots():
    from app.projection.calibration import find_markers
    pts = [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8), (0.5, 0.5)]
    with pytest.raises(CalibrationError, match="5 bright spots"):
        find_markers(_scene(pts), _scene([]))


@pytest.mark.parametrize("mirror,rot", [(False, 0), (True, 0), (False, 90), (True, 270)])
def test_order_prepared_gives_tl_tr_br_bl(mirror, rot):
    from app.projection.calibration import order_prepared
    want = [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)]
    # build raw points that map onto `want` after prepare(): invert by brute force
    raw = []
    for tx, ty in want:
        for cand in [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)]:
            if prepare(*cand, mirror, rot) == pytest.approx((tx, ty)):
                raw.append(cand)
    flat = lambda pts: [v for p in pts for v in p]  # noqa: E731
    assert flat(order_prepared(raw[::-1], mirror, rot)) == pytest.approx(flat(want))


# ---- several grids ----
def _two_grid_cal():
    from app.projection.calibration import Grid
    left = Grid.build("left", "Left wall", [(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)], [(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)])
    # right wall seen at half width but projected on the right half of the screen, flipped vertically
    right = Grid.build("right", "Right wall", [(0.5, 0.0), (1.0, 0.0), (1.0, 1.0), (0.5, 1.0)], [(0.5, 1.0), (1.0, 1.0), (1.0, 0.0), (0.5, 0.0)])
    return Calibration(extra_grids=[left, right])


def test_each_grid_maps_its_own_region():
    c = _two_grid_cal()
    assert c.apply(0.25, 0.25) == pytest.approx((0.25, 0.25), abs=1e-6)       # inside the left grid: identity
    assert c.apply(0.75, 0.25) == pytest.approx((0.75, 0.75), abs=1e-6)       # right grid flips y


def test_point_outside_all_grids_uses_nearest():
    c = _two_grid_cal()
    x, y = c.apply(1.2, 0.2)  # beyond the right grid
    assert x > 1.0 and y > 0.5


def test_main_and_extra_grids_roundtrip():
    c = _two_grid_cal()
    c.camera_points = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]
    c.solve()
    d = Calibration.from_dict(c.to_dict())
    assert [g["id"] for g in d.to_dict()["grids"]] == ["main", "left", "right"]
    assert d.apply(0.75, 0.25) == pytest.approx(c.apply(0.75, 0.25))


@pytest.mark.parametrize("gid", ["", "Bad Id", "x" * 30])
def test_grid_id_validated(gid):
    from app.projection.calibration import Grid
    sq = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]
    with pytest.raises(CalibrationError):
        Grid.build(gid, "n", sq, sq)


def test_degenerate_grid_rejected():
    from app.projection.calibration import Grid
    with pytest.raises(CalibrationError):
        Grid.build("a", "n", [(0.1, 0.1), (0.2, 0.2), (0.3, 0.3), (0.4, 0.4)], [(0, 0), (1, 0), (1, 1), (0, 1)])
