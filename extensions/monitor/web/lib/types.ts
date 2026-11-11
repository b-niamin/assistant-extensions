/** What monitor-collector writes (services/collector/collector/sample.py), as the page reads it. */

export interface HostInfo {
  hostname: string | null;
  /** "Raspberry Pi 5 Model B Rev 1.0", "Synology DS920+", "LENOVO ThinkCentre M720q", or null. */
  model: string | null;
  cpu: string | null;
  cores: number | null;
  arch: string | null;
  kernel: string | null;
  /** The figures are a VM's: Docker Desktop or OrbStack on a Mac. */
  vm: 'docker-desktop' | 'orbstack' | null;
  boot_time: number | null;
}

export interface Memory {
  total: number;
  available: number;
  used: number;
  cached: number;
  swap_total: number;
  swap_used: number;
}

export interface Disk {
  /** "assistant" (the checkout's filesystem) or "docker" (where volumes live). */
  label: string;
  /** Where the machine mounts it: /volume1, /, ... */
  mount: string | null;
  fstype: string | null;
  total: number;
  used: number;
  free: number;
}

export interface Container {
  id: string;
  name: string;
  /** Share of the whole machine, 0..100. */
  cpu_pct: number | null;
  mem: number;
  mem_limit: number | null;
  processes: number;
}

export interface TopProcess {
  pid: number;
  name: string;
  cpu_pct: number | null;
  mem: number;
  container: string | null;
}

export interface Reading {
  host: HostInfo;
  uptime_s: number | null;
  interval_s: number | null;
  cpu: { pct: number | null; per_core: (number | null)[]; load: number[] | null; mhz: number | null };
  memory: Memory | null;
  temps: { name: string; c: number }[];
  temp_c: number | null;
  throttling: { under_voltage: boolean; throttled: boolean; under_voltage_since_boot: boolean; throttled_since_boot: boolean } | null;
  disks: Disk[];
  disk_io: { read_bps: number | null; write_bps: number | null };
  net: { iface: string; rx_bps: number | null; tx_bps: number | null; rx_total: number; tx_total: number }[];
  containers: Container[];
  top: TopProcess[];
}

/** The latest reading and when it was taken (ISO), or null before the collector's first pass. */
export interface Latest {
  at: string;
  data: Reading;
}

export type Range = '1h' | '24h' | '7d' | '30d';
export type Metric = 'cpu' | 'memory' | 'temp' | 'net' | 'disk';

/** One bucket of history. Rates in bytes per second, memory in percent of total. */
export interface Bucket {
  at: string;
  cpu: number | null;
  cpu_max: number | null;
  load1: number | null;
  mem_pct: number | null;
  temp: number | null;
  rx: number | null;
  tx: number | null;
  read: number | null;
  write: number | null;
}

export interface View {
  at: string;
  latest: Latest | null;
  /** The collector has not written for a while (stopped, or the database is unreachable for it). */
  stale: boolean;
  range: Range;
  metric: Metric;
  history: Bucket[];
}
