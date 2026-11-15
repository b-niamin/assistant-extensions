"""Withings through its official Public API: the scale's body measures.

getmeas returns measure groups; each measure is value * 10^unit. Weight is type 1; the rest (fat ratio 6,
fat mass 8, muscle mass 76, hydration 77, bone mass 88, ...) stays in raw for the UI and Claude.
health.synced_weight keeps one row per day and source, so the day's latest weigh-in wins.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Callable
from zoneinfo import ZoneInfo

from . import http

API = "https://wbsapi.withings.net/measure"
TYPES = {1: "weight_kg", 5: "fat_free_kg", 6: "fat_pct", 8: "fat_kg", 76: "muscle_kg", 77: "water_kg", 88: "bone_kg"}
FIRST_DAYS = 365 * 3


class Withings:
    def __init__(self, token: Callable[[], str], call: Callable[..., Any] = http.request) -> None:
        self._token, self._call = token, call

    def groups(self, since: _dt.datetime) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        offset = None
        for _ in range(20):
            body = self._call(
                "POST", API,
                form={"action": "getmeas", "meastypes": ",".join(str(t) for t in TYPES), "category": 1, "lastupdate": int(since.timestamp()), "offset": offset},
                token=self._token(),
            )
            if not isinstance(body, dict) or body.get("status") != 0:
                raise http.HttpError(400, f"Withings status {body.get('status') if isinstance(body, dict) else '?'}")
            b = body.get("body") or {}
            out += [g for g in b.get("measuregrps") or [] if isinstance(g, dict)]
            if not b.get("more"):
                break
            offset = b.get("offset")
        return out


def weigh_ins(groups: list[dict[str, Any]], tz: str) -> list[dict[str, Any]]:
    """Measure groups -> [{day, at (UTC), weight_kg, raw: {at, weight_kg, fat_pct, ...}}], the day's latest only."""
    zone = ZoneInfo(tz)
    best: dict[str, dict[str, Any]] = {}
    for g in groups:
        at = g.get("date")
        if not isinstance(at, (int, float)):
            continue
        values: dict[str, float] = {}
        for m in g.get("measures") or []:
            name = TYPES.get(m.get("type"))
            if name and isinstance(m.get("value"), (int, float)) and isinstance(m.get("unit"), int):
                values[name] = round(m["value"] * 10 ** m["unit"], 3)
        if "weight_kg" not in values:
            continue
        when = _dt.datetime.fromtimestamp(at, _dt.timezone.utc)
        day = when.astimezone(zone).date().isoformat()
        if day in best and best[day]["at"] >= when:
            continue
        best[day] = {"day": day, "at": when, "weight_kg": values["weight_kg"], "raw": {"at": when.isoformat(), "grpid": g.get("grpid"), **values}}
    return sorted(best.values(), key=lambda p: p["day"])
