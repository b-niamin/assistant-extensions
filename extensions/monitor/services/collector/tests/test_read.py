"""The readers and one sampling pass against fake /proc and /sys trees: a Raspberry Pi with cgroup v2,
a Synology-like box with cgroup v1, and Docker Desktop's VM on a Mac."""
from __future__ import annotations

import os
import tempfile
import unittest

from collector import read, sample

C1 = "a" * 64
C2 = "b" * 64


def tree(files: dict[str, str]) -> str:
    root = tempfile.mkdtemp(prefix="monitor-test-")
    for rel, text in files.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(text)
    return root


def stat_line(pid: int, name: str, utime: int, stime: int, rss_pages: int) -> str:
    # pid (comm) state ppid pgrp session tty tpgid flags minflt cminflt majflt cmajflt utime stime ... rss(24th)
    fields = ["S", "1", "1", "1", "0", "-1", "0", "0", "0", "0", "0", str(utime), str(stime),
              "0", "0", "20", "0", "1", "0", "100", "1000", str(rss_pages)]
    return f"{pid} ({name}) " + " ".join(fields) + "\n"


def pi(cpu: tuple[int, int], ticks: dict[int, int]) -> dict[str, str]:
    """A Raspberry Pi 5 with 4 cores; cpu = (busy, idle) jiffies of each core."""
    busy, idle = cpu
    core = f"{busy} 0 0 {idle} 0 0 0 0 0 0"
    files = {
        "proc/stat": f"cpu  {busy * 4} 0 0 {idle * 4} 0 0 0 0 0 0\n" + "".join(f"cpu{i} {core}\n" for i in range(4)) + "btime 1700000000\n",
        "proc/meminfo": "MemTotal:        8000000 kB\nMemFree:  1000000 kB\nMemAvailable:    6000000 kB\nBuffers: 100 kB\nCached:  2000000 kB\nSwapTotal: 1000 kB\nSwapFree: 400 kB\n",
        "proc/loadavg": "0.52 0.40 0.31 1/300 4000\n",
        "proc/uptime": "93784.12 300000.00\n",
        "proc/version": "Linux version 6.6.51+rpt-rpi-2712 (serge@raspberrypi.com) #1 SMP PREEMPT\n",
        "proc/cpuinfo": "processor\t: 0\nBogoMIPS\t: 108.00\nModel\t\t: Raspberry Pi 5 Model B Rev 1.0\n",
        "proc/diskstats": "   1       0 ram0 0 0 0 0 0 0 0 0 0 0 0\n 259       0 nvme0n1 100 0 2000 0 50 0 4000 0 0 0 0\n 259       1 nvme0n1p1 10 0 200 0 5 0 400 0 0 0 0\n",
        "proc/1/net/dev": "Inter-|   Receive\n face |bytes    packets errs drop fifo frame compressed multicast|bytes\n"
                          "    lo: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0\n"
                          "  eth0: 1000000 0 0 0 0 0 0 0 500000 0 0 0 0 0 0 0\n"
                          "veth12: 5 0 0 0 0 0 0 0 5 0 0 0 0 0 0 0\n",
        "sys/block/nvme0n1/size": "1",
        "sys/firmware/devicetree/base/model": "Raspberry Pi 5 Model B Rev 1.0\0",
        "sys/class/thermal/thermal_zone0/type": "cpu-thermal\n",
        "sys/class/thermal/thermal_zone0/temp": "61250\n",
        "sys/class/hwmon/hwmon0/name": "cpu_thermal\n",
        "sys/class/hwmon/hwmon0/temp1_input": "61250\n",
        "sys/class/hwmon/hwmon1/name": "nvme\n",
        "sys/class/hwmon/hwmon1/temp1_input": "44850\n",
        "sys/class/hwmon/hwmon1/temp1_label": "Composite\n",
        "sys/devices/platform/soc/soc:firmware/get_throttled": "0x50000\n",
        "sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq": "2400000\n",
        # Two containers on cgroup v2 with the systemd driver.
        f"sys/fs/cgroup/system.slice/docker-{C1}.scope/memory.current": "300000000\n",
        f"sys/fs/cgroup/system.slice/docker-{C1}.scope/memory.stat": "anon 1\ninactive_file 100000000\n",
        f"sys/fs/cgroup/system.slice/docker-{C1}.scope/memory.max": "1073741824\n",
        f"sys/fs/cgroup/system.slice/docker-{C2}.scope/memory.current": "50000000\n",
        f"sys/fs/cgroup/system.slice/docker-{C2}.scope/memory.stat": "inactive_file 0\n",
        f"sys/fs/cgroup/system.slice/docker-{C2}.scope/memory.max": "max\n",
    }
    procs = {
        1: ("systemd", "/sbin/init", None),
        200: ("postgres", "postgres", C1),
        201: ("postgres", "postgres: checkpointer", C1),
        300: ("node", "node scripts/live-reload.mjs", C2),
    }
    for pid, (name, cmd, cid) in procs.items():
        files[f"proc/{pid}/stat"] = stat_line(pid, name, ticks.get(pid, 0), 0, 1000)
        files[f"proc/{pid}/cmdline"] = cmd.replace(" ", "\0") + "\0"
        files[f"proc/{pid}/cgroup"] = f"0::/system.slice/docker-{cid}.scope\n" if cid else "0::/init.scope\n"
    files["proc/2/stat"] = stat_line(2, "kthreadd", 50, 0, 0)  # kernel thread: no memory, skipped
    return files


class ReadersTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = tree(pi((100, 900), {200: 10, 201: 0, 300: 20}))
        self.proc = f"{self.root}/proc"
        self.sys = f"{self.root}/sys"

    def test_memory_counts_available_as_free(self) -> None:
        m = read.memory(self.proc)
        assert m is not None
        self.assertEqual(m["total"], 8_000_000 * 1024)
        self.assertEqual(m["used"], 2_000_000 * 1024)
        self.assertEqual(m["swap_used"], 600 * 1024)

    def test_temperatures_dedupe_and_pick_the_cpu(self) -> None:
        temps = read.temperatures(self.sys)
        names = [t["name"] for t in temps]
        self.assertIn("cpu-thermal", names)
        self.assertIn("nvme Composite", names)
        self.assertEqual(read.main_temperature(temps), 61.2)
        self.assertIsNone(read.main_temperature([]))

    def test_pi_throttling_flags(self) -> None:
        self.assertEqual(read.throttling(self.sys), {
            "under_voltage": False, "throttled": False,
            "under_voltage_since_boot": True, "throttled_since_boot": True,
        })

    def test_host_info(self) -> None:
        h = read.host_info(self.proc, self.sys)
        self.assertEqual(h["model"], "Raspberry Pi 5 Model B Rev 1.0")
        self.assertEqual(h["cpu"], "Raspberry Pi 5 Model B Rev 1.0")
        self.assertEqual(h["cores"], 4)
        self.assertEqual(h["kernel"], "6.6.51+rpt-rpi-2712")
        self.assertIsNone(h["vm"])
        self.assertEqual(h["boot_time"], 1_700_000_000)

    def test_network_skips_loopback_and_container_links(self) -> None:
        self.assertEqual(read.net_totals(self.proc), {"eth0": (1_000_000, 500_000)})

    def test_disk_io_counts_whole_disks_only(self) -> None:
        self.assertEqual(read.disk_io(self.proc, self.sys), (2000 * 512, 4000 * 512))

    def test_processes_and_containers(self) -> None:
        procs = read.processes(self.proc, page_size=4096)
        self.assertNotIn(2, procs)
        self.assertEqual(procs[200].container, C1)
        self.assertIsNone(procs[1].container)
        self.assertEqual(read.container_name([procs[200], procs[201]]), "db")
        self.assertEqual(read.container_name([procs[300]]), "web")

    def test_program_names_what_a_command_runs(self) -> None:
        cases = {
            "nginx: master process nginx -g daemon off;": "nginx",
            "/usr/bin/tini -- a-bot-entrypoint /usr/bin/supervisord -n": "a-bot-entrypoint",
            "node /usr/local/bin/firebase emulators:start": "firebase",
            "node /usr/local/bin/pnpm run nodemon-docker": "nodemon-docker",
            "node dist/index.js": "node",
            "/usr/share/osd/node/bin/node /usr/share/opensearch-dashboards/src/cli/dist": "opensearch-dashboards",
            "/opt/jdk/bin/java -Xms1g -cp /usr/share/opensearch/lib/* org.opensearch.bootstrap.OpenSearch": "OpenSearch",
            "java -jar /opt/elasticmq/elasticmq-server.jar": "elasticmq-server",
            "python3 -u -m collector": "collector",
            "redis-server *:6379": "redis-server",
            "/home/u/.claude/remote/ccd-cli/2.1.309-537ebbf12df5 --verbose": "ccd-cli",
            "/home/u/.local/share/claude/versions/2.1.312 --resume": "claude",
        }
        for cmd, name in cases.items():
            self.assertEqual(read.program(cmd), name, cmd)
        self.assertIsNone(read.program(""))

    def test_a_runtime_thread_name_gives_way_to_the_program(self) -> None:
        root = tree({
            "proc/400/stat": stat_line(400, "MainThread", 1, 1, 10),
            "proc/400/cmdline": "node\0/usr/local/bin/firebase\0emulators:start\0",
            "proc/400/cgroup": "0::/\n",
        })
        self.assertEqual(read.processes(f"{root}/proc", page_size=4096)[400].name, "firebase")

    def test_cgroup_v2_memory_without_page_cache(self) -> None:
        self.assertEqual(read.cgroup_usage(self.sys, C1), {"mem": 200_000_000, "limit": 1_073_741_824})
        self.assertEqual(read.cgroup_usage(self.sys, C2), {"mem": 50_000_000, "limit": None})
        self.assertIsNone(read.cgroup_usage(self.sys, "c" * 64))

    def test_cgroup_v1(self) -> None:
        root = tree({
            f"sys/fs/cgroup/memory/docker/{C1}/memory.usage_in_bytes": "500\n",
            f"sys/fs/cgroup/memory/docker/{C1}/memory.stat": "cache 300\ntotal_inactive_file 200\n",
            f"sys/fs/cgroup/memory/docker/{C1}/memory.limit_in_bytes": "9223372036854771712\n",
            "proc/sys/kernel/syno_hw_version": "DS920+\n",
            "proc/version": "Linux version 4.4.302+ (root@build) #72806 SMP\n",
        })
        self.assertEqual(read.cgroup_usage(f"{root}/sys", C1), {"mem": 300, "limit": None})
        self.assertEqual(read.host_info(f"{root}/proc", f"{root}/sys")["model"], "Synology DS920+")

    def test_docker_desktop_is_flagged_as_a_vm(self) -> None:
        root = tree({"proc/version": "Linux version 6.10.14-linuxkit (root@buildkitsandbox) #1 SMP\n"})
        self.assertEqual(read.host_info(f"{root}/proc", f"{root}/sys")["vm"], "docker-desktop")

    def test_missing_everything_is_empty_not_an_error(self) -> None:
        root = tree({})
        p, s = f"{root}/proc", f"{root}/sys"
        self.assertEqual(read.cpu_times(p), (None, [], None))
        self.assertIsNone(read.memory(p))
        self.assertEqual(read.temperatures(s), [])
        self.assertIsNone(read.throttling(s))
        self.assertEqual(read.net_totals(p), {})
        self.assertIsNone(read.disk_io(p, s))
        self.assertEqual(read.processes(p), {})


class SampleTest(unittest.TestCase):
    def test_two_passes_turn_counters_into_rates(self) -> None:
        first = tree(pi((100, 900), {200: 10, 201: 0, 300: 20}))
        _, row0, st = sample.take(f"{first}/proc", f"{first}/sys", {}, sample.State(), now=1000.0, ticks_per_s=100, page_size=4096)
        self.assertIsNone(row0["cpu_pct"])
        self.assertIsNone(row0["net_rx_bps"])

        files = pi((150, 950), {200: 50, 201: 0, 300: 20})  # each core: 50 busy of 100 jiffies
        files["proc/1/net/dev"] = files["proc/1/net/dev"].replace("1000000 0", "1300000 0")
        files["proc/diskstats"] = files["proc/diskstats"].replace("100 0 2000", "100 0 2200")
        second = tree(files)
        snap, row, _ = sample.take(f"{second}/proc", f"{second}/sys", {}, st, now=1010.0, ticks_per_s=100, page_size=4096)

        self.assertEqual(row["cpu_pct"], 50.0)
        self.assertEqual(snap["cpu"]["per_core"], [50.0] * 4)
        self.assertEqual(row["net_rx_bps"], 30000.0)
        self.assertEqual(row["net_tx_bps"], 0.0)
        self.assertEqual(row["disk_read_bps"], 200 * 512 / 10)
        self.assertEqual(row["temp_c"], 61.2)
        self.assertEqual(snap["host"]["model"], "Raspberry Pi 5 Model B Rev 1.0")
        self.assertEqual(snap["uptime_s"], 93784)
        self.assertEqual(snap["cpu"]["mhz"], 2400)

        # postgres: 40 ticks in 10 s on 4 cores at 100 Hz = 40 / 4000 = 1 % of the machine.
        db = next(c for c in snap["containers"] if c["name"] == "db")
        self.assertEqual(db["cpu_pct"], 1.0)
        self.assertEqual(db["mem"], 200_000_000)
        self.assertEqual(db["processes"], 2)
        self.assertEqual(snap["top"][0]["name"], "postgres")
        self.assertEqual(snap["top"][0]["container"], "db")
        self.assertEqual(snap["top"][0]["cpu_pct"], 1.0)

    def test_counter_reset_gives_no_rate(self) -> None:
        self.assertIsNone(sample._rate(5, 10, 10.0))
        self.assertEqual(sample._rate(20, 10, 10.0), 1.0)


if __name__ == "__main__":
    unittest.main()
