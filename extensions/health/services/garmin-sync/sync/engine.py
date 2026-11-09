"""One sync pass for one profile. Simplified port of open-vitals apps/web sync/engine.ts.

Phases are independent: a failure in one is recorded in the run detail and the next phase still
runs. Only a rejected token or a rate limit aborts the pass (every further call would fail too).
"""
from __future__ import annotations

import datetime as _dt
import logging
from typing import Any

from garmin_core.errors import GarminUpstreamError, NotAuthenticated
from garmin_core.metrics import SUPPORTED_METRICS, MetricsService

from . import normalize
from .store import Store

log = logging.getLogger("garmin-sync.engine")

DAILY_METRICS = [m for m in SUPPORTED_METRICS if m not in ("activities", "body_composition")]
CHUNK_DAYS = 31          # garmin_core range cap
ACTIVITY_PAGE = 100
MAX_ACTIVITY_PAGES = 200
RECENT_DAYS = 7          # incremental re-reads a week: the watch often uploads late
EMPTY_CHUNKS_STOP = 12   # backfill: a year of nothing is the end of history
FATAL = ("token_rejected", "rate_limited")


class Abort(Exception):
    pass


def _fatal(err: Exception) -> bool:
    return isinstance(err, NotAuthenticated) or (isinstance(err, GarminUpstreamError) and err.code in FATAL)


def _err(err: Exception) -> str:
    if isinstance(err, GarminUpstreamError):
        return f"{err.code}: {err.reason}"
    return type(err).__name__


# Share of the progress bar each phase of a pass fills. A backfill spends nearly all of its time on
# the metric history, so the quick phases get a small slice there.
PHASES = ("metrics_recent", "activities", "streams", "weight", "planned")
INCREMENTAL_SHARE = {"metrics_recent": 0.3, "activities": 0.2, "streams": 0.3, "weight": 0.1, "planned": 0.1}
HISTORY_START = 0.15  # backfill: the quick phases fill 0..15 %, the history the rest

LABELS = {
    "metrics_recent": "Fetching the last days",
    "activities": "Fetching activities",
    "streams": "Fetching activity details",
    "weight": "Fetching weight",
    "planned": "Fetching planned workouts",
    "metrics_history": "Fetching history",
}


class Engine:
    def __init__(self, garmin: MetricsService, store: Store, today: _dt.date | None = None) -> None:
        self.g = garmin
        self.s = store
        self.today = today or _dt.date.today()
        self._run_id: str | None = None
        self._span = (0.0, 1.0)  # the slice of the bar the current phase fills

    def _progress(self, within: float, label: str) -> None:
        """Report `within` (0..1) of the current phase. Best-effort: a failed write never stops a sync."""
        if self._run_id is None:
            return
        lo, hi = self._span
        try:
            self.s.progress(self._run_id, lo + (hi - lo) * max(0.0, min(1.0, within)), label)
        except Exception as e:  # noqa: BLE001
            log.warning("progress write failed: %s", type(e).__name__)

    # -- phases ----------------------------------------------------------------
    def metrics(self, profile: str, start: _dt.date, end: _dt.date) -> int:
        """Every daily metric for [start, end] (<= CHUNK_DAYS). Returns days with any reading."""
        present = 0
        for metric in DAILY_METRICS:
            try:
                rng = self.g.get_metric_range(profile, metric, start, end)
            except Exception as e:  # noqa: BLE001
                if _fatal(e):
                    raise Abort(_err(e)) from e
                log.warning("metric %s %s..%s failed: %s", metric, start, end, _err(e))
                continue
            days = [{"day": d["date"], "data": d["data"], "has_value": normalize.has_value(d["data"])} for d in rng["days"]]
            self.s.put_metric_days(profile, metric, days)
            present += sum(1 for d in days if d["has_value"])
        return present

    def activities(self, profile: str, full: bool) -> int:
        known = set() if full else self.s.known_activity_ids(profile)
        count = 0
        for page in range(MAX_ACTIVITY_PAGES):
            try:
                raw = self.g.list_activities(profile, limit=ACTIVITY_PAGE, start=page * ACTIVITY_PAGE)
            except Exception as e:  # noqa: BLE001
                if _fatal(e):
                    raise Abort(_err(e)) from e
                raise
            if not raw:
                break
            rows = [r for r in (normalize.activity_row(x) for x in raw) if r]
            self.s.put_activities(profile, rows)
            count += len(rows)
            # The total is unknown: creep towards the end of the slice page by page.
            self._progress(1 - 0.8 ** (page + 1), f"Fetching activities ({count})")
            if not full and rows and all(r["activity_id"] in known for r in rows):
                break
            if len(raw) < ACTIVITY_PAGE:
                break
        return count

    def streams(self, profile: str, budget: int) -> int:
        fetched = 0
        todo = self.s.activities_missing_streams(profile, normalize.STREAMS_SCHEMA_VERSION, budget)
        for i, a in enumerate(todo):
            self._progress(i / len(todo), f"Fetching activity details ({i + 1}/{len(todo)})")
            try:
                d = self.g.get_activity_details(profile, int(a["activity_id"]))
            except Exception as e:  # noqa: BLE001
                if _fatal(e):
                    raise Abort(_err(e)) from e
                log.warning("streams %s failed: %s", a["activity_id"], _err(e))
                continue
            streams = normalize.streams_from_details(d)
            self.s.put_streams(profile, a["activity_id"], streams, bool(streams.get("gps")) and not a["has_gps"])
            fetched += 1
        return fetched

    def weight(self, profile: str, since: _dt.date) -> int:
        points = 0
        end = self.today
        while end >= since:
            start = max(since, end - _dt.timedelta(days=365))
            try:
                data = self.g.get_weight_range(profile, start, end)["data"]
            except Exception as e:  # noqa: BLE001
                if _fatal(e):
                    raise Abort(_err(e)) from e
                raise
            pts = normalize.weigh_ins(data)
            self.s.put_weight(profile, pts)
            points += len(pts)
            end = start - _dt.timedelta(days=1)
        return points

    def planned(self, profile: str, days_ahead: int = 30) -> int:
        start, end = self.today, self.today + _dt.timedelta(days=days_ahead)
        try:
            res = self.g.get_planned_events(profile, start, end)
        except Exception as e:  # noqa: BLE001
            if _fatal(e):
                raise Abort(_err(e)) from e
            raise
        if not res.get("available"):
            return 0
        events = res.get("events", [])
        self.s.replace_planned(profile, start.isoformat(), end.isoformat(), events)
        return len(events)

    # -- passes ----------------------------------------------------------------
    def _phase(self, detail: dict[str, Any], name: str, fn, *args) -> None:  # type: ignore[no-untyped-def]
        self._progress(0, LABELS.get(name, name))
        try:
            detail[name] = fn(*args)
        except Abort:
            raise
        except Exception as e:  # noqa: BLE001
            detail[name] = {"error": _err(e)}
            log.warning("phase %s failed: %s", name, _err(e))

    def run(self, profile: str, kind: str = "incremental", since: _dt.date | None = None) -> dict[str, Any]:
        full = kind == "backfill"
        run_id = self._run_id = self.s.start_run(profile, kind, since)
        detail: dict[str, Any] = {}
        recent_start = self.today - _dt.timedelta(days=RECENT_DAYS - 1)
        weight_since = since or (self.today - _dt.timedelta(days=5 * 365 if full else 90))
        steps = {
            "metrics_recent": (self.metrics, profile, recent_start, self.today),
            "activities": (self.activities, profile, full),
            "streams": (self.streams, profile, 400 if full else 80),
            "weight": (self.weight, profile, weight_since),
            "planned": (self.planned, profile),
        }
        try:
            at = 0.0
            for name in PHASES:
                share = INCREMENTAL_SHARE[name] * (HISTORY_START if full else 1)
                self._span = (at, at + share)
                fn, *args = steps[name]
                self._phase(detail, name, fn, *args)
                at += share
            if full:
                self._span = (HISTORY_START, 1.0)
                self._phase(detail, "metrics_history", self.backfill_metrics, profile, since)
        except Abort as e:
            self.s.finish_run(run_id, "failed", detail, str(e))
            if str(e).startswith("token_rejected") or "NotAuthenticated" in str(e):
                self.s.account_status(profile, "reconnect")
            log.error("sync aborted for %s: %s", profile, e)
            return {"status": "failed", "error": str(e), **detail}
        status = "partial" if any(isinstance(v, dict) and "error" in v for v in detail.values()) else "ok"
        self.s.finish_run(run_id, status, detail)
        self.s.account_status(profile, "connected")
        cursor = self.s.get_cursor(profile)
        cursor["lastRun"] = self.today.isoformat()
        self.s.set_cursor(profile, cursor, full=full)
        return {"status": status, **detail}

    def backfill_metrics(self, profile: str, since: _dt.date | None) -> dict[str, Any]:
        """Walk daily metrics backwards in 31-day chunks, resuming from the saved frontier."""
        cursor = self.s.get_cursor(profile)
        floor = since or (self.today - _dt.timedelta(days=5 * 365))
        frontier = _dt.date.fromisoformat(cursor["metricsBackfilledTo"]) if cursor.get("metricsBackfilledTo") else (
            self.today - _dt.timedelta(days=RECENT_DAYS)
        )
        empty, chunks, present = 0, 0, 0
        first, total = frontier, max(1, (frontier - floor).days)
        while frontier > floor and empty < EMPTY_CHUNKS_STOP:
            end = frontier - _dt.timedelta(days=1)
            start = max(floor, end - _dt.timedelta(days=CHUNK_DAYS - 1))
            self._progress((first - frontier).days / total, f"Fetching history: {end.strftime('%B %Y')}")
            got = self.metrics(profile, start, end)
            present += got
            empty = 0 if got else empty + 1
            chunks += 1
            frontier = start
            cursor["metricsBackfilledTo"] = frontier.isoformat()
            self.s.set_cursor(profile, cursor)
            log.info("backfill %s: %s..%s, %d day-readings", profile, start, end, got)
        cursor["metricsComplete"] = True
        self.s.set_cursor(profile, cursor)
        return {"chunks": chunks, "readings": present, "to": frontier.isoformat()}
