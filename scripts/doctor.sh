#!/usr/bin/env bash
# Diagnose the setup: prerequisites, files, ports, firewall, and (if the server is running) its live health checks.
# Exit code 0 = nothing wrong found, 1 = at least one problem. Safe to run any time; changes nothing.
cd "$(dirname "$0")/.."
bad=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✘\033[0m %s\n' "$1"; bad=1; }
HTTP_PORT="${PLAYGROUND_HTTP_PORT:-8000}"; HTTPS_PORT="${PLAYGROUND_HTTPS_PORT:-8443}"

echo "== Environment =="
[ -x .venv/bin/python ] && ok "virtual environment .venv ($(.venv/bin/python --version 2>&1))" || fail ".venv missing: run scripts/setup.sh"
if [ -x .venv/bin/python ]; then
  PYTHONPATH=backend .venv/bin/python - <<'PY' 2>/dev/null && ok "python dependencies import (opencv, aiortc, mediapipe, fastapi)" || fail "python dependencies broken: re-run scripts/setup.sh"
import cv2, aiortc, mediapipe, fastapi, numpy  # noqa
PY
fi
[ -s models/pose_landmarker_lite.task ] && ok "pose model present (Playroom Quest)" || warn "pose model missing: run scripts/fetch_models.sh (only needed for Playroom Quest)"
command -v node >/dev/null && ok "node $(node --version) (only needed for JS tests)" || warn "node not found (JS tests skipped)"
[ -n "$(find media -maxdepth 1 \( -name '*.webm' -o -name '*.mp4' \) 2>/dev/null | head -1)" ] && ok "sample videos in media/" || warn "no videos in media/ (optional)"

echo "== Network =="
ips=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -vE '^(127\.|172\.17\.|169\.254\.)' | tr '\n' ' ')
[ -n "$ips" ] && ok "laptop address(es): $ips" || fail "no LAN address found: connect to the same Wi-Fi as the phone"
if command -v ufw >/dev/null 2>&1; then
  st=$(ufw status 2>/dev/null | head -1)
  case "$st" in *inactive*) ok "ufw firewall inactive";; *active*) warn "ufw firewall is active: if the phone cannot connect, run: sudo ufw allow from 192.168.0.0/16";; *) warn "could not read ufw status (needs sudo): if the phone cannot connect, check the firewall";; esac
fi

echo "== Server =="
if curl -fsS -m 3 "http://127.0.0.1:$HTTP_PORT/api/health" -o /tmp/pg_health.json 2>/dev/null; then
  ok "server answers on http://localhost:$HTTP_PORT"
  python3 - <<'PY' || bad=1
import json
h = json.load(open("/tmp/pg_health.json"))
mark = {"ok": "\033[32m✔\033[0m", "info": "\033[34mi\033[0m", "warn": "\033[33m!\033[0m", "fail": "\033[31m✘\033[0m"}
print(f"  overall: {h['status']}")
for c in h["checks"]:
    print(f"  {mark[c['status']]} {c['message']}" + (f"\n      → {c['hint']}" if c["hint"] and c["status"] in ("warn", "fail") else ""))
raise SystemExit(1 if h["status"] == "down" else 0)
PY
  curl -fsSk -m 3 "https://127.0.0.1:$HTTPS_PORT/camera.html" -o /dev/null 2>/dev/null && ok "phone (HTTPS) listener answers on :$HTTPS_PORT" || warn "HTTPS listener on :$HTTPS_PORT not answering (phone camera will not work)"
else
  warn "server is not running: start it with scripts/start.sh"
fi
[ -f data/logs/playground.log ] && echo "  log file: data/logs/playground.log (last warnings below)" && grep -E " (WARNING|ERROR) " data/logs/playground.log | tail -5 | sed 's/^/    /'
echo
[ $bad -eq 0 ] && echo "No problems found." || echo "Problems found (see ✘ above)."
exit $bad
