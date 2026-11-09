# User guide

Day-to-day use of the control panel. First-time installation is in [SETUP.md](SETUP.md).

## Calibration (camera view → wall)

Control panel → **Calibrate**, with the game window open on the projector. A green grid appears on the wall while the tab is open.

1. Set mirror/rotation so the *Camera view* looks like standing in front of the wall.
2. In **Projector grid**, drag the corners (or drag inside to move, or use *Size*) until all four corners land on the wall and inside the camera's view. The grid on the wall follows live.
3. Press **✨ Auto-find corners**: the projector flashes four white dots on black, the camera locates them and the calibration is saved (dim the room lights and keep the phone still for the ~5 s it takes). If it cannot (too bright, a corner outside the view), drag the four numbered handles in the *Camera view* onto the grid's corners instead. It saves as soon as all four are placed. Fingertip capture (**Use fingertip**, <kbd>Space</kbd>) still works too.

**Several walls or sections:** press **＋ Add grid** and give it a name. Each grid is its own region with its own calibration: select it, place it on the projector grid, and Auto-find (or **Auto-find all grids** to do every one in turn, about 5 s each). A hand is then mapped through the grid whose camera outline it is inside (nearest centre when outlines overlap, nearest grid when it is outside all of them). This is what makes a second, perpendicular wall work: a single mapping is only right for one plane. All grids must be inside the one camera's view. Up to 8 grids; unsaved (uncalibrated) grids are drafts and are forgotten when the page is reloaded.

The result is a perspective (homography) transform stored in `data/calibration.json` and reused on every start. Until you calibrate, the camera image simply fills the screen (with mirror/rotation applied).
If the phone image is sideways (iOS sometimes sends rotated frames), use the *Rotate* setting.

## Projector

1. Connect the projector with HDMI; *Settings → Displays → Join/Extend* (not Mirror).
2. Control panel → **Projector**: pick the display and **Open output window** (Chromium/Chrome can place it on the chosen display; in Firefox drag the window to the projector). Click once in it to go fullscreen (or press `F`).
3. **Toggle test grid** helps you aim/zoom the projector. *Resolution & aspect* lets you fix a logical resolution (e.g. 1280×720) that is scaled to fit.
4. Re-run **Calibrate** with the projector on (the grid is shown on the projector).

Notes for a budget projector: Ubuntu does all the work, the projector only needs HDMI. If the projector applies *digital keystone*, calibrate **after** setting it (the camera sees the final image) and again if you change it; the picture is resampled and a little softer. Put the camera close to the projector, and keep hands near the wall: the mapping is exact for the wall plane, a hand held nearer the camera appears shifted (parallax). One projector can only light what it physically sees – a floor, a door and a wall are unlikely to fit in one beam; the Layout editor lets you give each *visible* region its own content. Multiple projectors are a future extension.

## Video frames and mapped surfaces

Copy MP4 (H.264) or WebM files into `media/` (they are only served to the laptop). Control panel → **Layout & videos**: add video frames, game areas or colour panels; drag to move, drag the corners to resize (untick *keep rectangle* to **warp** onto a slanted surface), drag the round handle to rotate; choose a mask (rectangle, rounded, ellipse, custom polygon), the video, volume, loop, speed and scaling. Every surface has independent content – e.g. butterflies on the main wall, a waterfall video in a door-shaped polygon, a family video on a skewed side wall. **Pictures and slideshows** (no camera needed): put PNG/JPG/WebP/GIF/SVG files in `media/`, then *＋ Picture* or *＋ Slideshow* (choose pictures, seconds each, fade, shuffle). `scripts/make_sample_decor.py` writes four sample Diwali pictures to `media/decor/`, and the ready-made layout *Four decorations, no camera needed (2 x 2)* uses them. **Alignment grid:** tick *📐 Show alignment grid on the wall* to draw an outline, grid, diagonals and numbered corners (1 top-left, 2 top-right, 3 bottom-right, 4 bottom-left) on every surface on the projection; untick *Keep rectangle* and drag each numbered corner until the grid lines look straight on the real wall section. Presets: *Single*, *Four video frames*, *Wall + door + side*. Surfaces marked *Reacts to hands* respond to hands (games get the hand position inside their surface; a hand touching a video frame toggles pause/play). The layout is saved in `data/scene.json`. Playback and warping use the browser's GPU compositor (hardware video decode where the browser supports it). Unsupported codecs show a message in the frame instead of failing.

## Settings

* Game settings (gear ⚙ in the game): number of butterflies, speed, landing distance, spawn rate, animation speed, game duration (0 = endless), difficulty. Saved to `data/settings.json`.
* Tracking (control panel → *Tracking*): max hands, smoothing (One-Euro filter: min cutoff / speed gain), how long a lost hand is kept, min confidence, target FPS.
* Environment variables: `PLAYGROUND_HTTP_PORT` (8000), `PLAYGROUND_HTTPS_PORT` (8443), `PLAYGROUND_HTTPS=0` (disable the LAN listener – the phone camera will not work), `PLAYGROUND_DATA_DIR`, `PLAYGROUND_MEDIA_DIR`.
* `tracking.mode` (`hands` or `pose`) and `cues.enabled` are in `data/settings.json` / `PUT /api/settings`; the Playroom Quest tab switches the mode for you. `PLAYGROUND_POSE_MODEL` points at a different pose model file.
* Ready-made scene layouts (Diwali wall, corner, …) are applied from *Layout & videos → Start from a ready-made layout*.


## Sections that react to hands (camera)

Layout & videos → select a section → tick **Reacts to hands**. For pictures, slideshows, videos and colours two reactions appear:

- **Wake up when someone is near** – the section stays dim (*Dim level*) until a hand is in it or within about 15 % of its size around it, fades up, and fades back after *Stay awake (s)* with no hand. Videos also pause while asleep and resume when woken.
- **Change to the next picture/video** – *when touched* (a hand arrives; one change per 1.5 s) or *when waved at* (a fast hand movement). On a slideshow it jumps to the next picture; on a video it steps through the extra videos you tick under "Extra videos for next" (or restarts the video if there are none). If *wake* is on, the first touch only wakes the section, the next one changes it.

Each section reacts only to hands inside its own area, so four sections behave independently. The preset **Four sections that wake up when touched** sets this up for the 2 × 2 decorations. Without any reaction ticked, a hand on a video still toggles pause/play. Every wake or change is counted (`/api/stats` → `interactions`) and shows in the Health event log (at most one line per section every 5 s), so you can see from the laptop whether the camera is really triggering them.

## Player badges (printable, for the camera-badge idea)

`python scripts/make_badges.py` writes 65 badges to `badges/` (5 colours × circle, triangle, square, star plus fun shapes: heart, fish, butterfly, cat, moon, flower, and animals: rabbit, elephant, kangaroo) and `badges/print.html`: open it in a browser, tick one colour + shape per person and press **Print selected** (two copies each, front and back). Print at 100 % scale on matte paper; each badge is 18 cm square, a pure-colour shape with a thick black outline on a white card with a black border so a camera can tell it from clothing. Tape or pin one to the front and one to the back. Badge detection itself is not built yet; these are for testing what the camera can see.

## Animal park (virtual world)

Game **Animal park** (🦘): a calm night garden with a pond, trees, flowers and fireflies. Every person (or group of hands close together, within 0.4 screen heights) becomes an animal that follows them with its own movement: rabbit, kangaroo and frog hop, the elephant and cat walk, the bird glides. Up to 6 players, each with a different animal and colour; an animal fades and falls asleep when its person leaves.

Two coarse inputs drive the world, both easy for a camera:
- **Waiting (standing still ~2 s):** next to a **flower** it blooms; under a **tree** its lanterns light for 20 s; in the **pond** a lily appears (they drift away after 15 s); two still players near each other (within 0.6 screen heights) make their animals happy (hearts, a hop).
- **Moving fast (more than 0.9 screen heights per second):** in the pond it splashes, near a tree leaves fall, anywhere else it sparkles. Walking leaves faint footprints.

No score or start screen. Test it without a camera by moving the mouse (one player) or the **sim** button. Characters currently come from hands; once badge detection exists a badge can choose the animal instead.
