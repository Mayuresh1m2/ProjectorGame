#!/usr/bin/env bash
# Optional: download the public MediaPipe sample photo used by tests/test_detector_real.py
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tests/assets
curl -fsSL -o tests/assets/woman_hands.jpg https://storage.googleapis.com/mediapipe-assets/woman_hands.jpg
echo "downloaded tests/assets/woman_hands.jpg"
