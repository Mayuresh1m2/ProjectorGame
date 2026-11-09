#!/usr/bin/env bash
# One-time setup for Ubuntu: creates .venv (Python 3.11 via uv, or a system Python 3.9-3.12) and installs dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Butterfly Playground setup =="
. /etc/os-release 2>/dev/null && echo "OS: $PRETTY_NAME"

PY_OK='import sys; sys.exit(0 if (3,9) <= sys.version_info[:2] <= (3,12) else 1)'  # MediaPipe wheels: 3.9-3.12

make_venv() {
  if command -v uv >/dev/null 2>&1; then
    echo "Using uv to create a Python 3.11 environment"
    uv venv --python 3.11 .venv
    PIP=(uv pip install -p .venv/bin/python)
    return
  fi
  for py in python3.11 python3.12 python3.10 python3; do
    if command -v "$py" >/dev/null 2>&1 && "$py" -c "$PY_OK" 2>/dev/null; then
      if "$py" -m venv .venv 2>/dev/null; then
        PIP=(.venv/bin/python -m pip install)
        return
      fi
      rm -rf .venv
    fi
  done
  cat >&2 <<MSG

Could not create a virtual environment with a compatible Python (3.9-3.12 needed for MediaPipe).
Pick one:
  * Install uv (recommended, no sudo):   curl -LsSf https://astral.sh/uv/install.sh | sh     then re-run this script
  * Or:  sudo apt install python3-venv python3-pip   (needs Python 3.9-3.12; Ubuntu 26.04's default 3.14 is too new)
MSG
  exit 1
}

if [ ! -x .venv/bin/python ]; then make_venv; else
  .venv/bin/python -c "$PY_OK" || { echo ".venv has an incompatible Python; delete it (rm -rf .venv) and re-run."; exit 1; }
  if command -v uv >/dev/null 2>&1; then PIP=(uv pip install -p .venv/bin/python); else PIP=(.venv/bin/python -m pip install); fi
fi

"${PIP[@]}" -r requirements.txt
mkdir -p data media

echo "Downloading the pose model for Playroom Quest (one time, ~6 MB) ..."
scripts/fetch_models.sh || echo "  (skipped: no internet? Hand games work without it; run scripts/fetch_models.sh later for Playroom Quest)"

echo "Generating small sample videos (media/) ..."
.venv/bin/python scripts/make_sample_decor.py >/dev/null 2>&1 || true
.venv/bin/python scripts/make_sample_media.py >/dev/null 2>&1 || echo "  (skipped: could not write WebM with this OpenCV build)"

echo "Self-check ..."
PYTHONPATH=backend .venv/bin/python - <<'PY'
import cv2, aiortc, fastapi, mediapipe, numpy
print("  python deps ok: opencv", cv2.__version__, "| aiortc", aiortc.__version__, "| mediapipe", mediapipe.__version__)
PY

command -v node >/dev/null 2>&1 && echo "Node $(node --version) found: JS tests available (scripts/test.sh)." \
  || echo "Node.js not found: JS unit tests/browser tests will be skipped (the app itself does not need Node)."
command -v firefox >/dev/null 2>&1 && echo "Browser: firefox found" || true
command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v google-chrome >/dev/null 2>&1 \
  && echo "Browser: Chromium/Chrome found (recommended: it can place the output window on the projector)" || true
echo
echo "Done. Start with:  scripts/start.sh      Check your setup any time with:  scripts/doctor.sh"
