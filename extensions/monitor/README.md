# System monitor

How the machine that runs the assistant is doing, whatever it is: a NAS, a mini PC, a Raspberry Pi or a
Mac. One page, one dashboard tile, two tools for Claude.

- **Now**: CPU (per core, load average), memory and swap, temperature (the CPU's sensor, every other one
  on request), network and disk throughput, how long it has been up.
- **Storage**: the disk holding the assistant's files and the one holding Docker's data, with free space.
- **History**: CPU, memory, temperature, network or disk activity over 1 hour, 24 hours, 7 or 30 days,
  with a table view.
- **Containers** and the **busiest processes**: CPU and memory of each, so a runaway sync or a heavy
  browser tab is easy to spot.
- **Warnings**: running hot, a disk filling up, memory or CPU pegged, and on a Raspberry Pi a weak power
  supply or throttling.

Beni wears a wrench and keeps an eye on it: calm when all is fine, tired when something struggles or the
readings stop.

## How it reads the machine

A small background service, `monitor-collector` (`compose.yml`), reads the host's `/proc` and `/sys`,
mounted read-only, every 30 seconds and writes to the `monitor` schema. It never gets the Docker socket
and drops to user `nobody` before reading anything, so it cannot see other processes' environment.
Container names come from what each container runs (the assistant's own services get their compose
names).

| Host | Works | Notes |
|---|---|---|
| Linux on amd64 or arm64 (Synology, Ubuntu, Debian, Raspberry Pi OS 64-bit) | yes | cgroup v1 and v2 |
| Mac with Docker Desktop or OrbStack | yes | figures are the Linux VM's, not macOS's; the page says so |

Temperatures need sensors the kernel exposes (`/sys/class/thermal`, `/sys/class/hwmon`); some NAS
models show none.

## Starting it

The service joins the stack once, on the machine, in the assistant folder:

```sh
sudo ./beni.sh install
```

On Synology, then rebuild the project in Container Manager. Optional `.env` values:
`MONITOR_INTERVAL_SECONDS` (30) and `MONITOR_KEEP_DAYS` (30). Log: `/logs/monitor-collector.log`.

To see what it reads on a host without the database:
`docker compose run --rm monitor-collector python -m collector once`.

## Tools for Claude

- `monitor__overview`: everything above right now, what looks wrong, and the last 24 hours in short.
- `monitor__history`: averages and peaks per bucket over `1h`, `24h`, `7d` or `30d`.

Read-only: the extension watches and changes nothing.
