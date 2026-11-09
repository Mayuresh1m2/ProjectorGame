"""Configuration: defaults, environment overrides and JSON persistence in data/."""
from __future__ import annotations

import copy
import json
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("PLAYGROUND_DATA_DIR", ROOT / "data"))
MEDIA_DIR = Path(os.environ.get("PLAYGROUND_MEDIA_DIR", ROOT / "media"))
FRONTEND_DIR = ROOT / "frontend"

HTTP_PORT = int(os.environ.get("PLAYGROUND_HTTP_PORT", "8000"))    # loopback only (laptop)
HTTPS_PORT = int(os.environ.get("PLAYGROUND_HTTPS_PORT", "8443"))  # LAN (phone camera)
HTTPS_ENABLED = os.environ.get("PLAYGROUND_HTTPS", "1") != "0"

VIDEO_EXTENSIONS = {".mp4", ".webm", ".m4v", ".mov", ".ogv"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | IMAGE_EXTENSIONS

DEFAULT_SETTINGS: dict = {
    "game": {
        "butterflies": 8,           # number of free butterflies kept in the air
        "speed": 1.0,               # movement speed multiplier
        "interactionDistance": 0.07,  # landing distance, fraction of min(width, height)
        "spawnRate": 0.8,           # butterflies per second when below target count
        "animationSpeed": 1.0,      # wing flap / effects speed multiplier
        "duration": 0,              # seconds, 0 = endless
        "difficulty": "normal",     # easy | normal | hard
        "sound": True,
        "shyCount": 10,             # Shy butterflies: how many
        "shySize": 1.0,             # Shy butterflies: size multiplier
    },
    "tracking": {
        "maxHands": 2,
        "minCutoff": 1.2,           # One-Euro filter: lower = smoother, laggier
        "beta": 12.0,               # One-Euro filter: higher = less lag when moving fast
        "holdMs": 350,              # keep a lost hand alive (frozen, flagged) this long
        "minConfidence": 0.5,
        "targetFps": 30,
        "handsFromPose": True,      # in pose mode also publish each visible wrist as a hand for the hand games
        "maxDegrade": 3,            # 0-3: lowest quality level auto-degrade may use (1 = keep full 640 px input for far hands)
        "mode": "hands",            # hands | pose (pose = full body, for Playroom Quest)
    },
    "cues": {
        "enabled": True,            # presence / gesture cues from the camera (no identity, nothing stored)
    },
    "output": {
        "mode": "fill",             # fill = use the whole window, fixed = fixed logical resolution
        "width": 1920,
        "height": 1080,
        "fit": "contain",           # contain (keep aspect, letterbox) | stretch
    },
    "camera": {"width": 1280, "height": 720, "frameRate": 30},
}

DEFAULT_SCENE: dict = {
    "version": 1,
    "background": "#000000",
    "surfaces": [
        {
            "id": "main",
            "name": "Main wall",
            "visible": True,
            "content": {"type": "game", "game": "menu"},
            "quad": [[0, 0], [1, 0], [1, 1], [0, 1]],
            "shape": "rect",
            "polygon": [],
            "interactive": True,
        }
    ],
}


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


class JsonStore:
    """Tiny atomic JSON file store (settings, calibration, scene). No database needed."""

    def __init__(self, name: str, default: dict, data_dir: Path | None = None):
        self.path = (data_dir or DATA_DIR) / name
        self.default = default
        self._lock = threading.Lock()

    def load(self) -> dict:
        with self._lock:
            try:
                return deep_merge(self.default, json.loads(self.path.read_text()))
            except (FileNotFoundError, json.JSONDecodeError):
                return copy.deepcopy(self.default)

    def save(self, value: dict) -> dict:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(value, indent=2))
            os.replace(tmp, self.path)
        return value
