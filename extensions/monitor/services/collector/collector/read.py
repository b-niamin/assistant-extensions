"""Readings of the machine the stack runs on, from its /proc and /sys (mounted read-only at HOST_PROC and
HOST_SYS). Standard library only, Linux only: on a Mac, Docker runs in a Linux VM and these are the VM's.

Every reader takes the root it reads from, so tests point them at a folder of fixtures. A reading that a
host does not offer (no sensors, no permission, cgroup v1 vs v2) comes back empty, never as an error.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any


def _read(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def _int(text: str | None) -> int | None:
    try:
        return int(text.strip()) if text is not None else None
    except ValueError:
        return None


# -- CPU, load, uptime --------------------------------------------------------------------------------

@dataclass
class CpuTimes:
    """Jiffies from one line of /proc/stat."""
    busy: int
    total: int


def cpu_times(proc: str) -> tuple[CpuTimes | None, list[CpuTimes], int | None]:
    """(all CPUs, per core, boot time as a unix timestamp)."""
    text = _read(f"{proc}/stat") or ""
    total: CpuTimes | None = None
    cores: list[CpuTimes] = []
    btime = None
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0].startswith("cpu"):
            vals = [int(v) for v in parts[1:9]] + [0] * max(0, 8 - len(parts[1:9]))
            # user nice system idle iowait irq softirq steal; guest time is already inside user/nice.
            idle = vals[3] + vals[4]
            t = CpuTimes(busy=sum(vals) - idle, total=sum(vals))
            if parts[0] == "cpu":
                total = t
            else:
                cores.append(t)
        elif parts[0] == "btime":
            btime = int(parts[1])
    return total, cores, btime


def cpu_pct(prev: CpuTimes | None, cur: CpuTimes | None) -> float | None:
    if prev is None or cur is None:
        return None
    dt = cur.total - prev.total
    if dt <= 0:
        return None
    return round(max(0.0, min(100.0, 100.0 * (cur.busy - prev.busy) / dt)), 1)


def loadavg(proc: str) -> list[float] | None:
    text = _read(f"{proc}/loadavg")
    if not text:
        return None
    try:
        return [float(v) for v in text.split()[:3]]
    except ValueError:
        return None


def uptime_s(proc: str) -> int | None:
    text = _read(f"{proc}/uptime")
    try:
        return int(float(text.split()[0])) if text else None
    except (ValueError, IndexError):
        return None


def cpu_model(proc: str) -> str | None:
    text = _read(f"{proc}/cpuinfo") or ""
    for key in ("model name", "Model", "Hardware", "cpu model"):
        m = re.search(rf"^{key}\s*:\s*(.+)$", text, re.M)
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip()
    return None


def cpu_mhz(sys: str) -> float | None:
    """Current clock of core 0, when cpufreq is exposed (Raspberry Pi, most PCs)."""
    khz = _int(_read(f"{sys}/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"))
    return round(khz / 1000) if khz else None


# -- memory -------------------------------------------------------------------------------------------

def memory(proc: str) -> dict[str, int] | None:
    text = _read(f"{proc}/meminfo")
    if not text:
        return None
    kb: dict[str, int] = {}
    for line in text.splitlines():
        m = re.match(r"(\w+(?:\(\w+\))?):\s+(\d+)", line)
        if m:
            kb[m.group(1)] = int(m.group(2)) * 1024
    total = kb.get("MemTotal")
    if not total:
        return None
    available = kb.get("MemAvailable")
    if available is None:  # kernels before 3.14
        available = kb.get("MemFree", 0) + kb.get("Buffers", 0) + kb.get("Cached", 0)
    return {
        "total": total,
        "available": available,
        "used": total - available,
        "cached": kb.get("Cached", 0) + kb.get("Buffers", 0),
        "swap_total": kb.get("SwapTotal", 0),
        "swap_used": kb.get("SwapTotal", 0) - kb.get("SwapFree", 0),
    }


# -- temperatures -------------------------------------------------------------------------------------

# Sensors that stand for "the CPU", best first. Matched against "<chip> <label>" in lower case.
_CPU_SENSORS = ("x86_pkg_temp", "package id 0", "tctl", "tdie", "cpu-thermal", "cpu_thermal", "soc_thermal",
                "cpu", "coretemp", "k10temp", "soc")


def temperatures(sys: str) -> list[dict[str, Any]]:
    """Every readable sensor in °C: thermal zones and hwmon chips, de-duplicated by name and value."""
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, float]] = set()

    def add(name: str, milli: int | None) -> None:
        if milli is None or milli <= -40_000 or milli >= 150_000 or milli == 0:
            return
        c = round(milli / 1000, 1)
        key = (name.lower(), c)
        if key in seen:
            return
        seen.add(key)
        out.append({"name": name, "c": c})

    tz = f"{sys}/class/thermal"
    for d in sorted(_listdir(tz)):
        if d.startswith("thermal_zone"):
            name = (_read(f"{tz}/{d}/type") or d).strip()
            add(name, _int(_read(f"{tz}/{d}/temp")))
    hw = f"{sys}/class/hwmon"
    for d in sorted(_listdir(hw)):
        chip = (_read(f"{hw}/{d}/name") or d).strip()
        base = f"{hw}/{d}"
        if not os.path.exists(f"{base}/temp1_input") and os.path.exists(f"{base}/device/temp1_input"):
            base = f"{base}/device"  # older kernels keep the files one level down
        for f in sorted(_listdir(base)):
            m = re.fullmatch(r"temp(\d+)_input", f)
            if not m:
                continue
            label = (_read(f"{base}/temp{m.group(1)}_label") or "").strip()
            add(f"{chip} {label}".strip() if label else chip, _int(_read(f"{base}/{f}")))
    return out


def main_temperature(temps: list[dict[str, Any]]) -> float | None:
    """The CPU's temperature when a sensor says so, else the hottest one."""
    if not temps:
        return None
    for key in _CPU_SENSORS:
        hits = [t["c"] for t in temps if key in t["name"].lower()]
        if hits:
            return max(hits)
    return max(t["c"] for t in temps)


def throttling(sys: str) -> dict[str, bool] | None:
    """Raspberry Pi firmware flags: under-voltage and throttling, now and since boot. None elsewhere."""
    for p in ("devices/platform/soc/soc:firmware/get_throttled", "devices/platform/soc:firmware/get_throttled"):
        text = _read(f"{sys}/{p}")
        if text is None:
            continue
        try:
            v = int(text.strip(), 16)
        except ValueError:
            return None
        return {
            "under_voltage": bool(v & 0x1),
            "throttled": bool(v & 0x4),
            "under_voltage_since_boot": bool(v & 0x10000),
            "throttled_since_boot": bool(v & 0x40000),
        }
    return None


# -- disks --------------------------------------------------------------------------------------------

def mountinfo(path: str) -> list[dict[str, str]]:
    rows = []
    for line in (_read(path) or "").splitlines():
        parts = line.split()
        if " - " not in line or len(parts) < 10:
            continue
        sep = parts.index("-")
        rows.append({"dev": parts[2], "root": _unescape(parts[3]), "mount": _unescape(parts[4]),
                     "fstype": parts[sep + 1], "source": parts[sep + 2]})
    return rows


def _unescape(s: str) -> str:
    return re.sub(r"\\(\d{3})", lambda m: chr(int(m.group(1), 8)), s)


def disk_usage(paths: dict[str, str], proc: str) -> list[dict[str, Any]]:
    """Size and use of the filesystems behind `paths` ({label: path in this container}), one row per
    filesystem. `mount` is where the machine itself mounts it (/volume1, /), from pid 1's mountinfo."""
    own = mountinfo("/proc/self/mountinfo")
    host = mountinfo(f"{proc}/1/mountinfo")
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for label, path in paths.items():
        try:
            st = os.statvfs(path)
            dev = os.stat(path).st_dev
        except OSError:
            continue
        if dev in seen:
            continue
        seen.add(dev)
        major_minor = f"{os.major(dev)}:{os.minor(dev)}"
        mine = _longest_mount(own, path)
        host_mount = None
        cands = [m for m in host if m["dev"] == major_minor and m["root"] == "/"]
        if cands:
            host_mount = min((m["mount"] for m in cands), key=len)
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        out.append({
            "label": label,
            "mount": host_mount,
            "fstype": mine["fstype"] if mine else None,
            "total": total,
            "used": total - st.f_bfree * st.f_frsize,
            "free": free,
        })
    return out


def _longest_mount(rows: list[dict[str, str]], path: str) -> dict[str, str] | None:
    best = None
    for m in rows:
        mp = m["mount"].rstrip("/") or "/"
        if path == mp or path.startswith(mp.rstrip("/") + "/") or mp == "/":
            if best is None or len(mp) > len(best["mount"]):
                best = m
    return best


_SKIP_BLOCK = re.compile(r"^(loop|ram|zram|dm-|md|nbd|sr|fd|synoboot)")


def disk_io(proc: str, sys: str) -> tuple[int, int] | None:
    """Bytes read and written since boot by the physical disks (whole devices, not partitions)."""
    text = _read(f"{proc}/diskstats")
    if not text:
        return None
    whole = set(_listdir(f"{sys}/block"))
    rd = wr = 0
    any_disk = False
    for line in text.splitlines():
        p = line.split()
        if len(p) < 10:
            continue
        name = p[2]
        if _SKIP_BLOCK.match(name) or (whole and name not in whole):
            continue
        any_disk = True
        rd += int(p[5]) * 512
        wr += int(p[9]) * 512
    return (rd, wr) if any_disk else None


# -- network ------------------------------------------------------------------------------------------

_SKIP_NET = re.compile(r"^(lo$|veth|docker|br-|virbr|cni|flannel|cali|vxlan|tun\d|dummy|ifb|sit\d|ip6tnl|gre)")


def net_totals(proc: str) -> dict[str, tuple[int, int]]:
    """{interface: (bytes received, bytes sent)} of the machine's network (pid 1's namespace)."""
    out: dict[str, tuple[int, int]] = {}
    for line in (_read(f"{proc}/1/net/dev") or "").splitlines()[2:]:
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        name = name.strip()
        p = rest.split()
        if _SKIP_NET.match(name) or len(p) < 9 or (p[0] == "0" and p[8] == "0"):
            continue
        out[name] = (int(p[0]), int(p[8]))
    return out


# -- processes and containers -------------------------------------------------------------------------

_CONTAINER_ID = re.compile(r"(?:docker[-/]|/libpod-|containerd/)([0-9a-f]{64})")


@dataclass
class Proc:
    pid: int
    name: str
    cmd: str
    cpu_ticks: int
    rss: int
    container: str | None


@dataclass
class ProcSample:
    procs: dict[int, Proc] = field(default_factory=dict)


def processes(proc: str, page_size: int | None = None) -> dict[int, Proc]:
    page = page_size or os.sysconf("SC_PAGE_SIZE")
    out: dict[int, Proc] = {}
    for d in _listdir(proc):
        if not d.isdigit():
            continue
        stat = _read(f"{proc}/{d}/stat")
        if not stat:
            continue
        # The name sits in parentheses and may itself contain spaces or ")".
        try:
            name = stat[stat.index("(") + 1: stat.rindex(")")]
            rest = stat[stat.rindex(")") + 2:].split()
            ticks = int(rest[11]) + int(rest[12])  # utime + stime
            rss = int(rest[21]) * page
        except (ValueError, IndexError):
            continue
        if rss == 0:  # kernel threads
            continue
        raw = _read(f"{proc}/{d}/cmdline") or ""
        cmd = " ".join(raw.split("\0")).strip()
        m = _CONTAINER_ID.search(_read(f"{proc}/{d}/cgroup") or "")
        # A runtime's thread name (node's MainThread) or a version as the name says nothing.
        if name.endswith("MainThread") or name[:1].isdigit():
            name = program(cmd) or name
        out[int(d)] = Proc(int(d), name, cmd, ticks, rss, m.group(1) if m else None)
    return out


def container_name(procs: list[Proc]) -> str:
    """A readable name for a container without the Docker API (no socket here, on purpose): what its
    first process runs. Our own stack's services get their compose names."""
    first = min(procs, key=lambda p: p.pid)
    cmds = " ".join(p.cmd for p in sorted(procs, key=lambda p: p.pid)[:4])
    known = [
        ("live-reload.mjs", "web"), ("watch-extensions.sh", "ext-migrate"), ("backup.sh", "backup"),
        ("-m sync", "garmin-sync"), ("-m collector", "monitor-collector"), ("ttyd", "terminal"),
        ("chromium", "browser"), ("postgres", "db"),
    ]
    for needle, name in known:
        if needle in cmds:
            return name
    return program(first.cmd) or first.name


_INITS = {"tini", "docker-init", "dumb-init", "catatonit"}
_INTERPRETERS = re.compile(r"^(node|nodejs|bun|deno|python[\d.]*|java|ruby|php[\d.]*|perl|sh|bash)$")
_GENERIC = {"index", "main", "app", "server", "start", "run", "cli", "dist", "src", "build", "lib", "bin", ""}


def program(cmd: str) -> str | None:
    """What a command line runs, readably: past an init wrapper (tini -- x), the script or module an
    interpreter runs (node /usr/local/bin/firebase -> firebase, java -jar elasticmq-server.jar ->
    elasticmq-server), the script of `npm run x`, the folder of a binary named by its version, and
    without a process title's colon (nginx: master)."""
    args = [a for a in cmd.split(" ") if a]
    while args and os.path.basename(args[0]) in _INITS:
        args = args[1:]
        while args and args[0].startswith("-"):
            args = args[1:]
    if not args:
        return None
    head = os.path.basename(args[0]).rstrip(":")
    if head[:1].isdigit():  # a binary named by its version (…/claude/versions/2.1.309) -> its folder
        folders = [f for f in args[0].split("/")[:-1] if f and f not in ("versions", "releases")]
        head = folders[-1] if folders else head
    if not _INTERPRETERS.match(head):
        return head or None
    rest = args[1:]
    if head == "java":
        if "-jar" in rest and rest.index("-jar") + 1 < len(rest):
            return _stem(rest[rest.index("-jar") + 1]) or head
        classes = [a for a in rest if not a.startswith("-") and "/" not in a and "." in a]
        return classes[0].rsplit(".", 1)[-1] if classes else head
    i = 0
    while i < len(rest) and rest[i].startswith("-"):
        if rest[i] == "-m" and i + 1 < len(rest):
            return rest[i + 1]
        i += 1
    if i == len(rest):
        return head
    script = rest[i]
    name = _stem(script)
    if name in ("npm", "pnpm", "yarn") and i + 2 < len(rest) and rest[i + 1] == "run":
        return rest[i + 2]
    # dist/index.js says nothing; its folder may (…/opensearch-dashboards/src/cli/dist -> cli)
    parts = [p for p in script.split("/")[:-1] if p not in (".", "..")]
    while name in _GENERIC and parts:
        name = parts.pop()
    return head if name in _GENERIC else name


def _stem(path: str) -> str:
    return re.sub(r"\.(js|mjs|cjs|ts|py|jar|rb|php|pl|sh)$", "", os.path.basename(path))


def cgroup_usage(sys: str, cid: str) -> dict[str, int] | None:
    """Memory in use (as `docker stats` counts it: without inactive page cache) and its limit, from
    cgroup v2 or v1, whichever the host has."""
    cg = f"{sys}/fs/cgroup"
    for d in (f"{cg}/system.slice/docker-{cid}.scope", f"{cg}/docker/{cid}"):  # v2: systemd or cgroupfs
        cur = _int(_read(f"{d}/memory.current"))
        if cur is not None:
            stat = _kv(_read(f"{d}/memory.stat"))
            limit = _read(f"{d}/memory.max")
            return {"mem": max(0, cur - stat.get("inactive_file", 0)),
                    "limit": _int(limit) if limit and limit.strip() != "max" else None}
    for d in (f"{cg}/memory/docker/{cid}", f"{cg}/memory/system.slice/docker-{cid}.scope"):  # v1
        cur = _int(_read(f"{d}/memory.usage_in_bytes"))
        if cur is not None:
            stat = _kv(_read(f"{d}/memory.stat"))
            limit = _int(_read(f"{d}/memory.limit_in_bytes"))
            return {"mem": max(0, cur - stat.get("total_inactive_file", 0)),
                    "limit": limit if limit and limit < 1 << 60 else None}
    return None


def _kv(text: str | None) -> dict[str, int]:
    out = {}
    for line in (text or "").splitlines():
        p = line.split()
        if len(p) == 2 and p[1].isdigit():
            out[p[0]] = int(p[1])
    return out


# -- the machine --------------------------------------------------------------------------------------

def host_info(proc: str, sys: str) -> dict[str, Any]:
    version = (_read(f"{proc}/version") or "").strip()
    kernel = version.split()[2] if len(version.split()) > 2 else None
    low = version.lower()
    vm = "docker-desktop" if "linuxkit" in low else "orbstack" if "orbstack" in low else None
    model = None
    for p in (f"{sys}/firmware/devicetree/base/model", f"{proc}/device-tree/model"):
        model = (_read(p) or "").replace("\0", "").strip() or None
        if model:
            break
    if not model:
        syno = (_read(f"{proc}/sys/kernel/syno_hw_version") or "").strip()
        if syno:
            model = f"Synology {syno}"
    if not model:
        vendor = (_read(f"{sys}/class/dmi/id/sys_vendor") or "").strip()
        product = (_read(f"{sys}/class/dmi/id/product_name") or "").strip()
        junk = {"", "to be filled by o.e.m.", "system product name", "default string", "none"}
        if product.lower() not in junk:
            model = f"{vendor} {product}".strip() if vendor.lower() not in junk and vendor not in product else product
    _, cores, btime = cpu_times(proc)
    return {
        "hostname": (_read("/proc/sys/kernel/hostname") or "").strip() or None,
        "model": model,
        "cpu": cpu_model(proc),
        "cores": len(cores) or os.cpu_count(),
        "arch": os.uname().machine,
        "kernel": kernel,
        "vm": vm,
        "boot_time": btime,
    }


def _listdir(path: str) -> list[str]:
    try:
        return os.listdir(path)
    except OSError:
        return []
