"""The `connectors` service: Strava and Withings syncs, OAuth sign-ins and the outbox (writes to Garmin,
Strava). Runs beside garmin-sync, from the same folder; garmin-sync keeps the Garmin reads.

Every tick (5 s): a finished OAuth sign-in is traded for tokens, one queued write runs, a "Sync now" asked
for in the panel runs. Every SYNC_INTERVAL_MINUTES each connected profile is synced from both sources.
"""
from __future__ import annotations

import datetime as _dt
import logging
import time
from typing import Any

from pingo import env, env_int

from . import strava as strava_mod
from . import withings as withings_mod
from .http import HttpError
from .oauth import NotConnected, OAuthStore, Session

log = logging.getLogger("connectors")
SOURCES = ("strava", "withings")
TICK_SECONDS = 5


def sync_strava(store: Any, client: Any, profile: str, now: _dt.datetime) -> dict[str, Any]:
    cur = store.cursor(profile, "strava")
    after = _dt.datetime.fromisoformat(cur["after"]) if cur.get("after") else now - _dt.timedelta(days=strava_mod.FIRST_DAYS)
    rows = [r for r in (strava_mod.normalize(a) for a in client.activities(after)) if r]
    if rows:
        strava_mod.link(rows, store.garmin_starts(profile, min(r["start_time"] for r in rows)))
        store.put_strava(profile, rows)
    # Garmin may sync after Strava: try the recent unlinked ones again.
    late = store.unlinked_strava(profile)
    if late:
        strava_mod.link(late, store.garmin_starts(profile, min(r["start_time"] for r in late)))
        for r in late:
            if r.get("garmin_activity_id"):
                store.set_strava_link(profile, r["strava_id"], r["garmin_activity_id"])
    newest = max([r["start_time"] for r in rows], default=after)
    store.set_cursor(profile, "strava", {**cur, "after": (newest - _dt.timedelta(hours=1)).isoformat(), "count": cur.get("count", 0) + len(rows)})
    return {"activities": len(rows)}


def sync_withings(store: Any, client: Any, profile: str, now: _dt.datetime, tz: str) -> dict[str, Any]:
    cur = store.cursor(profile, "withings")
    since = _dt.datetime.fromisoformat(cur["since"]) if cur.get("since") else now - _dt.timedelta(days=withings_mod.FIRST_DAYS)
    points = withings_mod.weigh_ins(client.groups(since), tz)
    store.put_weights(profile, "withings", points)
    queued = 0
    # Copy new weigh-ins to Garmin when the owner switched it on; never ones from before the switch.
    opt = store.option(profile, "withings_to_garmin")
    if isinstance(opt, dict) and opt.get("on") and points:
        start = _dt.datetime.fromisoformat(cur.get("pushedUntil") or opt.get("since") or now.isoformat())
        fresh = [p for p in points if p["at"] > start]
        on_garmin = store.garmin_weight_days(profile, [p["day"] for p in fresh])
        for p in fresh:
            if abs(on_garmin.get(p["day"], -1) - p["weight_kg"]) < 0.05:
                continue
            store.queue(profile, "garmin", "add_weight", {"kg": p["weight_kg"], "at": p["at"].isoformat(), "from": "withings"})
            queued += 1
        if fresh:
            cur["pushedUntil"] = max(p["at"] for p in fresh).isoformat()
    store.set_cursor(profile, "withings", {**cur, "since": (now - _dt.timedelta(days=2)).isoformat()})
    return {"weigh_ins": len(points), "to_garmin": queued}


class Connectors:
    def __init__(self, store: Any, oauth: OAuthStore, runner: Any, tz: str) -> None:
        self.store, self.oauth, self.runner, self.tz = store, oauth, runner, tz

    def client(self, profile: str, source: str) -> Any:
        session = Session(self.oauth, profile, source)
        return strava_mod.Strava(session.token) if source == "strava" else withings_mod.Withings(session.token)

    def sync(self, profile: str, source: str) -> None:
        now = _dt.datetime.now(_dt.timezone.utc)
        try:
            c = self.client(profile, source)
            out = sync_strava(self.store, c, profile, now) if source == "strava" else sync_withings(self.store, c, profile, now, self.tz)
            self.store.account(profile, source, "connected")
            log.info("%s sync for %s: %s", source, profile, out)
        except NotConnected as e:
            self.store.account(profile, source, "reconnect" if e.reconnect else "disconnected")
            log.warning("%s for %s: %s", source, profile, e)
        except HttpError as e:
            if e.status in (401, 403):
                self.store.account(profile, source, "reconnect")
            log.warning("%s sync for %s failed: %s", source, profile, e)

    def tick_outbox(self) -> bool:
        item = self.store.claim_outbox()
        if not item:
            return False
        state, result, error = self.runner.run(item)
        self.store.finish_outbox(item["id"], state, result, error)
        log.info("write %s.%s for %s: %s%s", item["target"], item["op"], item["profile"], state, f" ({error})" if error else "")
        return True

    def loop(self) -> None:
        minutes = env_int("SYNC_INTERVAL_MINUTES", 30, minimum=5)
        due: dict[tuple[str, str], float] = {}
        try:
            self.store.requeue_interrupted()
        except Exception as e:  # noqa: BLE001 - db not ready: the loop retries
            log.warning("cannot requeue writes: %s", type(e).__name__)
        while True:
            try:
                while self.tick_outbox():
                    pass
                req = self.store.claim_request(SOURCES)
                if req:
                    try:
                        self.sync(req["profile"], req["source"])
                    finally:
                        self.store.finish_request(req["id"])
                    due[(req["profile"], req["source"])] = time.monotonic() + minutes * 60
                for source in SOURCES:
                    for p in self.oauth.profiles(source):
                        if time.monotonic() >= due.get((p, source), 0):
                            self.sync(p, source)
                            due[(p, source)] = time.monotonic() + minutes * 60
            except Exception as e:  # noqa: BLE001 - db down or a bug in one pass: next tick
                log.error("connectors tick failed: %s", type(e).__name__)
                time.sleep(30)
            time.sleep(TICK_SECONDS)


def tz() -> str:
    return env("TZ") or "UTC"
