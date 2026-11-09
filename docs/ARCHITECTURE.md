# Architecture

```
phone (Safari/Chrome)                       laptop
┌────────────────────┐   WebRTC video   ┌──────────────────────────────────────────────┐
│ camera.html        │ ───────────────► │ aiortc receiver ──► latest-frame slot        │
│ getUserMedia       │   (LAN, no STUN) │            │  (older frames dropped, never   │
└────────────────────┘                  │            ▼   queued)                       │
                                        │  tracking worker thread                      │
                                        │   hands: MediaPipe Hands → tracker → smoothing│
                                        │   pose:  MediaPipe Pose  → zone engine       │
                                        │   cues:  motion / gesture detectors          │
                                        │   calibration (homography)                   │
                                        │            │                                 │
                                        │  health monitor · event log · metrics        │
                                        │            ▼                                 │
                                        │  FastAPI + WebSocket hub (loopback only)     │
                                        └────────────┬─────────────────────────────────┘
                                                     │ JSON: hands/poses/zone/cue/health/stats
                                   ┌─────────────────┴────────────────┐
                              game window (projector)        control panel / setup page
```

## Backend (`backend/app/`)

| Module | Job |
|---|---|
| `main.py` | App factory, HTTP on `127.0.0.1:8000`, HTTPS on `0.0.0.0:8443`, all endpoints, WebSocket |
| `camera/receiver.py` | Accepts the phone's WebRTC offer, hands decoded frames on; frame counters and age |
| `tracking/pipeline.py` | One worker thread: latest frame → detector (hands or pose) → publish. Adaptive quality, drop counters, liveness, cue hooks |
| `tracking/detector.py`, `hands.py`, `tracker.py`, `smoothing.py` | MediaPipe Hands wrapper, normalization, stable ids with dropout hold, One-Euro filter |
| `tracking/pose.py` | MediaPipe Pose Landmarker (up to 4 people) |
| `tracking/cues.py` | Presence (frame differencing, ignores exposure jumps) and gestures (fist→open, two hands) |
| `quest/engine.py` | Zones, per-person state, jump/climb/enter rules, config validation |
| `projection/calibration.py`, `scene.py`, `presets.py` | Camera→wall homography, surface/mask validation, ready-made layouts |
| `health.py` | Pure `evaluate()` checks, event log, hysteresis monitor, file logging, metrics text |
| `latency.py` | Flash-based display-to-camera latency probe |
| `hub.py` | WebSocket fan-out, replays last settings/scene/calibration/stats/health/quest to new clients |
| `config.py` | Defaults, env overrides, atomic JSON stores in `data/` |

Design rules: detectors and the zone engine import nothing from FastAPI, so they are unit-tested directly; everything
that shows frames, hands, media or settings answers loopback clients only; the camera endpoint needs the access key.

## Frontend (`frontend/`, no build step)

Plain ES modules and Canvas 2D. A `Game` (`js/core/game.js`) receives hands in its own pixel space plus optional events
(`tap`, `cue`, `zone`) and never sees camera, calibration or projector. Surfaces are canvas/video elements warped with a
CSS `matrix3d` homography and masked with `clip-path`. Games: butterflies, fish, balloons, Diwali (diyas, sweets,
rangoli, fireworks sky) and Playroom Quest.

Add a game: create `frontend/js/games/<name>/index.js` exporting a `Game` subclass with `static meta`, then add one line
in `games/index.js`. Keep the rules in a pure `logic.js` and test it in `tests/js/`.

## Messages over `/ws`

Server → pages: `hands`, `poses`, `zone`, `cue`, `stats`, `health`, `settings`, `scene`, `calibration`, `quest`.
Pages → server: `command` (relayed to other pages), `report` (game window fps), `cue` (clap heard by a game window).

## Security model

* Loopback-only: API, WebSocket, `/media`, preview, health, metrics.
* LAN: static pages over HTTPS and `/api/camera/offer` (random key in `data/camera_token`, constant-time compare).
* Self-signed certificate generated locally, regenerated when the LAN address changes.
* No STUN/TURN, no outbound connections at runtime (the only downloads are `scripts/setup.sh` and `scripts/fetch_models.sh`).
* Frames live in memory; the preview JPEG exists only while the control panel polls; the Quest photo is saved only when
  you press the button.
* Microphone (clap detection) is off until pressed, analysed in the browser, never recorded.

Anyone on your Wi-Fi who has the camera link can push video to your laptop. Treat the link like a password.
