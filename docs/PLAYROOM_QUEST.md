# Playroom Quest

Children earn Diwali rewards by moving: jump on the stairs → a laddu, climb the wall → a fuljhadi (sparkler). When
every target is met, the wall plays fireworks and sweets rain from the top, then the board resets for another round.

**Status:** the engine, editor, scoreboard and finale are built and tested with synthetic poses and a real pose model
on a photo. It has **not** been tried with real children, real stairs or a real climbing wall; expect a tuning session.

## Set up

1. Install the pose model once: `scripts/fetch_models.sh` (also run by `scripts/setup.sh`). Needs internet once; afterwards
   everything is local.
2. Place the phone so it sees the whole stairs and wall, from far enough back to see full bodies. Start the camera.
3. Control panel → **Playroom Quest** → **Switch to body pose tracking**.
4. **Use live camera frame as photo** (or upload a photo from the same position).
5. **Add zone**, click the corners of the stairs on the photo, **Finish shape**. Pick *Jump* and a reward. Repeat for the
   wall with *Climb*. Set how many of each reward are needed for the finale.
6. **Save zones**. Open the game, choose 🏆 *Playroom Quest* from the menu (or use a layout with it).
7. Walk, jump and climb in front of the camera. The skeleton drawn on the photo is what the computer sees; the green
   events list shows each reward earned. The **+ laddu / + fuljhadi** buttons test the scoreboard and finale without moving.

## How triggers work

All in `backend/app/quest/engine.py`, in camera-image coordinates (0..1), per person, scaled by that person's torso
length so small and tall people behave alike.

| Trigger | Rule |
|---|---|
| **Jump** | Hips rise by more than 0.34 torso lengths above where they were 0.4–1.6 s ago, and the feet were inside the zone before take-off. Fires once, then waits until the person lands (hips within 0.12 torso of baseline) and the cooldown passes |
| **Climb** | A wrist is inside the zone and above hip height, the hips are inside the zone, and the hips climb 0.55 torso lengths. One reward per step up; sliding back down lowers the bar so the same height is not paid twice. Letting go for 0.8 s resets |
| **Enter** | Hip centre stays inside the zone for 0.4 s; fires once until the person leaves and the cooldown passes |

Each zone has **sensitivity** (0.3–3; higher fires more easily) and **cooldown** (seconds). Several people are tracked
at once with separate state, but the scoreboard is one shared team score.

## Known limits

* Heuristics, not magic: tune sensitivity on the day. Small children, loose clothes, furniture hiding legs and low light
  reduce pose accuracy.
* Camera perspective: a jump toward or away from the camera moves the hips less in the image.
* Pose tracking costs more than hand tracking: about 44 ms per frame standalone on the development laptop and about 51 ms (≈19 fps) inside the full
  system with a browser running alongside (see [Measurements](MEASUREMENTS.md)). The first couple of seconds after
  switching to pose mode are slower while the model starts. A jump lasts several frames at that rate, so it is
  detected, with the reward arriving roughly a tenth of a second plus camera and display delay later.
* One camera view: zones must be visible in it.
* Hand games and Quest do not run at the same time: pose mode replaces hand tracking.

## Safety

Jumping and climbing stay supervised. Rewards are for any activity, never for going higher or faster, and the finale is
a shared goal. Keep the projector out of reach and do not let children look into the lens.

## Privacy

The photo is stored in `data/quest_photo.jpg` (mode 600), never uploaded; delete it from the Quest tab. Poses are
numbers (joint positions) that exist only in memory. No video is recorded.
