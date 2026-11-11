-- monitor/001: what monitor-collector reads from the machine.

-- The latest reading, in full (one row): host, CPU per core, memory, sensors, disks, network,
-- containers, top processes. `at` is when it was taken; the page calls the collector stopped when it
-- falls behind.
CREATE TABLE IF NOT EXISTS monitor.snapshot (
  id   int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  at   timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL
);

-- One row per pass (every 30 s), kept MONITOR_KEEP_DAYS (30) days. Rates are per second over the pass.
CREATE TABLE IF NOT EXISTS monitor.samples (
  at              timestamptz PRIMARY KEY,
  cpu_pct         real,     -- whole machine, 0..100
  load1           real,
  mem_used        bigint,   -- bytes, without cache (MemTotal - MemAvailable)
  mem_total       bigint,
  swap_used       bigint,
  temp_c          real,     -- the CPU's sensor, else the hottest one
  net_rx_bps      real,     -- bytes per second, all physical interfaces
  net_tx_bps      real,
  disk_read_bps   real,     -- bytes per second, all physical disks
  disk_write_bps  real
);
