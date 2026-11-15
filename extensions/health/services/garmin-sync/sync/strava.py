"""Strava through its official API (v3): the athlete's activities, and their title and description.

Rate limits (per app): about 100 calls in 15 minutes and 1000 a day for reads, so a pass reads pages of
200 since the last activity it knows. Each activity is linked to the Garmin activity of the same workout
(same start within two minutes), which is how a plan's session name reaches Strava.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Callable

from . import http

API = "https://www.strava.com/api/v3"
PAGE = 200
MAX_PAGES = 10
FIRST_DAYS = 365
MATCH_S = 120


class Strava:
    def __init__(self, token: Callable[[], str], call: Callable[..., Any] = http.request) -> None:
        self._token, self._call = token, call

    def activities(self, after: _dt.datetime) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for page in range(1, MAX_PAGES + 1):
            rows = self._call("GET", f"{API}/athlete/activities", query={"after": int(after.timestamp()), "per_page": PAGE, "page": page}, token=self._token())
            if not isinstance(rows, list) or not rows:
                break
            out += [r for r in rows if isinstance(r, dict)]
            if len(rows) < PAGE:
                break
        return out

    def activity(self, strava_id: str) -> dict[str, Any]:
        return self._call("GET", f"{API}/activities/{int(strava_id)}", token=self._token()) or {}

    def edit(self, strava_id: str, title: str | None, description: str | None) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if title is not None:
            body["name"] = title
        if description is not None:
            body["description"] = description
        return self._call("PUT", f"{API}/activities/{int(strava_id)}", json_body=body, token=self._token()) or {}


def _when(v: Any) -> _dt.datetime | None:
    if not isinstance(v, str) or not v:
        return None
    try:
        return _dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize(a: dict[str, Any]) -> dict[str, Any] | None:
    """One Strava summary activity as a row of health.synced_strava_activities (no garmin link yet)."""
    start = _when(a.get("start_date"))
    if a.get("id") is None or start is None:
        return None
    return {
        "strava_id": str(a["id"]),
        "name": a.get("name"),
        "description": a.get("description"),
        "sport": str(a.get("sport_type") or a.get("type") or "Workout"),
        "start_time": start,
        "distance_m": a.get("distance"),
        "duration_s": a.get("elapsed_time"),
        "raw": a,
    }


def link(rows: list[dict[str, Any]], garmin: list[tuple[str, _dt.datetime]]) -> None:
    """Set garmin_activity_id on each row whose start is within MATCH_S of a Garmin activity's start."""
    for r in rows:
        best: tuple[float, str] | None = None
        for gid, gstart in garmin:
            d = abs((gstart - r["start_time"]).total_seconds())
            if d <= MATCH_S and (best is None or d < best[0]):
                best = (d, gid)
        r["garmin_activity_id"] = best[1] if best else None
