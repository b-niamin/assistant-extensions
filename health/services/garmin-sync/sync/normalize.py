"""Turn raw Garmin payloads into rows. Ported from open-vitals apps/web sync/normalize.ts and
garmin/http-adapter.ts. Field names are probed best-effort: a shape drift yields a NULL, never a
crashed sync. The raw payload is always kept alongside."""
from __future__ import annotations

import datetime as _dt
from typing import Any

STREAMS_SCHEMA_VERSION = 2

STREAM_FIELDS = (
    "gps", "time", "heartRate", "power", "cadence", "fractionalCadence", "speed", "elevation",
    "grade", "temperature", "respirationRate", "verticalRatio", "verticalOscillation",
    "groundContactTime", "groundContactBalance", "strideLength", "stamina", "staminaPotential",
    "performanceCondition", "movingDuration", "moving", "laps", "typedSplits",
)

# Keys that are bookkeeping, not a reading: a payload holding only these is an empty day.
_META_KEY_HINTS = ("id", "date", "timestamp", "offset", "version", "pk", "gmt", "local")


def _num(o: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for k in keys:
        v = o.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None


def _int(o: dict[str, Any], keys: tuple[str, ...]) -> int | None:
    n = _num(o, keys)
    return None if n is None else round(n)


def _str(o: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for k in keys:
        v = o.get(k)
        if isinstance(v, str) and v:
            return v
    return None


def _sport(o: dict[str, Any]) -> str:
    for k in ("activityType", "activityTypeDTO"):
        at = o.get(k)
        if isinstance(at, dict) and isinstance(at.get("typeKey"), str) and at["typeKey"]:
            return at["typeKey"]
    return _str(o, ("activityType", "sportTypeKey")) or "other"


def _iso(gmt: str | None, local: str | None) -> str:
    src = gmt or local
    if not src:
        return "1970-01-01T00:00:00+00:00"
    try:
        d = _dt.datetime.fromisoformat(src.replace(" ", "T").rstrip("Z"))
    except ValueError:
        return "1970-01-01T00:00:00+00:00"
    if gmt:
        d = d.replace(tzinfo=_dt.timezone.utc)
    return d.isoformat()


def workout_id_of(o: dict[str, Any]) -> str | None:
    v = o.get("workoutId")
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return str(int(v))
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


def activity_row(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    aid = raw.get("activityId", raw.get("activityIdStr"))
    if aid is None or aid == "":
        return None
    local = _str(raw, ("startTimeLocal",)) or _str(raw, ("startTimeGMT",)) or "1970-01-01 00:00:00"
    gmt = _str(raw, ("startTimeGMT",))
    return {
        "activity_id": str(aid),
        "sport": _sport(raw),
        "name": _str(raw, ("activityName", "name")),
        "start_time": _iso(gmt, local),
        "start_time_local": local,
        "distance_m": _num(raw, ("distance", "distanceInMeters")),
        "duration_s": _num(raw, ("duration", "elapsedDuration", "movingDuration")),
        "moving_s": _num(raw, ("movingDuration", "duration")),
        "elevation_gain_m": _num(raw, ("elevationGain", "totalElevationGain")),
        "avg_hr": _int(raw, ("averageHR", "avgHr")),
        "max_hr": _int(raw, ("maxHR", "maxHr")),
        "avg_power": _int(raw, ("avgPower", "averagePower", "avgBikingPower")),
        "max_power": _int(raw, ("maxPower", "maxBikingPower")),
        "norm_power": _int(raw, ("normPower", "normalizedPower")),
        "calories": _int(raw, ("calories", "activeKilocalories")),
        "training_load": _num(raw, ("activityTrainingLoad", "trainingLoad")),
        "has_gps": raw.get("hasPolyline") is True or raw.get("hasGps") is True,
        "garmin_workout_id": workout_id_of(raw),
        "raw": raw,
    }


def wants_streams(row: dict[str, Any]) -> bool:
    return bool(row.get("has_gps")) or any(row.get(k) is not None for k in ("avg_power", "avg_hr", "max_hr"))


def streams_from_details(details: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {"v": STREAMS_SCHEMA_VERSION}
    for f in STREAM_FIELDS:
        v = details.get(f)
        if isinstance(v, list) and v:
            out[f] = v
    return out


def has_value(data: Any) -> bool:
    """Does a day's payload hold a real reading? Garmin answers an empty day with a present object
    whose fields are all null, so `data is not None` is not enough. Simplified from open-vitals'
    per-metric specs: any numeric leaf under a non-bookkeeping key counts."""
    def walk(v: Any, key: str = "") -> bool:
        if isinstance(v, bool) or v is None:
            return False
        if isinstance(v, (int, float)):
            k = key.lower()
            return not any(h in k for h in _META_KEY_HINTS)
        if isinstance(v, dict):
            return any(walk(x, str(k)) for k, x in v.items())
        if isinstance(v, list):
            return any(walk(x, key) for x in v)
        return False
    return walk(data)


def _weigh_in_rows(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [r for d in data for r in _weigh_in_rows(d)]
    if isinstance(data, dict):
        for key in ("dateWeightList", "allMetrics", "measurements", "dailyWeightSummaries", "weightList"):
            if isinstance(data.get(key), list):
                return [r for d in data[key] for r in _weigh_in_rows(d)]
        if "weight" in data or "weightGrams" in data:
            return [data]
    return []


def weigh_ins(data: Any) -> list[dict[str, Any]]:
    """Garmin reports weight in GRAMS."""
    out = []
    for r in _weigh_in_rows(data):
        grams = _num(r, ("weight", "weightGrams"))
        day = None
        direct = r.get("calendarDate", r.get("date"))
        if isinstance(direct, str) and len(direct) >= 10:
            day = direct[:10]
        else:
            epoch = r.get("date", r.get("timestampGMT", r.get("weightDate")))
            if isinstance(epoch, (int, float)) and not isinstance(epoch, bool):
                day = _dt.datetime.fromtimestamp(epoch / 1000, _dt.timezone.utc).date().isoformat()
        if grams is None or day is None:
            continue
        out.append({"day": day, "weight_kg": round(grams / 1000, 2), "raw": r})
    return out
