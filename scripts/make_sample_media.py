#!/usr/bin/env python3
"""Generate small, original sample clips (WebM/VP8) in media/ so the video-frame features can be tried
without any family footage. Needs only opencv + numpy (already in the venv)."""
import math
import pathlib

import cv2
import numpy as np

OUT = pathlib.Path(__file__).resolve().parents[1] / "media"
W, H, FPS, SECS = 640, 360, 24, 8


def writer(name):
    OUT.mkdir(exist_ok=True)
    vw = cv2.VideoWriter(str(OUT / name), cv2.VideoWriter_fourcc(*"VP80"), FPS, (W, H))
    if not vw.isOpened():
        raise SystemExit("this OpenCV build cannot write VP8/WebM")
    return vw


def underwater(t, rng_state):
    y = np.linspace(0, 1, H)[:, None]
    base = np.zeros((H, W, 3), np.float32)
    base[..., 0] = 200 - 120 * y          # B
    base[..., 1] = 170 - 100 * y          # G
    base[..., 2] = 40 + 20 * y            # R
    img = base.astype(np.uint8)
    for i, (x0, s, r) in enumerate(rng_state):                                # bubbles rising
        yy = (H + 20) - ((t * (40 + 30 * s) + i * 37) % (H + 40))
        xx = x0 + 12 * math.sin(t * 2 + i)
        cv2.circle(img, (int(xx), int(yy)), int(r), (255, 240, 220), 1, cv2.LINE_AA)
    for i in range(3):                                                         # fish
        fx = int((t * (60 + 25 * i) + i * 210) % (W + 120)) - 60
        fy = int(H * (0.3 + 0.2 * i) + 15 * math.sin(t * 2 + i))
        col = [(60, 140, 255), (80, 220, 255), (200, 120, 255)][i]
        cv2.ellipse(img, (fx, fy), (28, 13), 0, 0, 360, col, -1, cv2.LINE_AA)
        cv2.fillConvexPoly(img, np.array([[fx - 24, fy], [fx - 44, fy - 12], [fx - 44, fy + 12]]), col, cv2.LINE_AA)
        cv2.circle(img, (fx + 14, fy - 3), 3, (255, 255, 255), -1, cv2.LINE_AA)
    return img


def colorwheel(t, _):
    img = np.zeros((H, W, 3), np.uint8)
    hue = int((t * 20) % 180)
    img[:] = cv2.cvtColor(np.uint8([[[hue, 120, 200]]]), cv2.COLOR_HSV2BGR)[0, 0]
    for i in range(7):
        a = t * 0.8 + i * 2 * math.pi / 7
        c = cv2.cvtColor(np.uint8([[[(hue + 25 * i) % 180, 200, 255]]]), cv2.COLOR_HSV2BGR)[0, 0].tolist()
        cv2.circle(img, (int(W / 2 + 120 * math.cos(a)), int(H / 2 + 100 * math.sin(a))), 38, c, -1, cv2.LINE_AA)
    cv2.putText(img, "Sample clip B", (20, H - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
    return img


def waterfall(t, _):
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = (90, 60, 40)
    rng = np.random.default_rng(1)
    for i in range(160):
        x = int(rng.integers(W // 4, 3 * W // 4)); speed = 120 + rng.integers(0, 160)
        y = int((t * speed + rng.integers(0, H)) % H)
        cv2.line(img, (x, y), (x, y + 22), (255, 235, 210), 2, cv2.LINE_AA)
    return img


for name, fn in (("sample-underwater.webm", underwater), ("sample-colors.webm", colorwheel), ("sample-waterfall.webm", waterfall)):
    rng = np.random.default_rng(7)
    state = [(float(rng.integers(20, W - 20)), float(rng.random()), float(rng.integers(4, 12))) for _ in range(18)]
    vw = writer(name)
    for f in range(FPS * SECS):
        vw.write(fn(f / FPS, state))
    vw.release()
    print("wrote", OUT / name)
