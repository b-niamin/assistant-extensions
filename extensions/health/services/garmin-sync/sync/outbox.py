"""Runs the writes queued in health.outbox, one at a time, oldest first.

Each op is safe to repeat (a workout is replaced by its ref, an edit sets the same fields again), so a
write cut off by a restart is simply run again. A source that cannot take the write (no workout type
for the sport, an endpoint Garmin does not have) ends as `unsupported`, never as a pretended success.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Callable

from garmin_core.errors import InvalidWorkout, NotAuthenticated

from . import garmin_writes
from .http import HttpError
from .oauth import NotConnected

# (target, op) -> required payload keys
OPS: dict[tuple[str, str], tuple[str, ...]] = {
    ("garmin", "send_workout"): ("ref", "sport", "title", "day", "steps"),
    ("garmin", "remove_workout"): ("ref",),
    ("garmin", "add_weight"): ("kg", "at"),
    ("garmin", "edit_activity"): ("activity_id",),
    ("strava", "edit_activity"): ("strava_id",),
}


class Runner:
    """garmin: a MetricsService (workouts, its _api_client for the other writes); strava_for(profile) -> Strava."""

    def __init__(self, store: Any, garmin: Any, strava_for: Callable[[str], Any], tz: str = "UTC") -> None:
        self.store, self.garmin, self.strava_for, self.tz = store, garmin, strava_for, tz

    def run(self, item: dict[str, Any]) -> tuple[str, dict[str, Any] | None, str | None]:
        """-> (state, result, error)."""
        key = (item["target"], item["op"])
        payload = item["payload"] or {}
        if key not in OPS:
            return "failed", None, f"unknown write {item['target']}.{item['op']}"
        missing = [k for k in OPS[key] if payload.get(k) in (None, "")]
        if missing:
            return "failed", None, "missing " + ", ".join(missing)
        try:
            return getattr(self, f"_{item['target']}_{item['op']}")(item["profile"], payload)
        except (NotAuthenticated, NotConnected) as e:
            return "failed", None, str(e) or f"{item['target']} is not connected"
        except InvalidWorkout as e:
            return "failed", None, f"workout not valid: {e}"
        except HttpError as e:
            return "failed", None, str(e)
        except Exception as e:  # noqa: BLE001 - classified Garmin errors and anything else: never the payload
            return "failed", None, getattr(e, "reason", None) or type(e).__name__

    # -- Garmin ----------------------------------------------------------------
    def _garmin_send_workout(self, profile: str, p: dict[str, Any]):
        old = self.store.pushed(profile, p["ref"])
        if old and old.get("garmin_workout_id"):
            self.garmin.delete_workout(profile, old["garmin_workout_id"])
        made = self.garmin.create_workout(profile, p["sport"], p["title"], p["steps"], p.get("note"))
        if not made.get("supported"):
            self.store.drop_pushed(profile, p["ref"])
            return "unsupported", made, made.get("reason")
        wid = made["workoutId"]
        sched = self.garmin.schedule_workout(profile, wid, _dt.date.fromisoformat(p["day"]))
        row = {"garmin_workout_id": wid, "schedule_id": sched.get("scheduleId"), "day": p["day"], "title": p["title"], "sport": p["sport"]}
        self.store.set_pushed(profile, p["ref"], row)
        return "done", {"workoutId": wid, "scheduleId": sched.get("scheduleId"), "scheduled": bool(sched.get("supported"))}, None

    def _garmin_remove_workout(self, profile: str, p: dict[str, Any]):
        old = self.store.pushed(profile, p["ref"])
        if not old or not old.get("garmin_workout_id"):
            self.store.drop_pushed(profile, p["ref"])
            return "done", {"removed": False, "reason": "not on Garmin"}, None
        out = self.garmin.delete_workout(profile, old["garmin_workout_id"])
        self.store.drop_pushed(profile, p["ref"])
        return "done", out, None

    def _api(self, profile: str) -> Any:
        return self.garmin._api_client(profile)  # same package boundary as the reads; refreshes tokens

    def _garmin_add_weight(self, profile: str, p: dict[str, Any]):
        at = _dt.datetime.fromisoformat(str(p["at"]).replace("Z", "+00:00"))
        if at.tzinfo is None:
            at = at.replace(tzinfo=_dt.timezone.utc)
        kg = float(p["kg"])
        if not 20 <= kg <= 400:
            return "failed", None, "kg must be 20-400"
        garmin_writes.add_weight(self._api(profile), kg, at, self.tz)
        return "done", {"kg": kg, "at": at.isoformat()}, None

    def _garmin_edit_activity(self, profile: str, p: dict[str, Any]):
        title, description = p.get("title"), p.get("description")
        garmin_writes.edit_activity(self._api(profile), str(p["activity_id"]), title, description)
        self.store.garmin_edited(profile, str(p["activity_id"]), title, description)
        return "done", {"activity_id": str(p["activity_id"])}, None

    # -- Strava ----------------------------------------------------------------
    def _strava_edit_activity(self, profile: str, p: dict[str, Any]):
        title, description = p.get("title"), p.get("description")
        got = self.strava_for(profile).edit(str(p["strava_id"]), title, description)
        self.store.strava_edited(profile, str(p["strava_id"]), got.get("name", title), got.get("description", description))
        return "done", {"strava_id": str(p["strava_id"]), "name": got.get("name")}, None
