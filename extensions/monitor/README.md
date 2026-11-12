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

A small background service, the collector, reads the host's `/proc` and `/sys` every 30 seconds and
writes to the `monitor` schema. It runs in the assistant's worker, which mounts them read-only, as the
extension's own user, so it cannot see other processes' environment; it never gets the Docker socket. A
nightly job drops readings older than 30 days.
Container names come from what each container runs (the assistant's own services get their compose
names).

| Host | Works | Notes |
|---|---|---|
| Linux on amd64 or arm64 (Synology, Ubuntu, Debian, Raspberry Pi OS 64-bit) | yes | cgroup v1 and v2 |
| Mac with Docker Desktop or OrbStack | yes | figures are the Linux VM's, not macOS's; the page says so |

Temperatures need sensors the kernel exposes (`/sys/class/thermal`, `/sys/class/hwmon`); some NAS
models show none.

## Starting it

Nothing to do: `ext install monitor` is enough, the assistant's worker starts the collector within
seconds (System settings -> Worker shows it, its nightly `prune` run and what it reads). Needs an
assistant from 2026-11-12 or newer (with the worker); monitor 1.0.0 ran its own container.

To see what it reads on a host without the database, on the host:
`docker compose exec worker ext-run monitor collector python -m collector once`.

## Tools for Claude

- `monitor__overview`: everything above right now, what looks wrong, and the last 24 hours in short.
- `monitor__history`: averages and peaks per bucket over `1h`, `24h`, `7d` or `30d`.

Read-only: the extension watches and changes nothing.
