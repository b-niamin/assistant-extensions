"""Garmin writes that garmin_core does not have: a weigh-in, and an activity's name and description.

garmin_core (copied from open-vitals) stays close to upstream, so these live here and go through the same
garmy_client.connectapi_write. ASSUMPTION (unverified, like spec 050's workout paths): the paths and
bodies third-party clients (python-garminconnect add_weigh_in, set_activity_name) use.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any

from garmin_core import garmy_client

WEIGHT_PATH = "/weight-service/user-weight"
ACTIVITY_PATH = "/activity-service/activity/{activity_id}"


def weight_body(kg: float, at: _dt.datetime, tz: str) -> dict[str, Any]:
    from zoneinfo import ZoneInfo

    utc = at.astimezone(_dt.timezone.utc)
    local = at.astimezone(ZoneInfo(tz))
    fmt = "%Y-%m-%dT%H:%M:%S.00"
    return {"dateTimestamp": local.strftime(fmt), "gmtTimestamp": utc.strftime(fmt), "unitKey": "kg", "sourceType": "MANUAL", "value": round(float(kg), 2)}


def add_weight(api: Any, kg: float, at: _dt.datetime, tz: str) -> Any:
    return garmy_client.connectapi_write(api, WEIGHT_PATH, "POST", weight_body(kg, at, tz))


def activity_body(activity_id: str, title: str | None, description: str | None) -> dict[str, Any]:
    body: dict[str, Any] = {"activityId": int(activity_id)}
    if title is not None:
        body["activityName"] = title
    if description is not None:
        body["description"] = description
    return body


def edit_activity(api: Any, activity_id: str, title: str | None, description: str | None) -> Any:
    return garmy_client.connectapi_write(api, ACTIVITY_PATH.format(activity_id=int(activity_id)), "PUT", activity_body(activity_id, title, description))
