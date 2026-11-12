# AGENTS.md (monitor extension)

Rules of the shell's `AGENTS.md` and `specs/002-extensions.md` apply. In short: import from the shell only
`$shell` / `$shell/ui`; the look is the shell's tokens and Beni (`specs/001-design.md`).

## How it works

- Native, scope **shared** (one machine for every profile), read-only toward the machine.
- `services/collector/` (Python, standard library plus psycopg) is the only writer. `collector/read.py`
  reads one thing each from `HOST_PROC` / `HOST_SYS` (the host's `/proc` and `/sys`, mounted read-only)
  and returns empty when a host lacks it; `collector/sample.py` turns counters into rates against the
  previous pass; `collector/store.py` writes. Tests: `cd services/collector && python -m pytest`
  (fixture trees for a Raspberry Pi with cgroup v2, a Synology box with cgroup v1, Docker Desktop).
- No Docker socket on purpose (spec 004 of the core): containers are found from `/proc/<pid>/cgroup`,
  their memory from the cgroup files, their names from what they run (`read.container_name`).
- It runs in the assistant's worker (manifest `services`: `collector`, with `host: ["proc", "sys"]`;
  `jobs`: `prune`, nightly), as the extension's own user, never root: as root it could read
  `/proc/<pid>/environ` of host processes (`drop_root()` makes it `nobody` if it is ever started as
  root). Log: `/worker/logs/monitor.collector.log`; `python -m collector once` prints one reading.
- Web: `web/lib/data.server.ts` reads, `web/lib/monitor.ts` (units, thresholds, Beni, problems,
  buckets) and `web/lib/tile.ts` are pure and tested in `monitor.test.ts`. `web/lib/Chart.svelte` draws one
  or two series over time. The page polls `/monitor/state` every 30 s.

## Data

| Table | What |
|---|---|
| `monitor.snapshot` | one row (`id` 1): the latest full reading as JSON (`data`: host, cpu, memory, temps, temp_c, throttling, disks, disk_io, net, containers, top) and `at` |
| `monitor.samples` | one row per pass: cpu_pct, load1, mem_used, mem_total, swap_used, temp_c, net_rx_bps, net_tx_bps, disk_read_bps, disk_write_bps; kept `MONITOR_KEEP_DAYS` days (the `prune` job, nightly) |

Rates are bytes per second; CPU of a container or process is a share of the whole machine (all cores =
100 %).

## Data for Claude

- `monitor__overview`: the latest reading, `problems` (worst first), `stale`, and 24-hour averages and peaks.
- `monitor__history`: buckets over `1h` / `24h` / `7d` / `30d`, with a summary per column.
- `monitor__query` for anything else, e.g. the hours with the highest temperature this week.

## Tests

`web/lib/*.test.ts` run with the core's vitest (`cd apps/web && npm test`); the collector's with pytest.
