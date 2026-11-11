#!/bin/sh
# monitor-collector container entrypoint: install deps into the cached venv, then sample the machine.
# The collector drops to user nobody before it reads anything (collector/__main__.py, drop_root).
set -eu
# The venv lives in a volume: rebuild it when the image's Python minor version changes.
want=$(python -c 'import sys; print("%d.%d" % sys.version_info[:2])')
grep -qE "^version(_info)? = $want\." /opt/venv/pyvenv.cfg 2>/dev/null || python -m venv --clear /opt/venv
/opt/venv/bin/pip install -q --disable-pip-version-check -r requirements.txt
exec /opt/venv/bin/python -m collector loop >> /logs/monitor-collector.log 2>&1
