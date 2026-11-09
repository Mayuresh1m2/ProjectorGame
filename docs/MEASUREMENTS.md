# Measurements

Honest numbers, with what was and was not measured. Development laptop: Intel Broadwell HD 5500, 4 cores, 15 GB RAM,
Ubuntu 26.04. "Synthetic phone" = headless Chromium streaming a still photo over the real HTTPS + WebRTC path.

| Quantity | Value | Conditions |
|---|---|---|
| Game render rate | 60 fps | headless Chromium, butterfly game |
| Camera frames received | ~30 fps | synthetic phone |
| Hand tracking | ~25 ms per frame, ~30 fps | fast model, two-hand test image |
| Frame arrival → hands published | ~27 ms | laptop side only |
| Frame arrival → drawn on the game page | ~24 ms | laptop side only |
| Pose tracking | ~44 ms per frame (standalone, 960×640 photo, lite model) | single image repeated |
| Pose tracking inside the full system | ~51 ms per frame, ~19 fps steady (first ~2 s are slower: model start-up); frame → poses published ~68 ms | synthetic phone streaming a still photo of one person; same laptop also running the browser |
| Stall detection (phone vanishes) | flagged in ~4 s | `tests/e2e/failure.mjs` |
| Session reset after silence | 10 s | watchdog |

**Not measured:** the phone's capture and encoding time, Wi-Fi jitter, and the projector's display delay. Estimated
150–300 ms end to end for hand games, more for pose. Run the latency test in `/setup.html` with your own hardware to
replace the estimate with a measurement, and record it in `progress/PROGRESS.md`.

Reproduce: `D` in the game window (live), `/api/metrics`, `tests/e2e/*.mjs`.
