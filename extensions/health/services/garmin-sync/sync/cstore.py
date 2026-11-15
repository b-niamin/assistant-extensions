"""Database side of the connectors (Strava, Withings, the outbox). Every statement is parameterised."""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

import psycopg
from psycopg.types.json import Jsonb


class ConnectorStore:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def _conn(self) -> psycopg.Connection:
        return psycopg.connect(self._dsn, autocommit=True)

    # -- OAuth sign-in in progress ---------------------------------------------
    def add_pending(self, state: str, profile: str, provider: str, redirect_uri: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM health.oauth_pending WHERE created_at < now() - interval '1 day'")
            c.execute(
                "INSERT INTO health.oauth_pending (state, profile_id, provider, redirect_uri) VALUES (%s, %s, %s, %s)",
                (state, profile, provider, redirect_uri),
            )

    def pending(self, state: str) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT code, error, redirect_uri FROM health.oauth_pending WHERE state = %s", (state,)
            ).fetchone()
        return {"code": row[0], "error": row[1], "redirect_uri": row[2]} if row else None

    def drop_pending(self, state: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM health.oauth_pending WHERE state = %s", (state,))

    # -- accounts (mirror for the web app, which cannot read secret_oauth) -----
    def account(self, profile: str, source: str, status: str, fresh: bool = False) -> None:
        with self._conn() as c:
            c.execute(
                f"""INSERT INTO health.connected_accounts (profile_id, source, status) VALUES (%s, %s, %s)
                    ON CONFLICT (profile_id, source) DO UPDATE SET status = EXCLUDED.status, checked_at = now()
                    {", connected_at = now()" if fresh else ""}""",
                (profile, source, status),
            )

    # -- options -----------------------------------------------------------------
    def option(self, profile: str, key: str, default: Any = None) -> Any:
        with self._conn() as c:
            row = c.execute("SELECT value FROM health.connector_options WHERE profile_id = %s AND key = %s", (profile, key)).fetchone()
        return row[0] if row else default

    # -- cursors (health.sync_state, one row per source) ------------------------
    def cursor(self, profile: str, source: str) -> dict[str, Any]:
        with self._conn() as c:
            row = c.execute("SELECT cursor FROM health.sync_state WHERE profile_id = %s AND source = %s", (profile, source)).fetchone()
        return dict(row[0]) if row else {}

    def set_cursor(self, profile: str, source: str, cursor: dict[str, Any]) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO health.sync_state (profile_id, source, cursor, last_sync_at) VALUES (%s, %s, %s, now())
                   ON CONFLICT (profile_id, source) DO UPDATE SET cursor = EXCLUDED.cursor, last_sync_at = now()""",
                (profile, source, Jsonb(cursor)),
            )

    # -- requests from the panel ("Sync now" on a Strava or Withings card) -----
    def claim_request(self, sources: tuple[str, ...]) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute(
                """UPDATE health.sync_requests SET started_at = now()
                   WHERE id = (SELECT id FROM health.sync_requests WHERE started_at IS NULL AND source = ANY(%s)
                               ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                   RETURNING id, profile_id, source""",
                (list(sources),),
            ).fetchone()
        return {"id": row[0], "profile": row[1], "source": row[2]} if row else None

    def finish_request(self, req_id: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE health.sync_requests SET finished_at = now() WHERE id = %s", (req_id,))

    # -- Strava ------------------------------------------------------------------
    def garmin_starts(self, profile: str, since: _dt.datetime) -> list[tuple[str, _dt.datetime]]:
        with self._conn() as c:
            return [(r[0], r[1]) for r in c.execute(
                "SELECT activity_id, start_time FROM health.synced_activities WHERE profile_id = %s AND start_time >= %s",
                (profile, since - _dt.timedelta(days=1)),
            )]

    def put_strava(self, profile: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        with self._conn() as c, c.cursor() as cur:
            cur.executemany(
                """INSERT INTO health.synced_strava_activities
                     (profile_id, strava_id, name, description, sport, start_time, distance_m, duration_s, garmin_activity_id, raw)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (profile_id, strava_id) DO UPDATE SET
                     name = EXCLUDED.name, description = COALESCE(EXCLUDED.description, health.synced_strava_activities.description),
                     sport = EXCLUDED.sport, start_time = EXCLUDED.start_time, distance_m = EXCLUDED.distance_m,
                     duration_s = EXCLUDED.duration_s,
                     garmin_activity_id = COALESCE(EXCLUDED.garmin_activity_id, health.synced_strava_activities.garmin_activity_id),
                     raw = EXCLUDED.raw, synced_at = now()""",
                [(profile, r["strava_id"], r["name"], r["description"], r["sport"], r["start_time"], r["distance_m"],
                  r["duration_s"], r.get("garmin_activity_id"), Jsonb(r["raw"])) for r in rows],
            )

    def unlinked_strava(self, profile: str) -> list[dict[str, Any]]:
        """Strava activities without a Garmin link yet (Garmin may have synced after Strava)."""
        with self._conn() as c:
            rows = c.execute(
                """SELECT strava_id, start_time FROM health.synced_strava_activities
                   WHERE profile_id = %s AND garmin_activity_id IS NULL AND start_time > now() - interval '60 days'""",
                (profile,),
            ).fetchall()
        return [{"strava_id": r[0], "start_time": r[1]} for r in rows]

    def set_strava_link(self, profile: str, strava_id: str, garmin_id: str) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE health.synced_strava_activities SET garmin_activity_id = %s WHERE profile_id = %s AND strava_id = %s",
                (garmin_id, profile, strava_id),
            )

    def strava_edited(self, profile: str, strava_id: str, title: str | None, description: str | None) -> None:
        with self._conn() as c:
            c.execute(
                """UPDATE health.synced_strava_activities SET name = COALESCE(%s, name), description = COALESCE(%s, description)
                   WHERE profile_id = %s AND strava_id = %s""",
                (title, description, profile, strava_id),
            )

    def garmin_edited(self, profile: str, activity_id: str, title: str | None, description: str | None) -> None:
        with self._conn() as c:
            c.execute(
                """UPDATE health.synced_activities SET name = COALESCE(%s, name),
                     raw = CASE WHEN %s::text IS NULL THEN raw ELSE jsonb_set(COALESCE(raw, '{}'::jsonb), '{description}', to_jsonb(%s::text)) END
                   WHERE profile_id = %s AND activity_id = %s""",
                (title, description, description, profile, activity_id),
            )

    # -- Withings ------------------------------------------------------------------
    def put_weights(self, profile: str, source: str, points: list[dict[str, Any]]) -> None:
        if not points:
            return
        with self._conn() as c, c.cursor() as cur:
            cur.executemany(
                """INSERT INTO health.synced_weight (profile_id, day, source, weight_kg, raw) VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (profile_id, day, source) DO UPDATE SET weight_kg = EXCLUDED.weight_kg, raw = EXCLUDED.raw, synced_at = now()""",
                [(profile, p["day"], source, p["weight_kg"], Jsonb(p["raw"])) for p in points],
            )

    def garmin_weight_days(self, profile: str, days: list[str]) -> dict[str, float]:
        if not days:
            return {}
        with self._conn() as c:
            return {str(r[0]): float(r[1]) for r in c.execute(
                "SELECT day, weight_kg FROM health.synced_weight WHERE profile_id = %s AND source = 'garmin' AND day = ANY(%s::date[])",
                (profile, days),
            )}

    # -- outbox ------------------------------------------------------------------
    def queue(self, profile: str, target: str, op: str, payload: dict[str, Any], by: str = "service") -> str:
        oid = uuid.uuid4().hex
        with self._conn() as c:
            c.execute(
                "INSERT INTO health.outbox (id, profile_id, target, op, payload, requested_by) VALUES (%s, %s, %s, %s, %s, %s)",
                (oid, profile, target, op, Jsonb(payload), by),
            )
        return oid

    def claim_outbox(self) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute(
                """UPDATE health.outbox SET state = 'running', started_at = now()
                   WHERE id = (SELECT id FROM health.outbox WHERE state = 'queued' ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                   RETURNING id, profile_id, target, op, payload"""
            ).fetchone()
        return {"id": row[0], "profile": row[1], "target": row[2], "op": row[3], "payload": row[4]} if row else None

    def finish_outbox(self, oid: str, state: str, result: dict[str, Any] | None, error: str | None) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE health.outbox SET state = %s, result = %s, error = %s, finished_at = now() WHERE id = %s",
                (state, Jsonb(result) if result is not None else None, error, oid),
            )

    def requeue_interrupted(self) -> None:
        """At start nothing runs: a write cut off mid-way is tried again (they are all safe to repeat)."""
        with self._conn() as c:
            c.execute("UPDATE health.outbox SET state = 'queued', started_at = NULL WHERE state = 'running'")

    # -- workouts this app put on Garmin -------------------------------------------
    def pushed(self, profile: str, ref: str) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT garmin_workout_id, schedule_id FROM health.pushed_workouts WHERE profile_id = %s AND ref = %s", (profile, ref)
            ).fetchone()
        return {"garmin_workout_id": row[0], "schedule_id": row[1]} if row else None

    def set_pushed(self, profile: str, ref: str, row: dict[str, Any]) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO health.pushed_workouts (profile_id, ref, garmin_workout_id, schedule_id, day, title, sport)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (profile_id, ref) DO UPDATE SET garmin_workout_id = EXCLUDED.garmin_workout_id,
                     schedule_id = EXCLUDED.schedule_id, day = EXCLUDED.day, title = EXCLUDED.title, sport = EXCLUDED.sport, updated_at = now()""",
                (profile, ref, row.get("garmin_workout_id"), row.get("schedule_id"), row.get("day"), row.get("title"), row.get("sport")),
            )

    def drop_pushed(self, profile: str, ref: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM health.pushed_workouts WHERE profile_id = %s AND ref = %s", (profile, ref))
