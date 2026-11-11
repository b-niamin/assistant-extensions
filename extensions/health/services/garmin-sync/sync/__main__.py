"""CLI for the Garmin sync.

  python -m sync login   [--profile alex]           one-time interactive Garmin login (password never stored)
  python -m sync status  [--profile alex]           token status
  python -m sync run     [--profile alex]           one incremental pass
  python -m sync backfill [--profile alex]  [--since 2020-01-01]
  python -m sync loop                               sync every connected profile, forever

`loop` starts each pass as a FRESH process (`python -m sync run`), so code edited in the repo is
picked up on the next tick without a restart, and a broken edit fails one tick instead of the
container. Every few seconds it also picks up passes asked for in System settings
(health.sync_requests: "Sync now", "Fetch older data"), and queues the first history fetch of a
newly connected profile by itself.
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
    store.account_status(a.profile, "connected", fresh_login=True)
    print("Connected:", json.dumps(status, ensure_ascii=False))
    print("The history (up to 5 years back) is fetched within a minute; progress in System settings -> Training & Health.")
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


TICK_SECONDS = 5


def _pass(profile: str, kind: str = "incremental", since: _dt.date | None = None) -> int:
    args = [sys.executable, "-m", "sync", "backfill" if kind == "backfill" else "run", "--profile", profile]
    if since:
        args += ["--since", since.isoformat()]
    # A pass that hangs (Garmin never answering) must not stop the loop for good.
    limit = int(os.environ.get("SYNC_PASS_TIMEOUT_S", "7200" if kind == "backfill" else "1200"))
    try:
        rc = subprocess.call(args, timeout=limit)
    except subprocess.TimeoutExpired:
        log.error("%s pass for %s killed after %ss", kind, profile, limit)
        return 124
    log.info("%s pass for %s finished rc=%s", kind, profile, rc)
    return rc


def cmd_loop(_: argparse.Namespace) -> int:
    minutes = max(5, int(os.environ.get("SYNC_INTERVAL_MINUTES", "30")))
    _, store = _deps()
    due: dict[str, float] = {}  # profile -> monotonic time of its next scheduled pass
    try:
        store.interrupt_stale_runs()
    except Exception as e:  # noqa: BLE001 - db not ready yet: the loop below retries
        log.warning("cannot clean up old runs: %s", type(e).__name__)
    while True:
        try:
            store.mirror_accounts()
            profiles = store.connected_profiles()
            req = store.claim_request()
        except Exception as e:  # noqa: BLE001 - db down: retry next tick
            log.error("cannot read profiles or requests: %s", type(e).__name__)
            time.sleep(30)
            continue
        if req:
            try:
                _pass(req["profile"], req["kind"], req["since"])
            finally:
                store.finish_request(req["id"])
            due[req["profile"]] = time.monotonic() + minutes * 60
            store.set_next_run(req["profile"], _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(minutes=minutes))
            continue
        now = time.monotonic()
        for p in profiles:
            if not store.ever_backfilled(p):
                store.add_request(p, "backfill")  # a new login: fetch its history next tick
                continue
            if now >= due.get(p, 0):
                _pass(p)
                due[p] = time.monotonic() + minutes * 60
                store.set_next_run(p, _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(minutes=minutes))
        time.sleep(TICK_SECONDS)


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
