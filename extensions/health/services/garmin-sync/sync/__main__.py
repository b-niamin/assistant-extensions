"""CLI for the Garmin sync.

  python -m sync login   [--profile alex]           one-time interactive Garmin login (password never stored)
  python -m sync status  [--profile alex]           token status
  python -m sync run     [--profile alex]           one incremental pass
  python -m sync backfill [--profile alex]  [--since 2020-01-01]
  python -m sync loop                               sync every connected profile, forever
  python -m sync connect strava|withings [--profile alex] [--app https://...]   sign in to an API source
  python -m sync disconnect strava|withings [--profile alex]                    forget that login
  python -m sync connectors                         Strava, Withings and the writes (outbox), forever

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
import subprocess
import sys
import time

from assistant import env, env_int, logger
from garmin_core.auth import GarminAuth
from garmin_core.errors import InvalidCredentials, MfaRequired
from garmin_core.metrics import MetricsService
from garmin_core.tokens import PostgresTokenStore

from . import connectors, oauth
from .cstore import ConnectorStore
from .engine import Engine
from .oauth import OAuthStore
from .outbox import Runner
from .store import Store

log = logging.getLogger("garmin-sync")


def _env(name: str) -> str:
    v = env(name)
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
    limit = env_int("SYNC_PASS_TIMEOUT_S", 7200 if kind == "backfill" else 1200, minimum=60)
    try:
        rc = subprocess.call(args, timeout=limit)
    except subprocess.TimeoutExpired:
        log.error("%s pass for %s killed after %ss", kind, profile, limit)
        return 124
    log.info("%s pass for %s finished rc=%s", kind, profile, rc)
    return rc


def cmd_loop(_: argparse.Namespace) -> int:
    minutes = env_int("SYNC_INTERVAL_MINUTES", 30, minimum=5)
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


def _oauth() -> tuple[OAuthStore, ConnectorStore]:
    dsn = _env("DATABASE_URL")
    return OAuthStore(dsn, _env("TOKEN_ENCRYPTION_KEY")), ConnectorStore(dsn)


def cmd_connect(a: argparse.Namespace) -> int:
    """Sign in to Strava or Withings with the owner's own API app: nothing of it is ever shown again."""
    oauth_store, cstore = _oauth()
    p = oauth.PROVIDERS[a.provider]
    print(f"{p['name']}: create your own API app at {p['apps']} (free, for your own account).")
    app = (a.app or input("Address of this app (as in your browser, e.g. https://nas.tailnet.ts.net:8443): ")).strip().rstrip("/")
    if not app.startswith(("https://", "http://")):
        sys.exit("the address starts with https://")
    redirect = f"{app}/health/oauth"
    host = redirect.split("/")[2].split(":")[0]
    print(f"In the app's settings set the callback {'domain' if a.provider == 'strava' else 'URL'} to: {host if a.provider == 'strava' else redirect}")
    old = oauth_store.load(a.profile, a.provider) or {}
    client_id = input(f"Client ID{' [keep ' + old['client_id'] + ']' if old.get('client_id') else ''}: ").strip() or old.get("client_id", "")
    secret = getpass.getpass("Client secret (hidden; Enter keeps the saved one): ").strip() or old.get("client_secret", "")
    if not client_id or not secret:
        sys.exit("both the client ID and the secret are needed")
    state = oauth.new_state()
    cstore.add_pending(state, a.profile, a.provider, redirect)
    print("\nOpen this address, allow access, and come back here:\n")
    print(oauth.authorize_url(a.provider, client_id, redirect, state), "\n")
    print("Waiting for the answer (10 minutes). If the page does not open, paste the address you landed on here.")
    code = _wait_code(cstore, state)
    if not code:
        cstore.drop_pending(state)
        print("No answer: nothing was saved. Run the command again.")
        return 1
    client = {"client_id": client_id, "client_secret": secret}
    try:
        tokens = oauth.exchange(a.provider, client, code, redirect)
    except Exception as e:  # noqa: BLE001
        cstore.drop_pending(state)
        print(f"{p['name']} did not accept it: {e}")
        return 1
    finally:
        secret = ""  # noqa: F841
    cstore.drop_pending(state)
    oauth_store.save(a.profile, a.provider, {**client, "redirect_uri": redirect, **tokens})
    cstore.account(a.profile, a.provider, "connected", fresh=True)
    print(f"Connected{' as ' + tokens['account'] if tokens.get('account') else ''}. The first sync starts within a minute.")
    return 0


def _wait_code(cstore: ConnectorStore, state: str) -> str | None:
    import select
    import urllib.parse as up

    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        row = cstore.pending(state)
        if row and row.get("error"):
            print(f"Refused: {row['error']}")
            return None
        if row and row.get("code"):
            return row["code"]
        ready, _, _ = select.select([sys.stdin], [], [], 2)
        if ready:
            line = sys.stdin.readline().strip()
            q = up.parse_qs(up.urlparse(line).query)
            if q.get("state", [""])[0] == state and q.get("code"):
                return q["code"][0]
            if line:
                print("That address has no code for this sign-in; try again or wait.")
    return None


def cmd_disconnect(a: argparse.Namespace) -> int:
    oauth_store, cstore = _oauth()
    oauth_store.clear(a.profile, a.provider)
    cstore.account(a.profile, a.provider, "disconnected")
    print(f"{oauth.PROVIDERS[a.provider]['name']}: login removed. Revoke the app's access in that account too.")
    return 0


def cmd_connectors(_: argparse.Namespace) -> int:
    oauth_store, cstore = _oauth()
    tokens, _store = _deps()
    zone = connectors.tz()
    strava_for = lambda p: connectors.Connectors(cstore, oauth_store, None, zone).client(p, "strava")  # noqa: E731
    runner = Runner(cstore, MetricsService(tokens), strava_for, zone)
    connectors.Connectors(cstore, oauth_store, runner, zone).loop()
    return 0


def main() -> int:
    logger("garmin-sync")  # the worker's log format, LOG_LEVEL
    p = argparse.ArgumentParser(prog="python -m sync")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("login", "status", "run", "backfill"):
        sp = sub.add_parser(name)
        # Default: DEFAULT_PROFILE, else the first profile (the one made in /setup).
        sp.add_argument("--profile", default=env("DEFAULT_PROFILE") or None)
        if name == "backfill":
            sp.add_argument("--since", help="YYYY-MM-DD (default: 5 years back)")
    sub.add_parser("loop")
    sub.add_parser("connectors")
    for name in ("connect", "disconnect"):
        sp = sub.add_parser(name)
        sp.add_argument("provider", choices=sorted(oauth.PROVIDERS))
        sp.add_argument("--profile", default=env("DEFAULT_PROFILE") or None)
        if name == "connect":
            sp.add_argument("--app", help="this app's address, e.g. https://nas.tailnet.ts.net:8443")
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
    if a.cmd == "connect":
        return cmd_connect(a)
    if a.cmd == "disconnect":
        return cmd_disconnect(a)
    if a.cmd == "connectors":
        return cmd_connectors(a)
    return cmd_loop(a)


if __name__ == "__main__":
    sys.exit(main())
