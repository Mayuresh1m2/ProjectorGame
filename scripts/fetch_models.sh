#!/usr/bin/env bash
# Download the MediaPipe pose model used by Playroom Quest (about 6 MB, one time). Everything runs offline afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models
dest=models/pose_landmarker_lite.task
if [ -s "$dest" ]; then echo "already have $dest"; exit 0; fi
curl -fsSL -o "$dest.part" "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
mv "$dest.part" "$dest"
echo "downloaded $dest ($(du -h "$dest" | cut -f1))"
