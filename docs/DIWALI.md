# Diwali content

| Game | What it does | Reacts to |
|---|---|---|
| 🪔 **Light the diyas** | A grid of dark diyas; a hand held near one warms and lights it. All lit → "Happy Diwali!" and fireworks | Hands, mouse/touch, `presence` (lights two), `clap` / fist-open (fireworks) |
| 🍬 **Catch the sweets** | Laddus and jalebis fall; catch them | Hands |
| 🌸 **Rangoli** | Everything you draw is repeated 8× with mirror symmetry; each hand a colour; draws itself when idle | Hands |
| 🎆 **Fireworks sky** | Ambient fireworks with no smoke or noise; a fast upward flick or tap launches one | Hands, taps, `clap`, fist-open |
| 🏆 **Playroom Quest** | See [PLAYROOM_QUEST.md](PLAYROOM_QUEST.md) | Body poses |

Layouts for one projector are in *Control panel → Layout & videos → Start from a ready-made layout*: **Diwali wall**
(diyas + fireworks + rangoli + greeting strip), **Diwali corner**, **sweets and fireworks**.

## Cues

Events that need no tap or hand position, fired as `cue` messages and passed to every visible game:

| Cue | Source | Notes |
|---|---|---|
| `presence` / `presence-end` | Camera motion | Sustained motion for 0.4 s after quiet; ends after 4 s still. No identity, nothing stored. Ignores whole-picture brightness jumps (exposure, projector flashes) |
| `gesture-fist-open` | Hand tracking | A fist (held 0.12 s) that opens within 1.5 s; 1.5 s cooldown |
| `two-hands` | Hand tracking | The second hand appears |
| `clap` | Microphone in the game window | Off until you press 🎤; analysed in the browser, nothing recorded; a visible indicator while listening |

Turn camera cues off with `cues.enabled: false` in settings (`PUT /api/settings`).

**Not built:** spoken "Happy Diwali" (needs a local speech model such as Vosk or Whisper; browser speech APIs send audio
to a cloud service, which this project avoids), face recognition, and scheduled (time-of-day) cues. These are listed in
`progress/PROGRESS.md` as next steps.

## Adding your own

Copy `frontend/js/games/diwali/sweets.js` as a starting point: a pure world class (testable), a `Game` subclass that
draws it, and one registry line in `games/index.js`. Shared drawings (diya, laddu, fireworks) are in `diwali/fx.js`.
