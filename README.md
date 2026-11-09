# 🦋 Butterfly Playground

Interactive projection games for kids, driven by an ordinary phone camera. A child waves a hand (or jumps, or climbs)
in front of the phone; the wall, lit by a projector or just the laptop screen, reacts: butterflies fly to the hand,
diyas light, sweets fall, fireworks burst.

Everything runs **locally on your own laptop**: no cloud, no accounts, no paid APIs, no uploads, no recording.

![status](https://img.shields.io/badge/status-works%20on%20the%20bench%2C%20not%20yet%20tried%20with%20a%20real%20projector-orange)

```
phone camera ──WebRTC over your Wi-Fi──► laptop: hand / body tracking (MediaPipe) ─► WebSocket ─► game window (projector)
                                                  └─ health checks, event log, metrics ─► control panel
```

## What is in it

| | |
|---|---|
| **Games** | Butterflies, fish, balloons, and a Diwali set: light the diyas, catch the sweets, rangoli, fireworks sky |
| **Playroom Quest** | Jump on the stairs → laddu, climb the wall → fuljhadi, then fireworks and falling sweets. Zones are drawn on a photo of your room; body pose tracking ([guide](docs/PLAYROOM_QUEST.md)) |
| **Cues** | Someone walks in, a fist that opens, a clap: games react without a tap ([details](docs/DIWALI.md)) |
| **Projector tools** | Coverage calculator, full-screen test pattern, display-to-camera **latency test** ([guide](docs/PROJECTOR_SETUP.md)) |
| **Layouts** | Several surfaces from one projector, each warped and masked onto a wall, door or floor; ready-made Diwali layouts |
| **Observability** | Live health checks with fix hints, event log, metrics, rotating log file, self-healing, `scripts/doctor.sh` ([guide](docs/OBSERVABILITY.md)) |
| **Privacy** | Loopback-only API, random key for the phone link, frames only in memory, mic off by default ([model](docs/ARCHITECTURE.md#security-model)) |

## Quick start

```bash
git clone <this repo> && cd <this repo>
scripts/setup.sh        # once: Python env, dependencies, pose model, sample videos
scripts/start.sh        # run the server
scripts/doctor.sh       # (any time) is everything OK, and if not, what to fix
```

1. Open **http://localhost:8000/** on the laptop → **Play butterflies** (works at once with the mouse).
2. For the phone camera, open the `https://…:8443/camera.html?k=…` link printed by `start.sh` (or scan the QR code in the
   control panel) in Safari, accept the self-signed certificate warning, tap **Start camera**.
3. Hold a hand in front of the phone.

Full steps, hardware and a first-run checklist: **[docs/SETUP.md](docs/SETUP.md)**.

Keys in the game window: `F` fullscreen · `S` simulated hands · `D` live statistics · `R` restart · `M` menu · `N` sound.

## Documentation

| Guide | |
|---|---|
| [Setup](docs/SETUP.md) | Install, phone, projector, first-run checklist |
| [User guide](docs/USER_GUIDE.md) | Calibration, projector window, video frames, settings |
| [Projector setup](docs/PROJECTOR_SETUP.md) | Picture size maths, test pattern, latency test, brightness tips |
| [Diwali content & cues](docs/DIWALI.md) | The games, layouts, cue types |
| [Playroom Quest](docs/PLAYROOM_QUEST.md) | Zones, triggers, limits, safety |
| [Observability](docs/OBSERVABILITY.md) | Health checks, events, metrics, self-healing |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Symptom → fix table, how to report a bug |
| [Architecture](docs/ARCHITECTURE.md) | Modules, messages, security model, adding a game |
| [Measurements](docs/MEASUREMENTS.md) | What was measured, what was not |
| [Progress log](progress/PROGRESS.md) | What was built when, what is verified, what is next |

## Testing

```bash
scripts/test.sh            # Python + JavaScript tests (no browser, no phone needed)
scripts/test.sh --e2e      # also browser tests against a running server (needs: npm install && npx playwright install chromium)
```

The unit and integration tests cover tracking maths, calibration, the zone engine, cues, health evaluation, the API and
LAN restrictions, a real WebRTC loopback, and (when the model and a sample photo are downloaded) real MediaPipe on a
photo. Browser tests drive the actual pages, including the phone page with Chromium's fake camera over HTTPS and WebRTC.
CI runs the unit tests on every push (`.github/workflows/ci.yml`).

## Honest status

Verified on one Ubuntu laptop with desktop Chromium/Firefox and a synthetic phone. **Not yet verified:** a real iPhone
and Safari, a real projector or second display, real moving hands, real children on real stairs, audio output,
microphone clap detection in a real room, and the flash-based latency test through a real phone camera. Each is listed
with its current state in [progress/PROGRESS.md](progress/PROGRESS.md). Expect a tuning session on the first real run.

Platform: developed and tested on Ubuntu 26.04. Other Linux and macOS should work but are untested; Windows is untested.

### Scope and known gaps (read before you try this)

This is built first for one home setup: one Linux laptop that runs everything, an Android or iPhone as the camera on home Wi-Fi,
and a projector on HDMI. It is meant to be extended, but it is not a polished product yet. Setup today means running a
script, scanning a QR code on the phone and accepting a browser certificate warning. **Not provided yet:**

- An installer or packaged app, a first-run wizard, or a phone-based setup flow (setup is done on the laptop's control panel).
- A tested projector browser: the game can run in the projector's own browser (pair it with the QR code in the control panel,
  see [docs/PROJECTOR_SETUP.md](docs/PROJECTOR_SETUP.md)), but this has only been exercised with a desktop browser acting as a second machine.
  Whether a real projector's built-in browser is fast enough is unknown; HDMI from the laptop is the fallback.
- Windows and macOS support (untested), and more than one camera (every calibration grid must be inside one camera's view).
- Reliable identification of individual people: players are groups of hands or poses, not recognised people. Printable badges
  exist (`scripts/make_badges.py`) but badge detection is not built.
- Tuned thresholds for real children and real rooms: the interaction thresholds are first guesses.

## Safety and privacy notes

* Anyone on your Wi-Fi who has the camera link can send video to your laptop. Treat the link as a password; never expose
  the ports to the internet.
* The projector flash used by the latency test is bright and rapid; warn anyone sensitive to flashing light.
* Supervise children around stairs and climbing walls. The game rewards activity, never height or speed.
* Face recognition, recording and cloud speech are deliberately not part of this project.

## Contributing

Add a game in one folder and one registry line ([how](docs/ARCHITECTURE.md#frontend-frontend-no-build-step)); keep rules
in a pure `logic.js` with a test. Add a health check in `backend/app/health.py` with a test
([how](docs/OBSERVABILITY.md#adding-a-check)). Run `scripts/test.sh` before sending changes. No license file has been
chosen yet; add one before publishing if you want others to reuse the code.
