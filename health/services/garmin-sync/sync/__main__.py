"""CLI for the Garmin sync.

  python -m sync login   [--profile alex]           one-time interactive Garmin login (password never stored)
  python -m sync status  [--profile alex]           token status
  python -m sync run     [--profile alex]           one incremental pass
  python -m sync backfill [--profile alex]  [--since 2020-01-01]
  python -m sync loop                               incremental pass for every connected profile, forever

`loop` starts each pass as a FRESH process (`python -m sync run`), so code edited in the repo is
picked up on the next tick without a restart, and a broken edit fails one tick instead of the
container.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import getpass
import json
import logging
import os
import subprocess
import sys
import time

from garmin_core.auth import GarminAuth
from garmin_core.errors import InvalidCredentials, MfaRequired
from garmin_core.metrics import MetricsService
from garmin_core.tokens import PostgresTokenStore

from .engine import Engine
from .store import Store

log = logging.getLogger("garmin-sync")


def _env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"missing env {name}")
    return v


def _deps() -> tuple[PostgresTokenStore, Store]:
    dsn = _env("DATABASE_URL")
    return PostgresTokenStore(dsn, _env("TOKEN_ENCRYPTION_KEY")), Store(dsn)


def cmd_login(a: argparse.Namespace) -> int:
    tokens, store = _deps()
    if not store.profile_exists(a.profile):
        sys.exit(f"profile '{a.profile}' does not exist in core.profiles")
    auth = GarminAuth(tokens)
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password (never stored): ")
    try:
        status = auth.login(a.profile, email, password)
    except MfaRequired:
        code = input("MFA code: ").strip()
        status = auth.login(a.profile, email, password, mfa_code=code)
    except InvalidCredentials:
        print("Garmin rejected the credentials.")
        return 1
    finally:
        password = ""  # noqa: F841 - drop the reference early
    print("Connected:", json.dumps(status, ensure_ascii=False))
    return 0


def cmd_status(a: argparse.Namespace) -> int:
    tokens, _ = _deps()
    print(json.dumps(GarminAuth(tokens).status(a.profile), ensure_ascii=False))
    return 0


def cmd_run(a: argparse.Namespace, kind: str = "incremental") -> int:
    tokens, store = _deps()
    since = _dt.date.fromisoformat(a.since) if getattr(a, "since", None) else None
    result = Engine(MetricsService(tokens), store).run(a.profile, kind, since)
    print(json.dumps(result, ensure_ascii=False, default=str))
    return 0 if result["status"] != "failed" else 2


def cmd_loop(_: argparse.Namespace) -> int:
    minutes = max(5, int(os.environ.get("SYNC_INTERVAL_MINUTES", "30")))
    _, store = _deps()
    while True:
        try:
            profiles = store.connected_profiles()
        except Exception as e:  # noqa: BLE001 - db down: retry next tick
            log.error("cannot list profiles: %s", type(e).__name__)
            profiles = []
        if not profiles:
            log.info("no connected profiles; run `python -m sync login` first")
        for p in profiles:
            rc = subprocess.call([sys.executable, "-m", "sync", "run", "--profile", p])
            log.info("pass for %s finished rc=%s", p, rc)
        time.sleep(minutes * 60)


def main() -> int:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    p = argparse.ArgumentParser(prog="python -m sync")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("login", "status", "run", "backfill"):
        sp = sub.add_parser(name)
        # Default: DEFAULT_PROFILE, else the first profile (the one made in /setup).
        sp.add_argument("--profile", default=os.environ.get("DEFAULT_PROFILE") or None)
        if name == "backfill":
            sp.add_argument("--since", help="YYYY-MM-DD (default: 5 years back)")
    sub.add_parser("loop")
    a = p.parse_args()
    if getattr(a, "profile", "") is None:
        a.profile = Store(_env("DATABASE_URL")).first_profile() or sys.exit("no profile yet: finish /setup first")
    if a.cmd == "login":
        return cmd_login(a)
    if a.cmd == "status":
        return cmd_status(a)
    if a.cmd == "run":
        return cmd_run(a)
    if a.cmd == "backfill":
        return cmd_run(a, "backfill")
    return cmd_loop(a)


if __name__ == "__main__":
    sys.exit(main())
