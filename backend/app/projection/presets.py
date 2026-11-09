"""Ready-made scene layouts. They are starting points: adjust the corners in the layout editor on the real wall.

Quads are TL, TR, BR, BL in output-normalized coordinates (0..1 across the picture).
"""
from __future__ import annotations

from .scene import validate_scene


def rect(x0: float, y0: float, x1: float, y1: float) -> list[list[float]]:
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def game(sid: str, name: str, game_id: str, quad: list, **extra) -> dict:
    return {"id": sid, "name": name, "content": {"type": "game", "game": game_id}, "quad": quad, **extra}


def picture(sid: str, name: str, src: str, quad: list, **extra) -> dict:
    """A non-interactive decoration picture (needs no camera). Files come from scripts/make_sample_decor.py or your own media/."""
    return {"id": sid, "name": name, "content": {"type": "image", "src": src, "fit": "cover"}, "quad": quad, "interactive": False, **extra}


def slides(sid: str, name: str, srcs: list, quad: list, seconds: float = 30, **extra) -> dict:
    return {"id": sid, "name": name, "content": {"type": "slideshow", "srcs": srcs, "seconds": seconds, "fadeSeconds": 1.0, "fit": "cover"}, "quad": quad, **extra}


def video(sid: str, name: str, srcs: list, quad: list, fit: str = "cover", focus: tuple = (0.5, 0.5), **extra) -> dict:
    """A looping video; further srcs form the playlist stepped through by the "next" reaction."""
    return {"id": sid, "name": name, "content": {"type": "video", "src": srcs[0], "playlist": srcs[1:], "muted": True, "loop": True, "fit": fit, "focus": list(focus)},
            "quad": quad, "interactive": False, **extra}


GOLD = {"width": 14, "color": "#d4a937", "glow": True}  # thin gold picture-frame edge

PRESETS: dict[str, dict] = {
    "single": {
        "title": "One game, whole wall",
        "description": "The simplest layout: a single game fills the picture.",
        "scene": {"background": "#000000", "surfaces": [game("main", "Main wall", "menu", rect(0, 0, 1, 1))]},
    },
    "decor-4-sections": {
        "title": "Four decorations, no camera needed (2 x 2)",
        "description": "Four separate pictures (diya, lantern, rangoli, marigold garland) in a 2 x 2 grid. Needs the sample pictures: run scripts/make_sample_decor.py, or swap in your own from media/. Use the alignment grid and drag the corners onto your four wall sections.",
        "scene": {"background": "#000000", "surfaces": [
            picture("a", "Section 1", "/media/decor/diya.svg", rect(0.03, 0.04, 0.485, 0.48)),
            picture("b", "Section 2", "/media/decor/lantern.svg", rect(0.515, 0.04, 0.97, 0.48)),
            picture("c", "Section 3", "/media/decor/rangoli.svg", rect(0.03, 0.52, 0.485, 0.96)),
            picture("d", "Section 4", "/media/decor/marigold.svg", rect(0.515, 0.52, 0.97, 0.96)),
        ]},
    },
    "decor-4-reactive": {
        "title": "Four sections that wake up when touched (2 x 2, camera)",
        "description": "Each section is a slideshow that stays dim until a hand comes near, lights up, and moves to the next picture when touched. Needs the sample pictures (scripts/make_sample_decor.py) and a calibrated camera; hold hands close to the wall.",
        "scene": {"background": "#000000", "surfaces": [
            {**slides(k, f"Section {i + 1}", [f"/media/decor/{n}.svg" for n in order], rect(*r)), "interactive": True,
             "reaction": {"wake": True, "dim": 0.2, "hold": 5, "next": "touch"}}
            for i, (k, order, r) in enumerate([
                ("a", ["diya", "lantern", "rangoli", "marigold"], (0.03, 0.04, 0.485, 0.48)),
                ("b", ["lantern", "rangoli", "marigold", "diya"], (0.515, 0.04, 0.97, 0.48)),
                ("c", ["rangoli", "marigold", "diya", "lantern"], (0.03, 0.52, 0.485, 0.96)),
                ("d", ["marigold", "diya", "lantern", "rangoli"], (0.515, 0.52, 0.97, 0.96))])
        ]},
    },
    "fireworks-sky": {
        "title": "Fireworks sky (real footage, whole wall)",
        "description": "Real fireworks videos fill the wall, muted. With a camera, a wave across the wall jumps to the next clip. Needs the clips in media/fireworks/ (see ATTRIBUTION.md there); media/ is not part of the repo.",
        "scene": {"background": "#000000", "surfaces": [
            video("sky", "Fireworks sky", ["/media/fireworks/nagaoka-vesuvius.webm", "/media/fireworks/nagaoka-starmine.webm", "/media/fireworks/malta-festival.webm"],
                  rect(0, 0, 1, 1), interactive=True, reaction={"next": "wave"}),
        ]},
    },
    "four-videos-portrait": {
        "title": "Four tall videos side by side (night lights, rangoli, fireworks, lantern)",
        "description": "Four portrait videos in four columns across the wall, muted and looping. Needs the clips in media/pins/ (your own downloads; media/ is not part of the repo). Swap any clip in the Layout tab.",
        "scene": {"background": "#000000", "surfaces": [
            video(k, name, [f"/media/pins/{f}.mp4"], rect(0.0125 + i * 0.25, 0.03, 0.2375 + i * 0.25 + 0.0125, 0.97))
            for i, (k, name, f) in enumerate([("a", "Night lights", "night-lights"), ("b", "Rangoli", "diwali-aesthetic"),
                                                ("c", "Fireworks", "fireworks-night"), ("d", "Lantern", "lantern-wish")])
        ]},
    },
    "four-videos-grid": {
        "title": "Four videos in a 2 x 2 grid (night lights, rangoli, fireworks, lantern)",
        "description": "The four tall videos fill a 2 x 2 grid edge to edge, each scaled to cover its cell (the top and bottom are cropped, nothing is stretched). Needs the clips in media/pins/. Set a surface's Fit to contain to see a whole video, or fill to stretch it.",
        "scene": {"background": "#000000", "surfaces": [
            video(k, name, [f"/media/pins/{f}.mp4"], rect(*r))
            for k, name, f, r in [("a", "Night lights", "night-lights", (0, 0, 0.5, 0.5)), ("b", "Rangoli", "diwali-aesthetic", (0.5, 0, 1, 0.5)),
                                  ("c", "Fireworks", "fireworks-night", (0, 0.5, 0.5, 1)), ("d", "Lantern", "lantern-wish", (0.5, 0.5, 1, 1))]
        ]},
    },
    "wall-frames-6": {
        "title": "Wall frames: 6 boxes of the wooden panel wall (4 clips + 2 more)",
        "description": "Six videos placed inside the six upper boxes of the wooden panel wall (3 columns x 2 rows), fitted from a photo of the alignment grid with the projector at its 5 Nov position. The tops of the left and middle upper boxes are above the projector picture, so those two frames are cut short at the top; raise or tilt the projector up a little and re-fit to fill them. Moving the projector means re-fitting. Needs the clips in media/pins/ and media/fireworks/.",
        "scene": {"background": "#000000", "surfaces": [
            video("a", "Left tall frame", ["/media/pins/night-lights.mp4"], [[0.0423, 0.012], [0.1723, 0.012], [0.1579, 0.4243], [0.0139, 0.4039]]),
            video("b", "Middle big frame", ["/media/fireworks/nagaoka-vesuvius.webm"], [[0.1941, 0.012], [0.5159, 0.012], [0.5228, 0.4758], [0.1798, 0.4274]]),
            video("c", "Right frame", ["/media/pins/diwali-aesthetic.mp4"], [[0.537, 0.012], [0.7538, 0.0411], [0.7753, 0.5115], [0.5438, 0.4788]]),
            video("a2", "Left small frame", ["/media/pins/lantern-wish.mp4"], [[0.0117, 0.4463], [0.1568, 0.4665], [0.1507, 0.6912], [0.003, 0.6775]]),
            video("b2", "Middle wide frame", ["/media/fireworks/malta-festival.webm"], [[0.1787, 0.4695], [0.5233, 0.5174], [0.5262, 0.7255], [0.1726, 0.6932]]),
            video("c2", "Right wide frame", ["/media/fireworks/nagaoka-starmine.webm"], [[0.5444, 0.5204], [0.7772, 0.5527], [0.7862, 0.7492], [0.5473, 0.7274]]),
        ]},
    },
    "wall-4-gold": {
        "title": "Wall: four big gold-framed videos (2 x 2, across the beams)",
        "description": "Two columns x two rows as sketched on the wall photo: the left column sits between the first two vertical beams, the right column from the middle beam to the right edge of the picture, split at the long horizontal beam. Each frame has a thin gold border. Fitted from the alignment-grid photo with the projector at its 5 Nov position; moving the projector means re-fitting. Needs the clips in media/pins/ and media/fireworks/.",
        "scene": {"background": "#000000", "surfaces": [
            video("tl", "Top left", ["/media/pins/fireworks-night.mp4"], [[0.191, 0.012], [0.5163, 0.012], [0.5228, 0.4758], [0.1798, 0.4274]], focus=(0.5, 0.2), border=GOLD),
            video("tr", "Top right", ["/media/pins/diwali-aesthetic.mp4"], [[0.5374, 0.012], [0.875, 0.072], [0.875, 0.5256], [0.5438, 0.4788]], border=GOLD),
            video("bl", "Bottom left", ["/media/pins/lantern-wish.mp4"], [[0.1787, 0.4695], [0.5233, 0.5174], [0.5298, 0.985], [0.1647, 0.985]], border=GOLD),
            video("br", "Bottom right", ["/media/pins/night-lights.mp4"], [[0.5444, 0.5204], [0.875, 0.5663], [0.875, 0.985], [0.5509, 0.985]], border=GOLD),
        ]},
    },
    "greeting-gif": {
        "title": "Shubh Deepavali greeting (animated, whole wall)",
        "description": "The animated Shubh Deepavali greeting fills the wall. Needs media/decor/shubh-deepavali.gif (your own file; media/ is not part of the repo).",
        "scene": {"background": "#000000", "surfaces": [
            picture("greeting", "Shubh Deepavali", "/media/decor/shubh-deepavali.gif", rect(0, 0, 1, 1)),
        ]},
    },
    "diwali-wall": {
        "title": "Diwali wall (4 panels, one flat wall)",
        "description": "Light-the-diyas game on the left, fireworks sky and rangoli on the right, and a greeting strip. Works on any flat wall; no special mounting.",
        "scene": {"background": "#07041a", "surfaces": [
            game("diyas", "Light the diyas", "diyas", rect(0.02, 0.05, 0.64, 0.82)),
            game("sky", "Fireworks sky", "sky", rect(0.67, 0.05, 0.98, 0.45)),
            game("rangoli", "Rangoli", "rangoli", rect(0.67, 0.49, 0.98, 0.95)),
            {"id": "greeting", "name": "Greeting strip", "content": {"type": "color", "color": "#3a0f2c"}, "quad": rect(0.02, 0.85, 0.64, 0.95), "shape": "rounded", "interactive": False},
        ]},
    },
    "diwali-corner": {
        "title": "Diwali room corner (two walls + floor)",
        "description": "Aim the projector into a corner. Left wall: fireworks sky. Right wall: diyas. Floor: rangoli. The quads are rough guesses: drag the corners onto your real wall edges.",
        "scene": {"background": "#000000", "surfaces": [
            game("left", "Left wall", "sky", [[0.02, 0.12], [0.47, 0.2], [0.47, 0.72], [0.02, 0.86]]),
            game("right", "Right wall", "diyas", [[0.53, 0.2], [0.98, 0.12], [0.98, 0.86], [0.53, 0.72]]),
            game("floor", "Floor rangoli", "rangoli", [[0.2, 0.76], [0.8, 0.76], [0.96, 0.98], [0.04, 0.98]]),
        ]},
    },
    "sweets-and-fireworks": {
        "title": "Catch the sweets + fireworks",
        "description": "Sweets game on the main wall with a fireworks strip above it.",
        "scene": {"background": "#07041a", "surfaces": [
            game("sky", "Fireworks sky", "sky", rect(0.02, 0.03, 0.98, 0.28)),
            game("sweets", "Catch the sweets", "sweets", rect(0.02, 0.31, 0.98, 0.97)),
        ]},
    },
}

for _name, _p in PRESETS.items():  # fail at import time if a preset is invalid
    _p["scene"] = validate_scene(_p["scene"])


def listing() -> list[dict]:
    return [{"id": k, "title": v["title"], "description": v["description"], "surfaces": len(v["scene"]["surfaces"])} for k, v in PRESETS.items()]
