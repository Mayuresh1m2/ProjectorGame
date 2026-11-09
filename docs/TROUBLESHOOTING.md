# Troubleshooting

Start with `scripts/doctor.sh` and the **Health** tab (control panel). They name the problem and a fix. This page
covers the same ground by symptom.

| Symptom | Likely cause | Fix |
|---|---|---|
| Phone page: "camera blocked" or "not a secure context" | Opened with `http://` or an address without HTTPS | Use the `https://` link from the laptop and accept the certificate warning |
| Phone cannot open the link at all | Different network, router "client isolation", or laptop firewall | Same Wi-Fi (not a guest network). `sudo ufw status`; if active: `sudo ufw allow from 192.168.0.0/16`. Try a phone hotspot with the laptop joined to it |
| "This link is missing its access key" | Link without `?k=…` | Use the full link or the QR code from the control panel |
| Camera stays on *connecting…* | WebRTC needs random UDP ports; firewall or isolation blocks them | Same as above. The health check `camera` says how long it has been connecting |
| Camera streamed, then dropped (health: `camera` fail) | Phone screen locked, Safari backgrounded, battery saver, Wi-Fi sleep | Keep the screen on (the page requests a wake lock), plug the phone in, start the camera again. The page retries by itself |
| Page works on the phone but the laptop shows no camera | Laptop IP changed since the link was made | Restart `scripts/start.sh` and use the new link |
| Image sideways or mirrored | iOS rotation / front camera | Control panel → Calibrate → Rotate / Mirror |
| Butterflies land in the wrong place | Not calibrated, or the phone or projector moved | Calibrate again |
| Hands jitter or lag | Smoothing settings | Control panel → Tracking: raise *min cutoff* for steadier, lower for snappier |
| Low camera fps | Weak Wi-Fi or high resolution | 5 GHz, closer to the router, phone resolution 640×480 on the camera page |
| Health: `tracking` slow | Laptop busy or old | Close other programs; it steps down quality by itself; Tracking tab → lower target fps |
| Health: `display` low fps | Game window too heavy | Close other tabs, use Chromium, lower *Resolution* in the Projector tab |
| Health: `pose-model` fail | Pose model missing | `scripts/fetch_models.sh`, restart |
| Output window opens on the wrong screen | Browser cannot place windows | Use Chromium/Chrome and *Send output to*, or drag it and press `F` |
| Latency test says "camera did not see the flash" | Phone not pointed at the lit wall, or room too bright | Aim the phone at the projected area, dim the lights, make sure the projector is on |
| Latency test says "camera is not streaming" | No phone connected | Start the camera first |
| Video frame says "format not supported" | Codec | Use H.264 MP4 or WebM |
| `setup.sh` cannot create a venv | System Python too new (3.13+) or `python3-venv` missing | Install [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh \| sh`) and re-run |
| Port already in use | Another copy is running | `ss -ltnp 'sport = :8000'`, stop it, or set `PLAYGROUND_HTTP_PORT` |
| Laptop browser gets 403 on `/api/...` | You used the LAN IP instead of `localhost` | Use `http://localhost:8000` |

## Collecting information for a bug report

```bash
scripts/doctor.sh > doctor.txt 2>&1
tail -n 200 data/logs/playground.log > log.txt
curl -s localhost:8000/api/events > events.json
```

None of these contain images or audio. The log contains your laptop's LAN address in some lines; remove it if you
share it.

## Stopping the server

`Ctrl-C` in the terminal where it runs. If it was started in the background:
`kill $(ss -ltnp 'sport = :8000' | grep -oP 'pid=\K[0-9]+')`.
