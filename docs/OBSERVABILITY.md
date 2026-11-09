# Observability and failure detection

A projector game that silently stops reacting is the worst failure: nobody knows whether the phone, the Wi-Fi, the
laptop or the code is to blame. So the server measures itself every second, explains problems in plain language, and
fixes what it safely can.

## Where to look

| What | Where |
|---|---|
| One-line status + every check with a "what to try" hint | Control panel → **Health** tab (and the pill in the header) |
| A coloured dot on the game screen (green / amber / red), banner if the camera is lost | Game window, bottom-right buttons |
| Same checks as JSON | `GET http://localhost:8000/api/health` |
| Timeline of what changed ("camera lost", "recovered") | Health tab → *Recent events*, or `GET /api/events?after=<id>` |
| Numbers for graphs | `GET /api/metrics` (Prometheus text format) |
| Persistent log (rotates at 1 MB, keeps 3) | `data/logs/playground.log` |
| Everything at once, from the terminal | `scripts/doctor.sh` |
| Live numbers while playing | Press `D` in the game window |

All of these answer only on the laptop itself (loopback).

## The checks

Each check is `ok`, `info` (worth knowing, not a problem), `warn` (degraded) or `fail` (broken). The overall status is
`ok`, `degraded` (any warn) or `down` (any fail). Evaluated once per second.

| Check | Fails / warns when | Typical cause | What it tells you to do |
|---|---|---|---|
| `camera` | **fail**: connection `disconnected`/`failed`, or "connected" but no frame for > 3 s. **warn**: < 15 fps, or still connecting after 15 s. | Phone locked or Safari in background; Wi-Fi drop; firewall; phone battery | Keep the screen on, check Wi-Fi, tap Start camera |
| `tracking` | **fail**: worker thread dead, or no processed frame for > 3 s while streaming. **warn**: errors in the last minute, or slower than the frame budget | Laptop overloaded; bad frames | Close other apps; read the log |
| `latency` | **warn**: frame-to-hands delay above 150 ms | Tracking falling behind | As above |
| `frames` | **warn**: more than 30% of frames skipped (rolling window) | Camera faster than tracking can keep up | Lower the camera frame rate or resolution |
| `display` | **warn**: game window below 30 fps, or silent for 6 s | Heavy page, background tab, weak GPU | Close other tabs, lower resolution |
| `pose-model` | **fail** in pose mode if the model file is missing | Setup skipped the download | `scripts/fetch_models.sh` |
| `network` | **warn**: HTTPS disabled, or no LAN address | `PLAYGROUND_HTTPS=0`; not on Wi-Fi | Fix and restart |
| `calibration` | **info**: not calibrated | First run | Calibrate tab |
| `server` | always ok if you can read this | | |

Status changes become events only after two consecutive seconds (so a one-frame glitch does not flap), and each
recovery is logged too.

## What the server repairs by itself

* **Dead tracking thread** → restarted, event logged.
* **Camera "connected" but silent for 10 s** → the session is dropped so the phone page's own retry loop reconnects.
* **Bad frame** → counted, skipped, the worker keeps running.
* **Slow tracking** → steps down to a lighter model and smaller image, steps back up when there is headroom.
* **Slow rendering** → the game lowers effect quality automatically.
* **Phone page** retries with back-off after a lost connection or camera track, and keeps the screen awake.

## Metrics

`GET /api/metrics`, all gauges: `playground_uptime_seconds`, `playground_health_status` (0 ok, 1 degraded, 2 down),
`playground_camera_connected`, `playground_camera_fps`, `playground_camera_frames_total`, `playground_tracking_fps`,
`playground_tracking_ms`, `playground_tracking_latency_ms`, `playground_tracking_level`,
`playground_tracking_errors_total`, `playground_tracking_frames_dropped_total`, `playground_tracking_thread_alive`,
`playground_cues_total`, `playground_display_windows`, `playground_display_fps`.

A quick local watch: `watch -n1 'curl -s localhost:8000/api/metrics | grep -v "^#"'`.

## Measuring the full delay

`/setup.html` → **Latency test** flashes the projector and measures how long until the laptop receives a camera frame
showing the flash. It includes projector delay, phone capture, Wi-Fi and decoding, which nothing on the laptop alone
can see. See [Projector setup](PROJECTOR_SETUP.md).

## Privacy

Observability data contains numbers and status text only: no images, no audio, no names. Events live in memory (last
500) and in the local log file. Nothing is sent anywhere.

## Adding a check

Checks are a pure function: `evaluate(inputs)` in `backend/app/health.py`. Add the measurement to
`AppState.health_inputs()` in `main.py`, add a branch in `evaluate()` returning `check(id, status, message, hint)`,
and add a test in `tests/test_health.py` (the existing ones show how to build the input dictionary).
