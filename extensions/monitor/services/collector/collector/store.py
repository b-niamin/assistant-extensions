"""Writes into schema `monitor` (role ext_monitor_svc). Every statement is parameterised."""
from __future__ import annotations

from typing import Any

import psycopg
from beni import connect
from psycopg.types.json import Jsonb

SAMPLE_COLS = ("cpu_pct", "load1", "mem_used", "mem_total", "swap_used", "temp_c",
               "net_rx_bps", "net_tx_bps", "disk_read_bps", "disk_write_bps")


class Store:
    def __init__(self) -> None:
        self._c: psycopg.Connection | None = None

    def _conn(self) -> psycopg.Connection:
        # One connection for the life of the process; reopened after the database restarts.
        if self._c is None or self._c.closed:
            self._c = connect()
        return self._c

    def write(self, snapshot: dict[str, Any], sample: dict[str, Any] | None) -> None:
        try:
            self._write(snapshot, sample)
        except psycopg.OperationalError:
            self._c = None
            self._write(snapshot, sample)

    def _write(self, snapshot: dict[str, Any], sample: dict[str, Any] | None) -> None:
        c = self._conn()
        with c.transaction():
            c.execute(
                """INSERT INTO monitor.snapshot (id, at, data) VALUES (1, now(), %s)
                   ON CONFLICT (id) DO UPDATE SET at = EXCLUDED.at, data = EXCLUDED.data""",
                (Jsonb(snapshot),),
            )
            if sample is not None:
                cols = ", ".join(SAMPLE_COLS)
                ph = ", ".join(["%s"] * len(SAMPLE_COLS))
                c.execute(f"INSERT INTO monitor.samples (at, {cols}) VALUES (now(), {ph})",
                          tuple(sample.get(k) for k in SAMPLE_COLS))

    def prune(self, keep_days: int) -> int:
        cur = self._conn().execute("DELETE FROM monitor.samples WHERE at < now() - make_interval(days => %s)",
                                   (keep_days,))
        return cur.rowcount
