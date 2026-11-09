"""Scene model: a list of surfaces (video frames, game areas, masked/warped regions) on the projector output.

quad: 4 corners (TL, TR, BR, BL) in output-normalized coordinates. A plain rectangle is a quad whose
corners form an axis-aligned rectangle; rotation and perspective warp are just different corner positions.
"""
from __future__ import annotations

import copy
import math

MAX_SURFACES = 24
SHAPES = {"rect", "ellipse", "rounded", "polygon"}
CONTENT_TYPES = {"game", "video", "color", "image", "slideshow"}
MAX_SLIDES = 60
MAX_PLAYLIST = 20
MAX_COORD = 3.0  # allow slightly off-screen corners, reject absurd values


class SceneError(ValueError):
    pass


def _num(v, what: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise SceneError(f"{what} must be a finite number")
    return float(v)


def _pt(p, what: str) -> list[float]:
    if not isinstance(p, (list, tuple)) or len(p) != 2:
        raise SceneError(f"{what} must be [x, y]")
    x, y = _num(p[0], what), _num(p[1], what)
    if abs(x) > MAX_COORD or abs(y) > MAX_COORD:
        raise SceneError(f"{what} out of range")
    return [x, y]


def _reaction(sid: str, r) -> dict:
    """How a surface answers hands: wake (dim until someone is near), next (touch or wave steps to the next picture/video)."""
    if r is None:
        r = {}
    if not isinstance(r, dict):
        raise SceneError(f"surface {sid}: reaction must be an object")
    nxt = r.get("next", "off")
    if nxt not in ("off", "touch", "wave"):
        raise SceneError(f"surface {sid}: reaction.next must be off, touch or wave")
    return {"wake": bool(r.get("wake", False)),
            "dim": min(0.9, max(0.0, _num(r.get("dim", 0.15), "reaction.dim"))),
            "hold": min(60.0, max(1.0, _num(r.get("hold", 4.0), "reaction.hold"))),
            "next": nxt}


def _focus(sid: str, f) -> list[float]:
    """Which part of a picture stays visible when "cover" crops it: [x, y] in 0..1 (0.5, 0.5 = centre)."""
    if f is None:
        return [0.5, 0.5]
    if not isinstance(f, (list, tuple)) or len(f) != 2:
        raise SceneError(f"surface {sid}: focus must be [x, y]")
    return [min(1.0, max(0.0, _num(f[0], "focus"))), min(1.0, max(0.0, _num(f[1], "focus")))]


def _border(sid: str, b) -> dict:
    """A picture-frame edge drawn on the surface: width in output pixels (0 = none), colour, optional soft glow."""
    if b is None:
        b = {}
    if not isinstance(b, dict):
        raise SceneError(f"surface {sid}: border must be an object")
    color = str(b.get("color", "#d4a937"))[:32]
    return {"width": min(60.0, max(0.0, _num(b.get("width", 0.0), "border.width"))), "color": color, "glow": bool(b.get("glow", True))}


def validate_scene(scene: dict) -> dict:
    if not isinstance(scene, dict) or not isinstance(scene.get("surfaces"), list):
        raise SceneError("scene.surfaces must be a list")
    if len(scene["surfaces"]) > MAX_SURFACES:
        raise SceneError(f"at most {MAX_SURFACES} surfaces")
    out = {"version": 1, "background": str(scene.get("background", "#000000"))[:32], "surfaces": []}
    seen: set[str] = set()
    for i, s in enumerate(scene["surfaces"]):
        if not isinstance(s, dict):
            raise SceneError(f"surface {i} must be an object")
        sid = str(s.get("id") or f"s{i}")
        if sid in seen:
            raise SceneError(f"duplicate surface id {sid!r}")
        seen.add(sid)
        quad = s.get("quad")
        if not isinstance(quad, list) or len(quad) != 4:
            raise SceneError(f"surface {sid}: quad needs exactly 4 corners")
        quad = [_pt(p, f"surface {sid} quad") for p in quad]
        area = 0.5 * abs(sum(quad[j][0] * quad[(j + 1) % 4][1] - quad[(j + 1) % 4][0] * quad[j][1] for j in range(4)))
        if area < 1e-5:
            raise SceneError(f"surface {sid}: quad has no area")
        shape = s.get("shape", "rect")
        if shape not in SHAPES:
            raise SceneError(f"surface {sid}: unknown shape {shape!r}")
        poly = [_pt(p, f"surface {sid} polygon") for p in s.get("polygon", [])]
        if shape == "polygon" and len(poly) < 3:
            raise SceneError(f"surface {sid}: polygon mask needs >= 3 points")
        content = copy.deepcopy(s.get("content") or {"type": "color", "color": "#223"})
        ctype = content.get("type")
        if ctype not in CONTENT_TYPES:
            raise SceneError(f"surface {sid}: unknown content type {ctype!r}")
        if ctype == "video":
            src = str(content.get("src", ""))
            if not src.startswith("/media/") or ".." in src:
                raise SceneError(f"surface {sid}: video src must be a file under /media/")
            vol = _num(content.get("volume", 0.8), "volume")
            content["volume"] = min(1.0, max(0.0, vol))
            content["playing"] = bool(content.get("playing", True))
            content["loop"] = bool(content.get("loop", True))
            content["muted"] = bool(content.get("muted", False))
            content["fit"] = content.get("fit") if content.get("fit") in ("cover", "contain", "fill") else "cover"
            content["rate"] = min(4.0, max(0.25, _num(content.get("rate", 1.0), "rate")))
            content["focus"] = _focus(sid, content.get("focus"))
            extra = content.get("playlist", [])  # more videos to step through with the "next" reaction (src is the first)
            if not isinstance(extra, list) or len(extra) > MAX_PLAYLIST:
                raise SceneError(f"surface {sid}: playlist can hold at most {MAX_PLAYLIST} extra videos")
            for src in extra:
                if not isinstance(src, str) or not src.startswith("/media/") or ".." in src:
                    raise SceneError(f"surface {sid}: playlist entries must be files under /media/")
            content["playlist"] = list(extra)
        if ctype in ("image", "slideshow"):
            srcs = [content.get("src", "")] if ctype == "image" else content.get("srcs", [])
            if not isinstance(srcs, list) or (ctype == "slideshow" and not 1 <= len(srcs) <= MAX_SLIDES):
                raise SceneError(f"surface {sid}: slideshow needs 1-{MAX_SLIDES} pictures")
            for src in srcs:
                if not isinstance(src, str) or not src.startswith("/media/") or ".." in src:
                    raise SceneError(f"surface {sid}: picture src must be a file under /media/")
            content["fit"] = content.get("fit") if content.get("fit") in ("cover", "contain", "fill") else "cover"
            content["focus"] = _focus(sid, content.get("focus"))
            if ctype == "slideshow":
                content["srcs"] = list(srcs)
                content["seconds"] = min(600.0, max(2.0, _num(content.get("seconds", 10.0), "seconds")))
                content["fadeSeconds"] = min(5.0, max(0.0, _num(content.get("fadeSeconds", 1.5), "fadeSeconds")))
                content["shuffle"] = bool(content.get("shuffle", False))
        out["surfaces"].append({
            "id": sid, "name": str(s.get("name", sid))[:60], "visible": bool(s.get("visible", True)),
            "content": content, "quad": quad, "shape": shape, "polygon": poly,
            "interactive": bool(s.get("interactive", True)),
            "reaction": _reaction(sid, s.get("reaction")),
            "border": _border(sid, s.get("border")),
        })
    return out
