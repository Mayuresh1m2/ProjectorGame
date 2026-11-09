# Setup guide

Everything runs on one laptop. Tested on Ubuntu 26.04 (Wayland). The code is plain Python and JavaScript, so other
Linux distributions and macOS should work, but have **not** been tested.

## What you need

| Item | Notes |
|---|---|
| A laptop | Any 4-core machine from the last ~8 years runs hand tracking at 30 fps. Body pose (Playroom Quest) is about 3× heavier: expect ~15 fps on an older laptop (see [Measurements](MEASUREMENTS.md)). |
| An iPhone or any phone with a modern browser | Used as the camera. Same Wi-Fi as the laptop. Android + Chrome should also work (untested). |
| A projector (optional) | Anything with HDMI. Everything also works on the laptop screen. |
| Python 3.9–3.12 | MediaPipe has no wheels for newer Pythons. `scripts/setup.sh` uses [uv](https://docs.astral.sh/uv/) to get 3.11 if your system Python is too new. |
| Node.js 18+ (optional) | Only for the JavaScript and browser tests. |
| Chromium or Chrome (recommended) | Can place the game window on the projector. Firefox works; drag the window yourself. |

## Install

```bash
git clone <your-fork-url> butterfly-playground
cd butterfly-playground
scripts/setup.sh        # venv, dependencies, pose model (~6 MB), sample videos
scripts/doctor.sh       # checks everything and says what to fix
scripts/start.sh        # starts the server
```

`scripts/start.sh` prints three links:

* **Laptop:** `http://localhost:8000/` (game, control panel, projector setup).
* **Phone camera:** `https://<laptop-ip>:8443/camera.html?k=<key>`; the same link and a QR code are on the control panel.
* **Health:** `http://localhost:8000/api/health`.

Use `localhost` on the laptop. Requests that arrive by the laptop's LAN address are refused on purpose.

## Connect the phone

1. Phone and laptop on the same Wi-Fi (not a "guest" network; those often isolate devices from each other).
2. Open the phone link in Safari. Safari warns the certificate is not trusted: it is a private certificate generated on
   your laptop. Tap *Show Details → visit this website*.
3. Tap **Start camera**, allow camera access, prop the phone up, keep its screen on.
4. On the laptop open *Control panel → Camera*. It should say *streaming* with a frame rate, and show what the laptop sees.

If the phone cannot reach the laptop, see [Troubleshooting](TROUBLESHOOTING.md) (firewall rule, router isolation).

## Connect the projector

1. HDMI cable, then *Settings → Displays → Extend* (not mirror).
2. Open **Projector setup** (`/setup.html`): enter the projector's throw ratio and your distance to see the picture
   size, show the full-screen **test pattern** on the projector, and run the **latency test** (see
   [Projector setup](PROJECTOR_SETUP.md)).
3. *Control panel → Projector → Open output window* and choose the projector display, then calibrate (*Calibrate* tab).

## First run checklist

- [ ] `scripts/doctor.sh` reports no problems
- [ ] `http://localhost:8000/` opens; *Play butterflies* works with the mouse
- [ ] Phone shows *Streaming to laptop*; control panel shows the camera frame rate
- [ ] Health pill in the control panel says *all good*
- [ ] Calibrated (hand on the wall lines up with the green dot)
- [ ] Projector setup: latency measured and written down

## Updating

`git pull && scripts/setup.sh` (safe to re-run), then restart the server.

## Where your data lives

Everything personal stays in `data/` and `models/`, both git-ignored: settings, calibration, layouts, the Quest photo,
the camera key, the certificate, and logs. Delete the folder to reset. `media/` holds your own videos.
