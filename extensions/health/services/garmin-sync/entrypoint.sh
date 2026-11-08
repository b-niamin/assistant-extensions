#!/bin/sh
# garmin-sync container entrypoint: install deps into the cached venv, then run the sync loop.
# Each sync pass runs as a fresh process, so edits to sync/ apply on the next tick.
set -eu
# The venv lives in a volume: rebuild it when the image's Python minor version changes.
want=$(python -c 'import sys; print("%d.%d" % sys.version_info[:2])')
grep -qE "^version(_info)? = $want\." /opt/venv/pyvenv.cfg 2>/dev/null || python -m venv --clear /opt/venv
/opt/venv/bin/pip install -q --disable-pip-version-check -r requirements.txt
exec /opt/venv/bin/python -m sync loop >> /logs/garmin-sync.log 2>&1
