"""Writes into schema `health` (role sync_rw). Every statement is parameterised."""
from __future__ import annotations

import uuid
from typing import Any, Iterable

import psycopg
from psycopg.types.json import Jsonb


class Store:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def _conn(self) -> psycopg.Connection:
        return psycopg.connect(self._dsn, autocommit=True)

    # -- profiles --------------------------------------------------------------
    def profile_exists(self, profile: str) -> bool:
        with self._conn() as c:
            return c.execute("SELECT 1 FROM core.profiles WHERE id = %s", (profile,)).fetchone() is not None

    def first_profile(self) -> str | None:
        with self._conn() as c:
            row = c.execute("SELECT id FROM core.profiles ORDER BY created_at, id LIMIT 1").fetchone()
        return row[0] if row else None

    def connected_profiles(self) -> list[str]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT p.id FROM core.profiles p JOIN secret_garmin_tokens t ON t.user_id = p.id ORDER BY p.id"
            ).fetchall()
        return [r[0] for r in rows]

    # -- metrics ---------------------------------------------------------------
    def put_metric_days(self, profile: str, metric: str, days: Iterable[dict[str, Any]]) -> None:
        rows = [(profile, metric, d["day"], Jsonb(d["data"]) if d["data"] is not None else None, d["has_value"]) for d in days]
        if not rows:
            return
        with self._conn() as c, c.cursor() as cur:
            cur.executemany(
                """INSERT INTO health.synced_metric_days (profile_id, metric, day, data, has_value)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (profile_id, metric, day)
                   DO UPDATE SET data = EXCLUDED.data, has_value = EXCLUDED.has_value, synced_at = now()""",
                rows,
            )

    # -- activities ------------------------------------------------------------
    _ACT_COLS = (
        "activity_id", "sport", "name", "start_time", "start_time_local", "distance_m", "duration_s",
        "moving_s", "elevation_gain_m", "avg_hr", "max_hr", "avg_power", "max_power", "norm_power",
        "calories", "training_load", "has_gps", "garmin_workout_id", "raw",
    )

    def put_activities(self, profile: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        cols = ", ".join(self._ACT_COLS)
        ph = ", ".join(["%s"] * (len(self._ACT_COLS) + 1))
        upd = ", ".join(f"{c} = EXCLUDED.{c}" for c in self._ACT_COLS if c != "activity_id")
        values = [
            (profile, *[Jsonb(r[c]) if c == "raw" else r[c] for c in self._ACT_COLS]) for r in rows
        ]
        with self._conn() as c, c.cursor() as cur:
            cur.executemany(
                f"""INSERT INTO health.synced_activities (profile_id, {cols}) VALUES ({ph})
                    ON CONFLICT (profile_id, activity_id) DO UPDATE SET {upd}, synced_at = now()""",
                values,
            )

    def known_activity_ids(self, profile: str) -> set[str]:
        with self._conn() as c:
            rows = c.execute("SELECT activity_id FROM health.synced_activities WHERE profile_id = %s", (profile,)).fetchall()
        return {r[0] for r in rows}

    def activities_missing_streams(self, profile: str, version: int, limit: int) -> list[dict[str, Any]]:
        """Newest first: activities that should have streams but have none (or an older version)."""
        with self._conn() as c:
            rows = c.execute(
                """SELECT a.activity_id, a.has_gps FROM health.synced_activities a
                   LEFT JOIN health.synced_activity_streams s
                     ON s.profile_id = a.profile_id AND s.activity_id = a.activity_id
                   WHERE a.profile_id = %s
                     AND (a.has_gps OR a.avg_power IS NOT NULL OR a.avg_hr IS NOT NULL OR a.max_hr IS NOT NULL)
                     AND (s.activity_id IS NULL OR COALESCE((s.streams->>'v')::int, 0) < %s)
                   ORDER BY (s.activity_id IS NULL) DESC, a.start_time DESC
                   LIMIT %s""",
                (profile, version, limit),
            ).fetchall()
        return [{"activity_id": r[0], "has_gps": r[1]} for r in rows]

    def put_streams(self, profile: str, activity_id: str, streams: dict[str, Any], has_gps: bool) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO health.synced_activity_streams (profile_id, activity_id, streams, efforts_v)
                   VALUES (%s, %s, %s, NULL)
                   ON CONFLICT (profile_id, activity_id)
                   DO UPDATE SET streams = EXCLUDED.streams, efforts_v = NULL, synced_at = now()""",
                (profile, activity_id, Jsonb(streams)),
            )
            if has_gps:
                c.execute(
                    "UPDATE health.synced_activities SET has_gps = true WHERE profile_id = %s AND activity_id = %s",
                    (profile, activity_id),
                )

    # -- weight / planned ------------------------------------------------------
    def put_weight(self, profile: str, points: list[dict[str, Any]]) -> None:
        if not points:
            return
        with self._conn() as c, c.cursor() as cur:
            cur.executemany(
                """INSERT INTO health.synced_weight (profile_id, day, source, weight_kg, raw)
                   VALUES (%s, %s, 'garmin', %s, %s)
                   ON CONFLICT (profile_id, day, source)
                   DO UPDATE SET weight_kg = EXCLUDED.weight_kg, raw = EXCLUDED.raw, synced_at = now()""",
                [(profile, p["day"], p["weight_kg"], Jsonb(p["raw"])) for p in points],
            )

    def replace_planned(self, profile: str, start: str, end: str, events: list[dict[str, Any]]) -> None:
        """Garmin owns its calendar: the window is replaced wholesale."""
        with self._conn() as c:
            with c.transaction():
                c.execute(
                    "DELETE FROM health.synced_planned_events WHERE profile_id = %s AND source = 'garmin' AND day BETWEEN %s AND %s",
                    (profile, start, end),
                )
                for e in events:
                    c.execute(
                        """INSERT INTO health.synced_planned_events
                             (profile_id, event_id, day, time_local, kind, title, sport, description,
                              duration_s, distance_m, target_load, source)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'garmin')
                           ON CONFLICT (profile_id, event_id) DO UPDATE SET
                             day = EXCLUDED.day, time_local = EXCLUDED.time_local, kind = EXCLUDED.kind,
                             title = EXCLUDED.title, sport = EXCLUDED.sport, description = EXCLUDED.description,
                             duration_s = EXCLUDED.duration_s, distance_m = EXCLUDED.distance_m,
                             target_load = EXCLUDED.target_load, synced_at = now()""",
                        (profile, e["id"], e["day"], e.get("time"), e["kind"], e.get("title"), e.get("sport"),
                         e.get("description"), e.get("estimatedDurationS"), e.get("estimatedDistanceM"),
                         e.get("targetLoad")),
                    )

    # -- bookkeeping -----------------------------------------------------------
    def get_cursor(self, profile: str) -> dict[str, Any]:
        with self._conn() as c:
            row = c.execute(
                "SELECT cursor FROM health.sync_state WHERE profile_id = %s AND source = 'garmin'", (profile,)
            ).fetchone()
        return dict(row[0]) if row else {}

    def set_cursor(self, profile: str, cursor: dict[str, Any], full: bool = False) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO health.sync_state (profile_id, source, cursor, last_sync_at, last_full_sync_at)
                   VALUES (%s, 'garmin', %s, now(), CASE WHEN %s THEN now() END)
                   ON CONFLICT (profile_id, source) DO UPDATE SET cursor = EXCLUDED.cursor, last_sync_at = now(),
                     last_full_sync_at = COALESCE(EXCLUDED.last_full_sync_at, health.sync_state.last_full_sync_at)""",
                (profile, Jsonb(cursor), full),
            )

    def start_run(self, profile: str, kind: str, since: Any = None) -> str:
        run_id = uuid.uuid4().hex
        with self._conn() as c:
            c.execute(
                """INSERT INTO health.sync_runs (id, profile_id, kind, status, since, progress, heartbeat_at)
                   VALUES (%s, %s, %s, 'running', %s, 0, now())""",
                (run_id, profile, kind, since),
            )
        return run_id

    def progress(self, run_id: str, fraction: float, phase: str) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE health.sync_runs SET progress = %s, phase = %s, heartbeat_at = now() WHERE id = %s",
                (max(0.0, min(1.0, fraction)), phase, run_id),
            )

    def interrupt_stale_runs(self) -> None:
        """At service start nothing can be running: rows still marked so were cut off."""
        with self._conn() as c:
            c.execute(
                """UPDATE health.sync_runs SET status = 'failed', finished_at = now(), error = 'interrupted'
                   WHERE status = 'running'"""
            )
            c.execute("UPDATE health.sync_requests SET finished_at = now() WHERE started_at IS NOT NULL AND finished_at IS NULL")

    # -- requests from the settings panel --------------------------------------
    def add_request(self, profile: str, kind: str, since: Any = None) -> str:
        req_id = uuid.uuid4().hex
        with self._conn() as c:
            c.execute(
                "INSERT INTO health.sync_requests (id, profile_id, kind, since) VALUES (%s, %s, %s, %s)",
                (req_id, profile, kind, since),
            )
        return req_id

    def claim_request(self) -> dict[str, Any] | None:
        """The oldest waiting request of a connected profile, marked started."""
        with self._conn() as c:
            row = c.execute(
                """UPDATE health.sync_requests SET started_at = now()
                   WHERE id = (SELECT r.id FROM health.sync_requests r
                               JOIN secret_garmin_tokens t ON t.user_id = r.profile_id
                               WHERE r.started_at IS NULL AND r.source = 'garmin'
                               ORDER BY r.requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                   RETURNING id, profile_id, kind, since"""
            ).fetchone()
        return {"id": row[0], "profile": row[1], "kind": row[2], "since": row[3]} if row else None

    def finish_request(self, req_id: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE health.sync_requests SET finished_at = now() WHERE id = %s", (req_id,))

    def ever_backfilled(self, profile: str) -> bool:
        """A history fetch ran or is waiting: the first one after a login is queued only once."""
        with self._conn() as c:
            row = c.execute(
                """SELECT EXISTS (SELECT 1 FROM health.sync_requests WHERE profile_id = %s AND kind = 'backfill')
                       OR EXISTS (SELECT 1 FROM health.sync_runs WHERE profile_id = %s AND kind = 'backfill')""",
                (profile, profile),
            ).fetchone()
        return bool(row and row[0])

    def set_next_run(self, profile: str, at: Any) -> None:
        with self._conn() as c:
            c.execute(
                """UPDATE health.sync_state SET cursor = cursor || jsonb_build_object('nextRunAt', %s::text)
                   WHERE profile_id = %s AND source = 'garmin'""",
                (at.isoformat(), profile),
            )

    # -- connected accounts (mirror of secret_garmin_tokens, without the secret) --
    def mirror_accounts(self) -> None:
        """Every loop tick: checked_at doubles as the loop's heartbeat (the panel spots a loop that is gone)."""
        with self._conn() as c:
            c.execute(
                """INSERT INTO health.connected_accounts (profile_id, source, connected_at)
                   SELECT t.user_id, 'garmin', t.updated_at FROM secret_garmin_tokens t
                   ON CONFLICT (profile_id, source) DO UPDATE SET checked_at = now(),
                     status = CASE WHEN health.connected_accounts.status = 'disconnected' THEN 'connected'
                                   ELSE health.connected_accounts.status END"""
            )
            c.execute(
                """UPDATE health.connected_accounts SET status = 'disconnected', checked_at = now()
                   WHERE source = 'garmin' AND status <> 'disconnected'
                     AND profile_id NOT IN (SELECT user_id FROM secret_garmin_tokens)"""
            )

    def account_status(self, profile: str, status: str, fresh_login: bool = False) -> None:
        with self._conn() as c:
            c.execute(
                f"""INSERT INTO health.connected_accounts (profile_id, source, status) VALUES (%s, 'garmin', %s)
                    ON CONFLICT (profile_id, source) DO UPDATE SET status = EXCLUDED.status
                    {", connected_at = now()" if fresh_login else ""}""",
                (profile, status),
            )

    def finish_run(self, run_id: str, status: str, detail: dict[str, Any], error: str | None = None) -> None:
        with self._conn() as c:
            c.execute(
                """UPDATE health.sync_runs SET status = %s, finished_at = now(), detail = %s, error = %s, heartbeat_at = now(),
                     progress = CASE WHEN %s = 'failed' THEN progress ELSE 1 END WHERE id = %s""",
                (status, Jsonb(detail), error, status, run_id),
            )
