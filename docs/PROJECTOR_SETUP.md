# Projector setup

Open `http://localhost:8000/setup.html` (also a tile on the home page).

## 1. How big will the picture be

Image width = distance to the wall ÷ throw ratio. The throw ratio is in the projector's spec sheet (for example
1.2:1). Enter it with your distance and the page shows width, height, diagonal and the smallest icon that stays readable
(10% of the picture height).

| Throw ratio | Distance | Width (16:9) | Height |
|---|---|---|---|
| 1.2:1 | 3 m | 2.5 m | 1.4 m |
| 1.2:1 | 4 m | 3.3 m | 1.9 m |
| 0.5:1 (short throw) | 1.25 m | 2.5 m | 1.4 m |

These are calculated, not measured. A zoom lens changes the ratio within a range; use the test pattern to see what
the wall really gets.

## 2. Test pattern

Drag the browser window to the projector and press **Show test pattern**. It draws a full-picture border, a dashed 90%
safe area, a circle (should look round), colour bars, a grey ramp and sample text sizes, so you can check coverage,
focus, brightness and keystone. `Esc` or a click closes it.

## 3. Latency test

Measures the time from the projector showing a flash until the laptop receives the camera frame that shows it. That
covers **projector display delay, phone capture and encoding, Wi-Fi and WebRTC, and decoding**, which cannot be seen
from the laptop alone.

1. Start the phone camera and aim it at the projected picture (or a patch of wall it lights). Dim the room.
2. Put the setup page's window on the projector and press **Run latency test**. The wall flashes bright 8 times over a
   few seconds (warn anyone sensitive to flashing lights; `Esc` stops it).
3. Read the median and range. The page adds the live tracking time to estimate movement-to-reaction.

How it works: the page records the wall-clock time each flash is painted; the server records the average brightness of
every camera frame (a 32×18 grey thumbnail, never the image) while armed; the first frame past half of the brightness
step is the arrival. Browser and server share the laptop's clock.

Limits: accuracy is about one camera frame (33 ms at 30 fps). If the camera's auto-exposure hides the flash, or the room
is bright, trials are reported as skipped with the reason, and no number is invented. Drawing on screen (~24 ms measured
earlier) is not included.

What the numbers mean: under ~100 ms feels instant, 100–250 ms feels responsive, 250–350 ms is noticeably late, over
that is laggy. Reward-style games (jump → laddu) tolerate 250 ms; exact catching does not.

## Brightness and readability

* 300–800 ANSI lumens works in a room you can darken; a bright room needs 2000+ and still looks washed out. Marketing
  "lumens" are often inflated.
* A white or light-grey wall, or a white sheet on the wall, looks best.
* Gold, saffron and white on dark read well; thin dark lines and small text vanish.
* Children's shadows block the beam: mount the projector high and to the side.

## Presets

*Control panel → Layout & videos → Start from a ready-made layout*: single game, **Diwali wall** (4 panels on one flat
wall), **Diwali corner** (two walls plus floor; the corner coordinates are rough starting points, so drag them onto your
real walls), and sweets with a fireworks strip.


## Option: run the game in the projector's own browser (no cable)

Instead of HDMI you can open the game in a browser on the projector (or on a TV box / stick plugged into it) while the laptop keeps doing the camera, tracking and control.

1. Put the projector/box on the same Wi-Fi as the laptop.
2. Control panel → **Camera** tab → *Projector's own browser*: scan the QR code with that device, or type the link (`https://<laptop-ip>:8443/pair?d=…`). Accept the certificate warning once (it is a private certificate made on your laptop).
3. The link sets a cookie in that browser and opens the game page. If the browser does not go full screen by itself, click once on the page (or press <kbd>F</kbd>).

**What the display can and cannot do.** It receives only what a game window draws from: hand positions, the scene, settings and the health dot. It never receives the camera picture, cannot change settings, the layout or the calibration, and can send only its own frame rate, "a section woke up" counts, a clap heard on its microphone and its screen size. The live link and media only work with the pairing cookie; an unpaired browser on your Wi-Fi gets the static page and nothing else. **Revoke displays** in the control panel issues a new token and drops every paired display.

**Caveats.** Hand positions travel over your Wi-Fi to the display, and the phone camera stream uses the same Wi-Fi: a busy network adds delay (a local hop is normally a few ms). A projector's built-in browser may be too slow for the warped surfaces, video or 60 fps; if the picture stutters or the page will not load, use the HDMI route above, which stays fully supported. Microphone (clap) detection needs the browser to allow the microphone on this https page.
