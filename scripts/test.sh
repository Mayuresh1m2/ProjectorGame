#!/usr/bin/env bash
# Run the automated tests. Add --e2e for browser tests (needs: npm install && npx playwright install chromium, and a running server).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Python tests =="
.venv/bin/python -m pytest -q
if command -v node >/dev/null 2>&1; then
  echo "== JavaScript tests =="
  node --test "tests/js/*.test.js" 2>&1 | grep -E "^(# (tests|pass|fail)|not ok)"
fi
if [ "${1:-}" = "--e2e" ]; then
  echo "== Browser tests (server must be running: scripts/start.sh) =="
  node tests/e2e/phase1.mjs && node tests/e2e/games.mjs && node tests/e2e/panel.mjs && node tests/e2e/health.mjs
  echo "(camera.mjs, full.mjs, failure.mjs and quest.mjs need VIDEO=<y4m file of a photo with people>; see docs/MEASUREMENTS.md)"
fi
