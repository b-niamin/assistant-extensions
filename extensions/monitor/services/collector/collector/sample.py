"""One pass of the collector: read everything, turn counters into rates against the previous pass, and
return the snapshot (for the page) plus one history row. Pure apart from the readers, so it is tested
against fixture folders."""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any

from . import read


@dataclass
class State:
    """Counters of the previous pass."""
    at: float | None = None
    cpu: read.CpuTimes | None = None
    cores: list[read.CpuTimes] = field(default_factory=list)
    net: dict[str, tuple[int, int]] = field(default_factory=dict)
    io: tuple[int, int] | None = None
    procs: dict[int, read.Proc] = field(default_factory=dict)


TOP = 8


def _rate(cur: int, prev: int | None, dt: float) -> float | None:
    if prev is None or dt <= 0 or cur < prev:  # counter reset (reboot, interface re-created)
        return None
    return round((cur - prev) / dt, 1)


def take(proc: str, sys: str, disks: dict[str, str], state: State, now: float | None = None,
         ticks_per_s: int | None = None, page_size: int | None = None) -> tuple[dict[str, Any], dict[str, Any], State]:
    now = time.time() if now is None else now
    hz = ticks_per_s or os.sysconf("SC_CLK_TCK")
    dt = now - state.at if state.at else 0.0

    cpu, cores, _ = read.cpu_times(proc)
    per_core = [read.cpu_pct(p, c) for p, c in zip(state.cores, cores)] if state.cores else []
    ncores = len(cores) or 1
    mem = read.memory(proc)
    temps = read.temperatures(sys)
    main_temp = read.main_temperature(temps)

    net_now = read.net_totals(proc)
    net = []
    for name, (rx, tx) in sorted(net_now.items()):
        prev = state.net.get(name)
        net.append({"iface": name, "rx_total": rx, "tx_total": tx,
                    "rx_bps": _rate(rx, prev[0] if prev else None, dt),
                    "tx_bps": _rate(tx, prev[1] if prev else None, dt)})
    rx_bps = _sum([n["rx_bps"] for n in net])
    tx_bps = _sum([n["tx_bps"] for n in net])

    io = read.disk_io(proc, sys)
    io_rate = (None, None)
    if io and state.io:
        io_rate = (_rate(io[0], state.io[0], dt), _rate(io[1], state.io[1], dt))

    procs = read.processes(proc, page_size)
    # CPU of a process: share of the whole machine (all cores = 100 %), like the CPU figure above it.
    budget = dt * hz * ncores

    def share(ticks: int, prev: int | None) -> float | None:
        if prev is None or budget <= 0 or ticks < prev:
            return None
        return round(min(100.0, 100.0 * (ticks - prev) / budget), 1)

    top = []
    for p in procs.values():
        prev = state.procs.get(p.pid)
        pct = share(p.cpu_ticks, prev.cpu_ticks if prev and prev.name == p.name else None)
        top.append({"pid": p.pid, "name": p.name, "cpu_pct": pct, "mem": p.rss, "container": p.container})
    by_cpu = sorted(top, key=lambda r: (r["cpu_pct"] or 0, r["mem"]), reverse=True)[:TOP]

    groups: dict[str, list[read.Proc]] = {}
    for p in procs.values():
        if p.container:
            groups.setdefault(p.container, []).append(p)
    names = {cid: read.container_name(ps) for cid, ps in groups.items()}
    containers = []
    for cid, ps in groups.items():
        # Sum over the processes alive in both passes, so one that started or ended does not skew it.
        both = [(p.cpu_ticks, state.procs[p.pid].cpu_ticks) for p in ps
                if p.pid in state.procs and state.procs[p.pid].name == p.name]
        pct = share(sum(c for c, _ in both), sum(q for _, q in both)) if state.procs else None
        use = read.cgroup_usage(sys, cid)
        containers.append({"id": cid[:12], "name": names[cid], "cpu_pct": pct,
                           "mem": use["mem"] if use else sum(p.rss for p in ps),
                           "mem_limit": use["limit"] if use else None, "processes": len(ps)})
    containers.sort(key=lambda c: c["name"])
    for r in by_cpu:
        r["container"] = names.get(r["container"]) if r["container"] else None

    snapshot = {
        "host": read.host_info(proc, sys),
        "uptime_s": read.uptime_s(proc),
        "interval_s": round(dt) if dt else None,
        "cpu": {"pct": read.cpu_pct(state.cpu, cpu), "per_core": per_core, "load": read.loadavg(proc),
                "mhz": read.cpu_mhz(sys)},
        "memory": mem,
        "temps": temps,
        "temp_c": main_temp,
        "throttling": read.throttling(sys),
        "disks": read.disk_usage(disks, proc),
        "disk_io": {"read_bps": io_rate[0], "write_bps": io_rate[1]},
        "net": net,
        "containers": containers,
        "top": by_cpu,
    }
    load = snapshot["cpu"]["load"] or [None, None, None]
    sample = {
        "cpu_pct": snapshot["cpu"]["pct"],
        "load1": load[0],
        "mem_used": mem["used"] if mem else None,
        "mem_total": mem["total"] if mem else None,
        "swap_used": mem["swap_used"] if mem else None,
        "temp_c": main_temp,
        "net_rx_bps": rx_bps,
        "net_tx_bps": tx_bps,
        "disk_read_bps": io_rate[0],
        "disk_write_bps": io_rate[1],
    }
    return snapshot, sample, State(at=now, cpu=cpu, cores=cores, net=net_now, io=io, procs=procs)


def _sum(vals: list[float | None]) -> float | None:
    real = [v for v in vals if v is not None]
    return round(sum(real), 1) if real else None
