#!/usr/bin/env bash
# Start the Butterfly Playground server (HTTP on localhost for the laptop, HTTPS on the LAN for the phone).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then echo "Run scripts/setup.sh first."; exit 1; fi
export PYTHONPATH="$PWD/backend${PYTHONPATH:+:$PYTHONPATH}"
exec .venv/bin/python -u -m app.main "$@"
