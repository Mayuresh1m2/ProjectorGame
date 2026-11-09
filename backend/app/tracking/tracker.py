"""Associates detections across frames: stable ids, smoothing, dropout handling."""
from __future__ import annotations

import math

from .hands import Hand, RawHand, fingertips, palm_center
from .smoothing import PointFilter

MAX_MATCH_DIST = 0.30  # normalized; a hand cannot move farther than this between frames and keep its id


class _Track:
    def __init__(self, hid: int, cfg: dict):
        self.id = hid
        self.cfg = cfg
        self.filters = [PointFilter(cfg["minCutoff"], cfg["beta"]) for _ in range(22)]  # 21 lm + palm
        self.last_seen = 0.0
        self.hand: Hand | None = None
        self.age = 0

    def update(self, raw: RawHand, t: float) -> Hand:
        lms = [self.filters[i](x, y, t) for i, (x, y) in enumerate(raw.landmarks)]
        px, py = palm_center(raw.landmarks)
        palm = self.filters[21](px, py, t)
        self.last_seen = t
        self.age += 1
        self.hand = Hand(
            id=self.id, confidence=raw.confidence, handedness=raw.handedness, landmarks=lms,
            palm=palm, tips=fingertips(lms), velocity=self.filters[21].velocity, timestamp=t,
        )
        return self.hand


class HandTracker:
    """Stateful: feed `update(detections, t)` once per camera frame.

    * Greedy nearest-palm matching keeps ids stable while hands move.
    * One-Euro smoothing per landmark.
    * A hand that vanishes is kept for `holdMs` (flagged lost=True, position frozen, velocity zeroed)
      so single missed frames do not make butterflies abandon a hand; after that it is dropped,
      and a re-appearing hand gets a *new* id and fresh filters (no jump from stale state).
    """

    def __init__(self, cfg: dict):
        self.cfg = dict(cfg)
        self._tracks: dict[int, _Track] = {}
        self._next_id = 1

    def configure(self, cfg: dict) -> None:
        self.cfg.update(cfg)
        for tr in self._tracks.values():
            tr.cfg = self.cfg
            for f in tr.filters:
                f.fx.min_cutoff = f.fy.min_cutoff = self.cfg["minCutoff"]
                f.fx.beta = f.fy.beta = self.cfg["beta"]

    def reset(self) -> None:
        self._tracks.clear()

    def update(self, detections: list[RawHand], t: float) -> list[Hand]:
        dets = [d for d in detections if d.confidence >= self.cfg["minConfidence"]]
        dets.sort(key=lambda d: -d.confidence)
        dets = dets[: int(self.cfg["maxHands"])]

        # candidate (distance, track, det) pairs, greedy by distance
        pairs = []
        for tr in self._tracks.values():
            if tr.hand is None:
                continue
            for di, d in enumerate(dets):
                px, py = palm_center(d.landmarks)
                dist = math.hypot(px - tr.hand.palm[0], py - tr.hand.palm[1])
                if dist <= MAX_MATCH_DIST:
                    pairs.append((dist, tr.id, di))
        pairs.sort()
        used_t: set[int] = set()
        used_d: set[int] = set()
        out: list[Hand] = []
        for _, tid, di in pairs:
            if tid in used_t or di in used_d:
                continue
            used_t.add(tid)
            used_d.add(di)
            out.append(self._tracks[tid].update(dets[di], t))

        for di, d in enumerate(dets):
            if di in used_d:
                continue
            tr = _Track(self._next_id, self.cfg)
            self._next_id += 1
            self._tracks[tr.id] = tr
            out.append(tr.update(d, t))

        hold = self.cfg["holdMs"] / 1000.0
        for tid in list(self._tracks):
            if tid in used_t or any(h.id == tid for h in out):
                continue
            tr = self._tracks[tid]
            if tr.hand is not None and t - tr.last_seen <= hold:
                h = tr.hand
                out.append(Hand(h.id, h.confidence * 0.5, h.handedness, h.landmarks, h.palm, h.tips,
                                (0.0, 0.0), h.timestamp, lost=True))
            else:
                del self._tracks[tid]
        out.sort(key=lambda h: h.id)
        return out
