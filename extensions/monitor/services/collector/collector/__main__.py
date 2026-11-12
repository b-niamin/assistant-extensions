"""The monitor's collector, run by the assistant's worker (manifest "services" and "jobs"):

  python -m collector loop    every MONITOR_INTERVAL_SECONDS, read the machine, write the snapshot and one history row
  python -m collector prune   drop history rows older than MONITOR_KEEP_DAYS (the worker runs it nightly)
  python -m collector once    print one snapshot as JSON (no database), for checking a host
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone

from . import sample

PROC = os.environ.get("HOST_PROC", "/proc")
SYS = os.environ.get("HOST_SYS", "/sys")
# Filesystems to report: where the assistant's checkout lives (this service's code is in it, the working
# directory) and where Docker keeps volumes (the worker's data volume, next to the database's).
DISKS = {
    "assistant": os.environ.get("MONITOR_DISK_APP") or os.getcwd(),
    "docker": os.environ.get("MONITOR_DISK_DOCKER") or os.environ.get("WORKER_DATA") or "/logs",
}


def log(msg: str) -> None:
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {msg}", flush=True)


def once() -> None:
    _, _, st = sample.take(PROC, SYS, DISKS, sample.State())
    time.sleep(2)
    snap, row, _ = sample.take(PROC, SYS, DISKS, st)
    print(json.dumps({"snapshot": snap, "sample": row}, indent=2))


def drop_root() -> None:
    """Never read the machine as root: the host's /proc is mounted, and root could read other processes'
    environment (secrets). The worker already runs it as the extension's own user; started as root in a
    container of its own, it becomes nobody."""
    if os.getuid() == 0:
        os.setgroups([])
        os.setgid(65534)
        os.setuid(65534)


def loop() -> None:
    drop_root()
    from .store import Store

    interval = max(5, int(os.environ.get("MONITOR_INTERVAL_SECONDS", "30")))
    store = Store(os.environ["DATABASE_URL"])
    log(f"collector: every {interval} s, proc={PROC} sys={SYS}")
    _, _, state = sample.take(PROC, SYS, DISKS, sample.State())
    time.sleep(2)
    # The first pass after 2 s gives live figures at once; history rows start with the regular passes.
    snap, _, state = sample.take(PROC, SYS, DISKS, state)
    store.write(snap, None)
    failures = 0
    while True:
        time.sleep(max(1.0, interval - (time.time() - state.at)) if state.at else interval)
        try:
            snap, row, state = sample.take(PROC, SYS, DISKS, state)
            store.write(snap, row)
            if failures:
                log("writing again")
            failures = 0
        except Exception as e:  # noqa: BLE001 - keep sampling whatever one pass hit
            failures += 1
            if failures in (1, 10) or failures % 120 == 0:
                log(f"pass failed ({failures}x): {type(e).__name__}: {e}")


def prune() -> None:
    drop_root()
    from .store import Store

    keep = max(1, int(os.environ.get("MONITOR_KEEP_DAYS", "30")))
    n = Store(os.environ["DATABASE_URL"]).prune(keep)
    log(f"pruned {n} samples older than {keep} days")


if __name__ == "__main__":
    {"once": once, "prune": prune}.get(sys.argv[1] if len(sys.argv) > 1 else "loop", loop)()
