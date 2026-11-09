"""Playroom Quest zone engine: turns body poses into reward events ("jumped on the stairs", "climbed the wall").

Pure logic, no camera or MediaPipe imports, so it is tested with synthetic poses. Coordinates are normalized
camera-image coordinates (0..1, y grows downward) -- the same space as the photo the zones are drawn on.
Heuristics, not magic: thresholds are adjustable per zone with `sensitivity` and must be tuned on the real room.
"""
from __future__ import annotations

import math
import statistics
from collections import deque
from dataclasses import dataclass, field

# MediaPipe pose landmark indices
NOSE, L_SH, R_SH, L_WR, R_WR, L_HIP, R_HIP, L_ANK, R_ANK = 0, 11, 12, 15, 16, 23, 24, 27, 28
MIN_VIS = 0.4

TRIGGERS = {"jump", "climb", "enter"}
REWARDS = {"laddu", "fuljhadi", "jalebi", "diya"}
MAX_ZONES = 12


class QuestConfigError(ValueError):
    pass


def default_config() -> dict:
    return {"version": 1, "zones": [], "targets": {"laddu": 10, "fuljhadi": 5}}


def validate_config(cfg: dict) -> dict:
    if not isinstance(cfg, dict) or not isinstance(cfg.get("zones", []), list):
        raise QuestConfigError("quest config must be an object with a zones list")
    zones, seen = [], set()
    if len(cfg.get("zones", [])) > MAX_ZONES:
        raise QuestConfigError(f"at most {MAX_ZONES} zones")
    for i, z in enumerate(cfg.get("zones", [])):
        if not isinstance(z, dict):
            raise QuestConfigError(f"zone {i} must be an object")
        zid = str(z.get("id") or f"z{i}")[:32]
        if zid in seen:
            raise QuestConfigError(f"duplicate zone id {zid!r}")
        seen.add(zid)
        if z.get("trigger") not in TRIGGERS:
            raise QuestConfigError(f"zone {zid}: trigger must be one of {sorted(TRIGGERS)}")
        if z.get("reward") not in REWARDS:
            raise QuestConfigError(f"zone {zid}: reward must be one of {sorted(REWARDS)}")
        poly = z.get("polygon")
        if not isinstance(poly, list) or len(poly) < 3 or len(poly) > 40:
            raise QuestConfigError(f"zone {zid}: polygon needs 3 to 40 points")
        pts = []
        for p in poly:
            if (not isinstance(p, (list, tuple)) or len(p) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in p)
                    or not all(-0.5 <= v <= 1.5 for v in p)):
                raise QuestConfigError(f"zone {zid}: polygon points must be [x, y] numbers near 0..1")
            pts.append([float(p[0]), float(p[1])])
        cooldown, sens = z.get("cooldown", 0.8), z.get("sensitivity", 1.0)
        for name, v, lo, hi in (("cooldown", cooldown, 0.1, 30), ("sensitivity", sens, 0.3, 3)):
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
                raise QuestConfigError(f"zone {zid}: {name} must be a number in [{lo}, {hi}]")
        zones.append({"id": zid, "name": str(z.get("name", zid))[:40], "trigger": z["trigger"], "reward": z["reward"],
                      "polygon": pts, "cooldown": float(cooldown), "sensitivity": float(sens)})
    targets = cfg.get("targets", {})
    if not isinstance(targets, dict):
        raise QuestConfigError("targets must be an object")
    clean = {}
    for k, v in targets.items():
        if k not in REWARDS or isinstance(v, bool) or not isinstance(v, int) or not 1 <= v <= 999:
            raise QuestConfigError(f"targets.{k} must be an integer 1-999 for a known reward")
        clean[k] = v
    return {"version": 1, "zones": zones, "targets": clean}


def point_in_polygon(x: float, y: float, poly) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            inside = not inside
    return inside


def _mid(lm, a, b):
    """Midpoint of two landmarks if both visible, else whichever is visible, else None."""
    pa, pb = lm[a], lm[b]
    va, vb = pa[2] >= MIN_VIS, pb[2] >= MIN_VIS
    if va and vb:
        return ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
    if va:
        return (pa[0], pa[1])
    if vb:
        return (pb[0], pb[1])
    return None


@dataclass
class Person:
    id: int
    hip: tuple[float, float] = (0, 0)
    last_seen: float = 0.0
    torso: float = 0.0
    hist: deque = field(default_factory=lambda: deque(maxlen=90))  # (t, hip_y)
    foot: tuple[float, float] | None = None       # last grounded foot position
    armed: dict = field(default_factory=dict)      # zone id -> bool (jump ready)
    last_fire: dict = field(default_factory=dict)  # zone id -> t
    anchor: dict = field(default_factory=dict)     # zone id -> hip_y at climb contact / last reward
    contact: dict = field(default_factory=dict)    # zone id -> last time in contact
    inside_since: dict = field(default_factory=dict)
    entered: dict = field(default_factory=dict)


class ZoneEngine:
    def __init__(self, config: dict | None = None, hold_s: float = 0.7):
        self.config = validate_config(config or default_config())
        self.hold_s = hold_s
        self.people: dict[int, Person] = {}
        self.last_people: list[tuple[int, list]] = []  # (person id, landmarks) of the latest update, for drawing
        self._next = 1

    def configure(self, config: dict) -> None:
        self.config = validate_config(config)
        self.people.clear()

    # -- identity ---------------------------------------------------------
    def _assign(self, poses, now: float) -> list[tuple[Person, list]]:
        out, taken = [], set()
        cands = []
        for lm in poses:
            hip = _mid(lm, L_HIP, R_HIP)
            sh = _mid(lm, L_SH, R_SH)
            if hip is None or sh is None:
                continue
            torso = math.hypot(hip[0] - sh[0], hip[1] - sh[1])
            if torso < 0.02:
                continue
            cands.append((lm, hip, torso))
        pairs = sorted(((math.hypot(p.hip[0] - h[0], p.hip[1] - h[1]), pid, ci) for pid, p in self.people.items() for ci, (_, h, _) in enumerate(cands)))
        used_c = set()
        for d, pid, ci in pairs:
            if d > 0.3 or pid in taken or ci in used_c:
                continue
            taken.add(pid); used_c.add(ci)
            out.append((self.people[pid], ci))
        for ci in range(len(cands)):
            if ci not in used_c:
                p = Person(self._next)
                self._next += 1
                self.people[p.id] = p
                out.append((p, ci))
        res = []
        for p, ci in out:
            lm, hip, torso = cands[ci]
            p.hip, p.torso, p.last_seen = hip, torso, now
            res.append((p, lm))
        for pid in [k for k, p in self.people.items() if now - p.last_seen > self.hold_s]:
            del self.people[pid]
        return res

    # -- main -------------------------------------------------------------
    def update(self, poses: list, now: float) -> list[dict]:
        events: list[dict] = []
        assigned = self._assign(poses, now)
        self.last_people = [(p.id, lm) for p, lm in assigned]
        for person, lm in assigned:
            person.hist.append((now, person.hip[1]))
            for z in self.config["zones"]:
                fn = {"jump": self._jump, "climb": self._climb, "enter": self._enter}[z["trigger"]]
                if fn(person, lm, z, now):
                    person.last_fire[z["id"]] = now
                    events.append({"type": "zone", "zone": z["id"], "name": z["name"], "trigger": z["trigger"],
                                   "reward": z["reward"], "person": person.id, "t": now})
        return events

    def _cooling(self, p: Person, z: dict, now: float) -> bool:
        return now - p.last_fire.get(z["id"], -1e9) < z["cooldown"]

    def _jump(self, p: Person, lm, z: dict, now: float) -> bool:
        base = [y for t, y in p.hist if now - 1.6 <= t <= now - 0.4]
        if len(base) < 4:
            return False
        rise = (statistics.median(base) - p.hip[1]) / p.torso            # positive = hips higher than a moment ago
        thr = 0.34 / z["sensitivity"]
        ank = _mid(lm, L_ANK, R_ANK)
        if rise < 0.12:
            p.armed[z["id"]] = True
            if ank is not None:
                p.foot = ank
            return False
        if rise > thr and p.armed.get(z["id"], True) and not self._cooling(p, z, now):
            foot = p.foot or ank or p.hip
            if point_in_polygon(foot[0], foot[1], z["polygon"]):
                p.armed[z["id"]] = False
                return True
        return False

    def _climb(self, p: Person, lm, z: dict, now: float) -> bool:
        poly, zid = z["polygon"], z["id"]
        hands = [lm[i] for i in (L_WR, R_WR) if lm[i][2] >= MIN_VIS and point_in_polygon(lm[i][0], lm[i][1], poly)]
        reaching = [h for h in hands if h[1] < p.hip[1] - 0.4 * p.torso]    # a hand above the hips, on the wall
        if reaching and point_in_polygon(p.hip[0], p.hip[1], poly):
            p.contact[zid] = now
            p.anchor.setdefault(zid, p.hip[1])
            p.anchor[zid] = max(p.anchor[zid], p.hip[1])  # sliding back down lowers the bar, so the same height is not paid twice
            step = 0.55 * p.torso / z["sensitivity"]
            if p.anchor[zid] - p.hip[1] >= step and not self._cooling(p, z, now):
                p.anchor[zid] = p.hip[1]
                return True
        elif now - p.contact.get(zid, -1e9) > 0.8:
            p.anchor.pop(zid, None)
        return False

    def _enter(self, p: Person, lm, z: dict, now: float) -> bool:
        zid = z["id"]
        if point_in_polygon(p.hip[0], p.hip[1], z["polygon"]):
            p.inside_since.setdefault(zid, now)
            if now - p.inside_since[zid] >= 0.4 / z["sensitivity"] and not p.entered.get(zid) and not self._cooling(p, z, now):
                p.entered[zid] = True
                return True
        else:
            p.inside_since.pop(zid, None)
            p.entered[zid] = False
        return False
