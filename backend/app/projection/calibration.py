"""Camera -> screen coordinate mapping (separate from game logic and from hand tracking).

camera point (raw, normalized) --[rotate, mirror]--> prepared camera point --[homography]--> screen point

Before a calibration is solved, the homography is the identity (i.e. camera fills the screen), so mirror
and rotation alone give a usable mapping. Calibration points are always stored in the *prepared* space
(what the operator sees in the calibration preview), so they stay valid regardless of how the phone is held.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

DEFAULT_SCREEN_POINTS = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]  # TL, TR, BR, BL targets


class CalibrationError(ValueError):
    pass


def prepare(x: float, y: float, mirror: bool = False, rotation: int = 0) -> tuple[float, float]:
    """Apply clockwise rotation (0/90/180/270) then horizontal mirror to a normalized point."""
    if rotation % 90 != 0:
        raise CalibrationError("rotation must be a multiple of 90")
    for _ in range((rotation // 90) % 4):
        x, y = 1.0 - y, x
    if mirror:
        x = 1.0 - x
    return x, y


def _convex_and_nondegenerate(pts: np.ndarray) -> bool:
    n = len(pts)
    signs = []
    for i in range(n):
        a, b, c = pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cross) < 1e-6:
            return False
        signs.append(cross > 0)
    return all(signs) or not any(signs)


MAX_GRIDS = 8


def solve_matrix(cam: list, scr: list) -> list[list[float]]:
    """Homography (prepared camera -> screen) from matching points; raises CalibrationError with a reason."""
    if len(cam) < 4 or len(cam) != len(scr):
        raise CalibrationError("need at least 4 matching camera/screen point pairs")
    c = np.array(cam, dtype=np.float32)
    s = np.array(scr, dtype=np.float32)
    if not np.isfinite(c).all() or not np.isfinite(s).all():
        raise CalibrationError("points must be finite numbers")
    if len(cam) == 4:
        if not _convex_and_nondegenerate(c):
            raise CalibrationError("camera points are collinear or in the wrong order (use TL, TR, BR, BL)")
        m = cv2.getPerspectiveTransform(c, s)
    else:
        m, _ = cv2.findHomography(c, s, cv2.RANSAC)
        if m is None:
            raise CalibrationError("could not fit a homography")
    if abs(np.linalg.det(m)) < 1e-9:
        raise CalibrationError("degenerate transform")
    return m.tolist()


@dataclass
class Grid:
    """One calibrated region (a wall or a section of one): its own camera->screen mapping."""
    id: str
    name: str
    camera_points: list[tuple[float, float]]
    screen_points: list[tuple[float, float]]
    matrix: list[list[float]]

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "camera_points": [list(p) for p in self.camera_points],
                "screen_points": [list(p) for p in self.screen_points], "matrix": self.matrix, "calibrated": True}

    @classmethod
    def build(cls, gid: str, name: str, cam: list, scr: list) -> "Grid":
        import re
        if not re.fullmatch(r"[a-z0-9-]{1,24}", gid or ""):
            raise CalibrationError("grid id must be 1-24 characters of a-z, 0-9 or -")
        if len(cam) != 4 or len(scr) != 4:
            raise CalibrationError("a grid needs exactly 4 camera and 4 screen points")
        try:
            cam = [(float(a), float(b)) for a, b in cam]
            scr = [(float(a), float(b)) for a, b in scr]
        except (TypeError, ValueError) as e:
            raise CalibrationError(f"invalid points: {e}") from e
        return cls(gid, str(name or gid)[:40], cam, scr, solve_matrix(cam, scr))

    def contains(self, x: float, y: float) -> bool:
        return cv2.pointPolygonTest(np.array(self.camera_points, dtype=np.float32), (x, y), False) >= 0

    def centre(self) -> tuple[float, float]:
        a = np.array(self.camera_points).mean(axis=0)
        return float(a[0]), float(a[1])

    def map(self, x: float, y: float) -> tuple[float, float]:
        v = np.array(self.matrix) @ np.array([x, y, 1.0])
        if abs(v[2]) < 1e-12:
            raise CalibrationError("point maps to infinity")
        return float(v[0] / v[2]), float(v[1] / v[2])


@dataclass
class Calibration:
    mirror: bool = False
    rotation: int = 0
    camera_points: list[tuple[float, float]] = field(default_factory=list)  # prepared space
    screen_points: list[tuple[float, float]] = field(default_factory=lambda: list(DEFAULT_SCREEN_POINTS))
    matrix: list[list[float]] | None = None  # 3x3, prepared camera -> screen
    clamp: bool = False
    extra_grids: list[Grid] = field(default_factory=list)  # further regions (other walls / sections), each with its own mapping

    @property
    def calibrated(self) -> bool:
        return self.matrix is not None

    def solve(self) -> "Calibration":
        self.matrix = solve_matrix(self.camera_points, self.screen_points)
        return self

    def grids(self) -> list[Grid]:
        """Every calibrated region, the primary one first."""
        main = [Grid("main", "Main", [tuple(p) for p in self.camera_points], [tuple(p) for p in self.screen_points], self.matrix)] \
            if self.matrix is not None and len(self.camera_points) == 4 else []
        return main + self.extra_grids

    def pick_grid(self, px: float, py: float) -> Grid | None:
        """The region a (prepared) camera point belongs to: the containing one with the nearest centre, else the nearest overall."""
        gs = self.grids()
        if not gs:
            return None
        inside = [g for g in gs if g.contains(px, py)] or gs
        return min(inside, key=lambda g: (g.centre()[0] - px) ** 2 + (g.centre()[1] - py) ** 2)

    def apply(self, x: float, y: float) -> tuple[float, float]:
        """Raw camera-normalized point -> screen-normalized point."""
        px, py = prepare(x, y, self.mirror, self.rotation)
        if self.matrix is not None and not self.extra_grids:
            v = np.array(self.matrix) @ np.array([px, py, 1.0])
            if abs(v[2]) < 1e-12:
                raise CalibrationError("point maps to infinity")
            px, py = v[0] / v[2], v[1] / v[2]
        elif self.extra_grids or self.matrix is not None:
            g = self.pick_grid(px, py)
            if g is not None:
                px, py = g.map(px, py)
        if self.clamp:
            px, py = min(1.0, max(0.0, px)), min(1.0, max(0.0, py))
        return float(px), float(py)

    def prepared(self, x: float, y: float) -> tuple[float, float]:
        return prepare(x, y, self.mirror, self.rotation)

    def to_dict(self) -> dict:
        return {
            "mirror": self.mirror, "rotation": self.rotation, "clamp": self.clamp,
            "camera_points": [list(p) for p in self.camera_points],
            "screen_points": [list(p) for p in self.screen_points],
            "matrix": self.matrix, "calibrated": self.calibrated,
            "extra_grids": [g.to_dict() for g in self.extra_grids],
            "grids": [g.to_dict() for g in self.grids()],  # primary ("main") first; what the control panel lists
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Calibration":
        try:
            rot = int(d.get("rotation", 0))
            if rot % 90 != 0:
                raise CalibrationError("rotation must be a multiple of 90")
            cal = cls(
                mirror=bool(d.get("mirror", False)), rotation=rot % 360, clamp=bool(d.get("clamp", False)),
                camera_points=[(float(a), float(b)) for a, b in d.get("camera_points", [])],
                screen_points=[(float(a), float(b)) for a, b in d.get("screen_points", DEFAULT_SCREEN_POINTS)],
                matrix=d.get("matrix"),
            )
        except (TypeError, ValueError) as e:
            raise CalibrationError(f"invalid calibration data: {e}") from e
        if cal.matrix is not None:
            m = np.array(cal.matrix, dtype=float)
            if m.shape != (3, 3) or not np.isfinite(m).all():
                raise CalibrationError("matrix must be a finite 3x3")
        extras = d.get("extra_grids", [])
        if not isinstance(extras, list) or len(extras) >= MAX_GRIDS:
            raise CalibrationError("extra_grids must be a list of fewer than %d grids" % MAX_GRIDS)
        for g in extras:  # re-solve rather than trust a stored matrix
            try:
                cal.extra_grids.append(Grid.build(g["id"], g.get("name", ""), g["camera_points"], g["screen_points"]))
            except (KeyError, TypeError) as e:
                raise CalibrationError(f"invalid grid: {e}") from e
        return cal


def find_markers(on: np.ndarray, off: np.ndarray, expected: int = 4) -> list[tuple[float, float]]:
    """Locate the projected corner discs: `on` = frame with the discs shown, `off` = same scene with a black screen.

    Returns raw normalized camera points ordered clockwise starting from the top-left one in the *raw* image.
    Raises CalibrationError with a human reason (too dark, wrong number of blobs, ...).
    """
    if on.shape != off.shape:
        raise CalibrationError("camera resolution changed during detection; try again")
    a = cv2.cvtColor(on, cv2.COLOR_BGR2GRAY) if on.ndim == 3 else on
    b = cv2.cvtColor(off, cv2.COLOR_BGR2GRAY) if off.ndim == 3 else off
    diff = cv2.GaussianBlur(cv2.subtract(a, b), (5, 5), 0)
    peak = int(diff.max())
    if peak < 25:
        raise CalibrationError("the camera cannot see the projected markers (is the projector on and the camera pointed at the wall? try dimming the room lights)")
    _, mask = cv2.threshold(diff, max(20, int(peak * 0.5)), 255, cv2.THRESH_BINARY)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, _, stats, cents = cv2.connectedComponentsWithStats(mask)
    h, w = a.shape[:2]
    blobs = [(stats[i, cv2.CC_STAT_AREA], cents[i]) for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 0.00005 * w * h]
    blobs.sort(key=lambda t: -t[0])
    if len(blobs) < expected:
        raise CalibrationError(f"found {len(blobs)} of {expected} markers; make sure all four corners of the projection are inside the camera view")
    if len(blobs) > expected and blobs[expected][0] > 0.25 * blobs[expected - 1][0]:
        raise CalibrationError(f"found {len(blobs)} bright spots instead of {expected} (something else is changing in the view; keep the camera view still)")
    pts = np.array([[c[0] / w, c[1] / h] for _, c in blobs[:expected]])
    centre = pts.mean(axis=0)
    order = np.argsort(np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0]))  # clockwise on screen (y down)
    pts = pts[order]
    start = int(np.argmin(pts.sum(axis=1)))
    pts = np.roll(pts, -start, axis=0)
    return [(float(x), float(y)) for x, y in pts]


def order_prepared(raw_pts: list[tuple[float, float]], mirror: bool, rotation: int) -> list[tuple[float, float]]:
    """Raw camera points -> prepared space, ordered TL, TR, BR, BL (rotation/mirror can reorder them)."""
    pts = np.array([prepare(x, y, mirror, rotation) for x, y in raw_pts])
    centre = pts.mean(axis=0)
    pts = pts[np.argsort(np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0]))]
    pts = np.roll(pts, -int(np.argmin(pts.sum(axis=1))), axis=0)
    return [(float(x), float(y)) for x, y in pts]
