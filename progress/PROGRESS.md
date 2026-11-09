# Progress log

Newest first. "Verified" means a test or measurement was actually run; "not verified" means exactly that. Update this
file whenever something is built, measured or learned, so anyone reproducing the setup can see where things stand.

## Status at a glance

| Area | State | How it was verified | Not verified |
|---|---|---|---|
| Butterfly / fish / balloon games | Done | Unit tests, browser test (60 fps, no errors) | Audio output, real hands |
| Diwali games (diyas, sweets, rangoli, sky) | Done | Unit tests, browser test through the menu, screenshots reviewed | Real hands; taste of a real 5-year-old |
| Phone camera over HTTPS + WebRTC | Done | Real WebRTC loopback test; Chromium fake camera over self-signed HTTPS | **Real iPhone / Safari** |
| Hand tracking (MediaPipe) | Done | Real model on a hand photo; unit tests for smoothing, ids, dropouts | Real moving hands |
| Calibration (camera → wall) | Done | Maths unit tests | Against a real wall |
| Projector output, surfaces, warp, masks | Done | Browser tests, Chromium + Firefox engines | **Real projector / second display** |
| Presets (Diwali wall, corner, sweets) | Done | Validated at import, API test | Fit on a real wall (corner quads are rough) |
| Observability, failure detection, self-healing | Done | 40+ tests; failure injection (`tests/e2e/failure.mjs`: phone vanishes → flagged in ~4 s, session reset, recovery logged) | Real Wi-Fi loss / locked phone |
| Setup helper: calculator, test pattern | Done | Unit + browser test | On a real projector |
| Setup helper: latency test | Done (logic) | Synthetic frame sequences with known delay (±1 frame), "no flash seen" paths, API, page flow without a camera | **Through a real phone camera and projector**: this is the first thing to run |
| Cues: presence, fist-open, two hands | Done (logic) | Synthetic frames and landmarks | Real room, real people |
| Cue: clap (microphone) | Done (logic) | Synthetic level sequences | Real microphone and room noise |
| Playroom Quest: engine, editor, scoreboard, finale | Done | 21 engine tests (jump, climb, enter, multi-person, bad config), real pose model on a photo, WebRTC → pose → editor → finale in the browser | **Real children, real stairs and wall**; thresholds need tuning |
| Spoken "Happy Diwali" | Not built | | Needs a local speech model (Vosk/Whisper) |
| Time-of-day cues | Not built | | |
| Face recognition / greeting by name | Deliberately not built | | Needs consent design first |
| Drawings come alive, memory wall, shadow puppets | Not built | | Ideas only |

Tests: **154 Python, 50 JavaScript** passing (`scripts/test.sh`), plus browser tests in `tests/e2e/`.

## Weekend hardware checklist (projector arrives)

Do these in order and write the result in the table at the bottom.

1. [x] `scripts/doctor.sh`: no ✘. Start the server, phone camera connected, Health pill green. (2026-10-28: phone connected, camera green in Health)
2. [ ] `/setup.html`: enter throw ratio and distance; compare the calculated width with a tape measure.
3. [ ] Test pattern on the projector: border fully visible? circle round? text readable from where the kids stand?
4. [ ] **Latency test** (phone aimed at the lit wall, dim room). Record median and range. If it says the flash was not seen, fix aim/lighting first.
5. [ ] Calibrate. Move a hand across the wall: does the green dot follow?
6. [ ] Diwali wall layout (*Layout & videos → ready-made*): adjust corners to the real wall.
7. [ ] Light the diyas with real hands: does the warm-up (0.35 s) feel right?
8. [ ] Clap test (🎤 in the game window): does a clap fire? does talking or music misfire? Adjust `ClapDetector` thresholds in `frontend/js/core/cues.js` if needed.
9. [ ] Presence cue: walk in and out of view; check the event log (Health tab) shows `presence` once per arrival.
10. [ ] Playroom Quest: switch to pose, photo from the live frame, draw the stairs and wall, test with an adult first (jump, climb), tune each zone's sensitivity, then with the kids supervised.
11. [ ] Pull the phone's power or lock its screen for 30 s: Health should show the camera problem, the log should record it, and tapping Start camera should recover.
12. [ ] Note anything that surprised you under "Real-world findings" below.

## Real-world measurements (fill in)

| Date | Measurement | Value | Conditions |
|---|---|---|---|
| | Latency, flash → laptop frame (median, range) | | phone model, Wi-Fi band, projector model + mode |
| | Camera fps (Health tab) | | |
| | Tracking ms/frame, hands | | |
| | Tracking ms/frame, pose | | |
| | Game render fps on projector | | |

## Real-world findings (fill in)

* 2026-10-28: Projector connected over HDMI; Ubuntu (X11 via xrandr) sees it as an extended display `HDMI-1` 1920x1080 at +1920+0, right of the laptop screen `eDP-1`. Game window opened on the projector. iPhone connected over the camera link and Health shows the camera green.
* Not yet done: setup.html size check, test pattern review, calibration, hand-follow test, latency test (all still unchecked above; numbers table still empty).

---

## 2026-10-31: second hardware session (Android camera)

* Android phone (Chrome) used as camera; "empty response" was the phone requesting `http://` on the HTTPS port: scan the QR code or type the full `https://` link.
* Projector's built-in browser cannot run the game (game and hand data are loopback-only by design); use HDMI and drag the game window onto the projector.
* Far hands were missed: tracking had auto-degraded to level 3 (320 px). Added `tracking.maxDegrade` (default 3; set 1 to keep 640 px input).
* Finding: kids touch the wall, so hands are edge-on, fists or backs of hands, the weak case for the hand model. Plan: experiment on branch `pose-wrist-hands` that feeds pose wrists to the hand games. Baseline kept on `master`, tag `v0.2-hand-tracking`.

* **Result (2026-10-31):** pose-wrist hands on branch `pose-wrist-hands` feel "much better" than hand tracking for kids touching the wall (user test, adult at the wall). Cost: pose ~59 ms/frame on the dev laptop, ~49% of camera frames skipped, so about 15 updates/s; Health shows a slow-tracking warning. Not yet measured: latency test, children, several people.

* New game **Shy butterflies** (`games/friends/`): butterflies circle a still person, all flee on a fast hand (> 1.1 screen-heights/s) or a jump (centre of hands > 0.55 heights/s), return after ~1.2 s of calm. Unit-tested and browser-checked with simulated hands; thresholds are guesses and need tuning with real people at the wall.

* **Decorations without the camera** (2026-11-01): new surface types `image` and `slideshow` (media/ PNG, JPG, WebP, GIF, SVG), alignment grid on the wall (control panel, Layout tab), sample pictures via `scripts/make_sample_decor.py`, ready-made layout `decor-4-sections`. Non-interactive by default. Checked in the browser with the sample pictures; not yet fitted to the real wall sections.

## 2026-10-28 (later): first hardware session

* Projector plugged in via HDMI, detected as extended display, game window running on it.
* iPhone camera connected; Health tab camera check green.
* **Stopped here.** Pick up at checklist step 2/3 (setup page), then calibrate (5) and the latency test (4).
* Nothing from this or the earlier build session is committed yet.

## 2026-10-28: Diwali content, Quest, cues, docs

* Diwali games: **Light the diyas**, **Catch the sweets**, **Rangoli** (8-fold symmetry), **Fireworks sky**; shared drawing in `diwali/fx.js`; logic in pure classes with tests. Fixed a bug found by looking at the rendered rangoli: string hand ids (`"mouse"`) produced an undefined colour (black strokes); `colorFor()` and a test now cover it.
* Scene presets: single, Diwali wall (4 panels), Diwali corner (two walls + floor), sweets + fireworks. API: `GET /api/presets`, `POST /api/presets/{name}/apply`; every preset is validated at import.
* Cues: `presence`, `presence-end`, `gesture-fist-open`, `two-hands` (server), `clap` (game window microphone, off until pressed, visible indicator). Presence ignores whole-picture brightness jumps so the latency-test flash is not mistaken for a person.
* **Playroom Quest**: zone engine (`backend/app/quest/engine.py`) with jump / climb / enter rules scaled by torso length; MediaPipe Pose Landmarker (model download script, ~6 MB, then offline); photo of the room from the live frame or an upload; polygon editor with live skeleton; scoreboard and finale (fireworks, sweets, "Happy Diwali!"). Measured: pose ≈ 44 ms/frame standalone, ≈ 51 ms (≈ 19 fps steady) inside the full system on the dev laptop, with a slow first ~2 s while the model starts (earlier readings of 14–15 fps were taken while the adaptive input-size reduction was active and other tests were loading the CPU; the reduction did not speed pose up, so it was removed for pose mode). Pose mode disables the input-size degradation (it does not help pose and only hurts accuracy) and uses a 50 ms frame budget.
* Docs: README rewritten as an index; `docs/` (setup, user guide, projector setup, Diwali, Quest, observability, troubleshooting, architecture, measurements); `scripts/doctor.sh`; CI workflow for the unit tests.
* Found while testing: `tests/e2e/games.mjs` assumed every game has a start overlay; ambient games do not. Fixed the test.

## 2026-10-27: Observability, failure detection, setup helper

* **Health** (`backend/app/health.py`): pure `evaluate()` over camera, tracking, latency, frame drops, display, pose model, network, calibration; each check has a message and a hint. Hysteresis (2 s) before status changes become events; recoveries are logged too.
* Event ring buffer (500) + rotating log file `data/logs/playground.log`; WARNING+ log records mirrored into events.
* Endpoints: `/api/health`, `/api/events`, `/api/metrics` (Prometheus text). UI: Health tab, header pill, HUD dot on the game, banner when the camera fails.
* Self-healing: dead tracking thread restarted; camera "connected" but silent for 10 s → session dropped so the phone page reconnects.
* Found by failure injection: the first version warned "86% frames skipped" right after start-up because the drop ratio was cumulative and included model warm-up. Now a rolling 150-frame window that needs 60 frames to judge. Also the watchdog fired twice because the reset was not awaited; fixed.
* Found: `hostname -I` was called every second on the event loop; now cached for 30 s and run in a thread.
* Setup helper (`/setup.html`): coverage calculator, test pattern, **latency test** (flash → camera frame, server keeps only a 32×18 brightness number per frame while armed). Reports skipped trials with reasons instead of guessing.

## Earlier: core system (first session)

* Butterfly game with mouse/touch; iPhone camera over HTTPS + WebRTC (aiortc), self-signed certificate with LAN SANs, access key for the phone link; MediaPipe hand tracking with One-Euro smoothing, stable ids and dropout hold; calibration by homography; projector output window; video frames; multi-surface layout editor with warp and masks; game framework + menu; fish and balloon games; adaptive quality; 87 Python + 28 JS tests; Playwright end-to-end tests including a fake phone camera over real HTTPS/WebRTC.
* Environment notes: Ubuntu 26.04 ships Python 3.14, which has no MediaPipe wheels, so `scripts/setup.sh` uses uv to create a Python 3.11 venv.
* Gotcha: `pkill -f` / `pgrep -f` with a pattern that appears in your own command line kills your shell; find the server with `ss -ltnp 'sport = :8000'` instead.
* Gotcha: requests to the laptop's own LAN address are refused by design; always use `localhost` on the laptop.

## Next steps (after hardware testing)

1. Tune from the real-world findings: clap thresholds, jump/climb sensitivity, presence threshold.
2. Local speech keyword ("Happy Diwali") with Vosk or Whisper, behind the same cue interface.
3. Time-of-day cues (scheduled scenes).
4. Drawings-come-alive, memory wall (local photo slideshow), shadow puppets (segmentation).
5. Choose a license before publishing.
6. Optional: second projector (multi-window output + edge blending): needs a second display to test.


## 2026-11-01: calibration with an on-screen grid (branch `multi-surface-camera`)
- Replaced "stand in front of the wall and point at targets" with a grid shown on the projector. The grid is resizable and movable from the control panel (drag corners / inside / size slider) and follows live on the wall, so you can fit it inside the camera's view.
- **Auto-find corners** (`POST /api/calibration/auto`): projects four white discs on black, takes the camera frame, then a black frame, subtracts, finds the four blobs (`find_markers`) and orders them TL, TR, BR, BL in prepared space; the panel then solves and saves. Failures give a reason (too dark, N of 4 found, extra bright spots). The manual route is four draggable handles on the camera view.
- Unit tests for detection/ordering on synthetic frames; Playwright `tests/e2e/calibrate.mjs` covers the overlay, drags and cleanup. **Not verified yet:** auto-find against the real wall and phone camera (discs may be washed out in a bright room or by phone auto-exposure).
- **Multiple grids** (same day): `Calibration.extra_grids` (`Grid` = id, name, camera/screen quads, own homography; max 8). `apply()` picks the grid containing the hand (nearest centre), else the nearest, so separate walls/sections each get a correct mapping. API: `POST|DELETE /api/calibration/grids/{id}`; re-solving the main grid keeps the others; changing mirror/rotation or Reset clears all. Panel: grid tabs, add/remove/rename, per-grid auto-find and "Auto-find all"; the projector shows every grid, the selected one highlighted. Tests: per-region mapping, nearest-grid fallback, round-trip, id/degenerate validation, API lifecycle, e2e UI. Not verified on a real two-wall setup.
- **Camera reactions per section**: surface `reaction` = {wake, dim, hold, next: off|touch|wave}; video `playlist` for "next". Implemented in `SceneRenderer._react` (wake = opacity fade + pause/play, next = slide/playlist step, 1.5 s cooldown, first touch only wakes). Activity is sent to the server (`activity` WS message), counted in `/api/stats.interactions` and logged in the event log. Preset `decor-4-reactive`. Tests: scene validation, `tests/e2e/reactive.mjs` (mouse stands in for a camera hand). Thresholds (15 % wake margin, wave > 1.2 surface-heights/s) are guesses; tune with a real hand on the wall.
- **Animal park** (`frontend/js/games/park/`): ambient virtual world. `PlayerTracker` groups hands into up to 6 players and keeps their ids; `ParkWorld` gives each an animal (rabbit, kangaroo, frog hop; elephant, cat walk; bird glides, a bag so animals differ) and runs the dwell (still ~2 s near flowers, trees, pond, another player) and fast-movement (splash, leaves, sparkle) interactions; all drawing is light canvas shapes (59 fps in the browser test with 4 players). 12 unit tests + `tests/e2e/park.mjs`. Players come from hands for now; badges can choose animals later. Thresholds are guesses to tune with real people.

## 2026-11-01: projector's own browser (branch `projector-display`)
- Paired network displays: `GET /pair?d=<token>` (token in `data/display_token`, git-ignored) sets an HttpOnly cookie; `/ws` and `/media`, `/api/quest/photo.jpg` then accept that browser from the network. Display sockets get only `hands, settings, scene, calibration, stats, health, quest, cue, zone, command` messages (never `poses` or camera data) and may send only `report`, `activity`, clap `cue`, and the commands `hello`/`output-size`. Everything else stays loopback-only. `POST /api/display/reset` revokes (new token, display sockets dropped). Control panel (Camera tab) shows a QR + link and a Revoke button.
- Tests: 8 API tests (unpaired refused, wrong token logged, read-only, message filtering, commands dropped, revoke) + `tests/e2e/display.mjs` (the laptop's own LAN address acts as a second machine; real pairing, live command delivery, health sees the display). **Not verified:** a real projector's built-in browser (speed, fullscreen, microphone permission), and Wi-Fi contention with the camera stream; HDMI remains the fallback.
