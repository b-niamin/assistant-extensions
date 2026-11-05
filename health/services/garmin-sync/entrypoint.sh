#!/bin/sh
# garmin-sync container entrypoint: install deps into the cached venv, then run the sync loop.
# Each sync pass runs as a fresh process, so edits to sync/ apply on the next tick.
set -eu
[ -x /opt/venv/bin/python ] || python -m venv /opt/venv
/opt/venv/bin/pip install -q --disable-pip-version-check -r requirements.txt
exec /opt/venv/bin/python -m sync loop >> /logs/garmin-sync.log 2>&1
