<script lang="ts">
  import { onMount } from 'svelte';
  import { byteTicks, type DataOf } from '$shell';
  import { EmptyState, LineChart, Mascot, useT } from '$shell/ui';
  import {
    ago,
    beni,
    bytes,
    celsius,
    cpuTone,
    diskName,
    diskPct,
    diskTone,
    formatter,
    hostLine,
    memPct,
    memTone,
    pct,
    RANGES,
    rate,
    series,
    tempTone,
    toneLabel,
    uptime,
    type Tone
  } from '../lib/monitor';
  import type { Metric, Range, View } from '../lib/types';

  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();

  const REFRESH_MS = 30_000;
  let fresh = $state<View | null>(null);
  let now = $state(Date.now());
  let failed = $state(false);

  /** The newest of what the page load and the auto-refresh brought, for the range and metric in the URL. */
  const v = $derived(
    fresh && fresh.range === data.view.range && fresh.metric === data.view.metric && Date.parse(fresh.at) > Date.parse(data.view.at)
      ? fresh
      : data.view
  );
  const r = $derived(v.latest?.data ?? null);

  async function refresh() {
    try {
      const res = await fetch(`/monitor/state?range=${v.range}&metric=${v.metric}`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      fresh = (await res.json()) as View;
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    const tick = setInterval(() => (now = Date.now()), 5_000);
    const poll = setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_MS);
    const wake = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', wake);
    };
  });

  const pip = $derived(beni(v.latest, v.stale, new Date(now).getHours(), t));
  const mem = $derived(r ? memPct(r) : null);
  const net = $derived(
    r ? r.net.reduce((a, n) => ({ rx: a.rx + (n.rx_bps ?? 0), tx: a.tx + (n.tx_bps ?? 0), any: a.any || n.rx_bps !== null }), { rx: 0, tx: 0, any: false }) : null
  );
  const lines = $derived(series(v.metric).map((s) => ({ label: s.label, hue: s.hue, values: v.history.map((b) => b[s.key] as number | null) })));
  const fmt = $derived(formatter(v.metric, t.locale));
  const times = $derived(v.history.map((b) => b.at));
  const loc = $derived(t.locale);

  const METRIC_LABELS: Record<Metric, string> = { cpu: 'CPU', memory: 'Memory', temp: 'Temperature', net: 'Network', disk: 'Disk activity' };
  const RANGE_LABELS: Record<Range, string> = { '1h': '1 h', '24h': '24 h', '7d': '7 d', '30d': '30 d' };
  const href = (range: Range, metric: Metric) => `?range=${range}&metric=${metric}`;

  function timeFormat(iso: string, long: boolean): string {
    const d = new Date(iso);
    const short = v.range === '1h' || v.range === '24h';
    if (long) return d.toLocaleString(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return short ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  }
  const statusOf = (tone: Tone | null) => (tone ? `status ${tone}` : 'status');
</script>

<svelte:head><title>{t('System')} · Assistant</title></svelte:head>

{#snippet meter(value: number | null, tone: Tone | null, label: string)}
  <span class="meter" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={value == null ? undefined : Math.round(value)}>
    <span class="fill {tone ?? ''}" style:width="{Math.max(0, Math.min(100, value ?? 0))}%"></span>
  </span>
{/snippet}

<section class="page">
  <header class="head card">
    <span class="beni"><Mascot mood={pip.mood} size={64} label={t('Beni says: {line}', { line: pip.line })} /></span>
    <div class="who">
      <h1>{r?.host.hostname ?? t('This machine')}</h1>
      {#if r}<p class="muted">{hostLine(r, t)}</p>{/if}
      <p class="say">{pip.line}</p>
    </div>
    {#if v.latest && r}
      <dl class="facts">
        <div>
          <dt>{t('Up for')}</dt>
          <dd>{uptime(r.uptime_s, t)}</dd>
        </div>
        <div>
          <dt>{t('Reading')}</dt>
          <dd class={v.stale || failed ? 'status serious' : 'status good'}>{ago(v.latest.at, now, t)}</dd>
        </div>
      </dl>
    {/if}
  </header>

  {#if !v.latest || !r}
    <div class="card">
      <EmptyState title={t('No readings yet')} mascotLabel={t('Beni is waiting')}>
        <p>{t("This extension reads the machine through a small background service, the collector, which the assistant's worker starts within seconds of the install.")}</p>
        <p class="muted">{t('The first reading comes within a minute. If none comes, see System settings -> Worker: the worker comes with the assistant from 12 November 2026 on.')}</p>
      </EmptyState>
    </div>
  {:else}
    {#if v.stale}
      <p class="banner status serious">{t('No new reading since {time}. The collector may have stopped: see System settings -> Worker.', { time: timeFormat(v.latest.at, true) })}</p>
    {/if}
    {#if r.host.vm}
      <p class="banner status">{t('These are the figures of the Linux virtual machine Docker runs in on this Mac ({vm}), not of macOS itself.', { vm: r.host.vm === 'orbstack' ? 'OrbStack' : 'Docker Desktop' })}</p>
    {/if}
    {#if r.throttling && (r.throttling.under_voltage_since_boot || r.throttling.throttled_since_boot) && !r.throttling.under_voltage && !r.throttling.throttled}
      <p class="banner status warning">
        {r.throttling.under_voltage_since_boot ? t('The power supply dipped below what the board needs since the last start.') : t('The CPU was throttled since the last start.')}
      </p>
    {/if}

    <div class="stats">
      <article class="card stat rise" style:--i="0" style:--series="var(--hue-blue)">
        <p class="eyebrow">{t('CPU')}</p>
        <p class="big">{pct(r.cpu.pct, loc)}</p>
        <p class={statusOf(cpuTone(r.cpu.pct))}>{cpuTone(r.cpu.pct) ? toneLabel(cpuTone(r.cpu.pct)!, t) : '–'}</p>
        {#if r.cpu.load}<p class="sub num">{t('load {a} · {b} · {c}', { a: r.cpu.load[0], b: r.cpu.load[1], c: r.cpu.load[2] })}</p>{/if}
        {#if r.cpu.per_core.length > 1}
          <div class="cores" aria-label={t('Per core')}>
            {#each r.cpu.per_core as c, i}
              <span class="core" title={t('Core {n}: {pct}', { n: i + 1, pct: pct(c, loc) })}><span style:height="{Math.max(4, c ?? 0)}%"></span></span>
            {/each}
          </div>
        {/if}
      </article>

      <article class="card stat rise" style:--i="1">
        <p class="eyebrow">{t('Memory')}</p>
        <p class="big">{pct(mem, loc)}</p>
        <p class={statusOf(memTone(mem))}>{memTone(mem) ? toneLabel(memTone(mem)!, t) : '–'}</p>
        {#if r.memory}
          {@render meter(mem, memTone(mem), t('Memory used'))}
          <p class="sub num">{t('{used} of {total}', { used: bytes(r.memory.used, loc), total: bytes(r.memory.total, loc) })}</p>
          {#if r.memory.swap_total}<p class="sub num">{t('swap {used} of {total}', { used: bytes(r.memory.swap_used, loc), total: bytes(r.memory.swap_total, loc) })}</p>{/if}
        {/if}
      </article>

      <article class="card stat rise" style:--i="2">
        <p class="eyebrow">{t('Temperature')}</p>
        <p class="big">{celsius(r.temp_c)}</p>
        {#if r.temp_c != null}
          <p class={statusOf(tempTone(r.temp_c))}>{toneLabel(tempTone(r.temp_c)!, t)}</p>
        {:else}
          <p class="sub">{t('No sensor visible on this machine.')}</p>
        {/if}
        {#if r.temps.length > 1}
          <details class="sensors">
            <summary>{t.n(r.temps.length, '{n} sensor', '{n} sensors')}</summary>
            <ul>{#each r.temps as s}<li><span>{s.name}</span><span class="num">{celsius(s.c)}</span></li>{/each}</ul>
          </details>
        {/if}
      </article>

      <article class="card stat rise" style:--i="3">
        <p class="eyebrow">{t('Network')}</p>
        {#if net?.any}
          <p class="pair num"><span class="arrow" aria-label={t('Download')}>↓</span>{rate(net.rx, loc)}</p>
          <p class="pair num"><span class="arrow" aria-label={t('Upload')}>↑</span>{rate(net.tx, loc)}</p>
          <p class="sub">{r.net.map((n) => n.iface).join(', ')}</p>
        {:else}
          <p class="big">–</p>
          <p class="sub">{t('Not visible from here yet.')}</p>
        {/if}
      </article>

      <article class="card stat rise" style:--i="4">
        <p class="eyebrow">{t('Disk activity')}</p>
        {#if r.disk_io.read_bps != null}
          <p class="pair num"><span class="arrow" aria-label={t('Read')}>R</span>{rate(r.disk_io.read_bps, loc)}</p>
          <p class="pair num"><span class="arrow" aria-label={t('Write')}>W</span>{rate(r.disk_io.write_bps, loc)}</p>
        {:else}
          <p class="big">–</p>
          <p class="sub">{t('Not visible from here yet.')}</p>
        {/if}
      </article>
    </div>

    <div class="two">
      <section class="card trend">
        <div class="bar">
          <nav class="segmented" aria-label={t('Measure')}>
            {#each Object.entries(METRIC_LABELS) as [m, label]}
              <a href={href(v.range, m as Metric)} aria-current={v.metric === m} data-sveltekit-noscroll>{t(label)}</a>
            {/each}
          </nav>
          <nav class="segmented" aria-label={t('Range')}>
            {#each RANGES as rg}
              <a href={href(rg, v.metric)} aria-current={v.range === rg} data-sveltekit-noscroll>{t(RANGE_LABELS[rg])}</a>
            {/each}
          </nav>
        </div>
        <LineChart
          labels={times}
          series={lines.map((l) => ({ ...l, label: t(l.label) }))}
          format={fmt}
          label={t(METRIC_LABELS[v.metric])}
          ceil={v.metric === 'cpu' || v.metric === 'memory' ? 100 : null}
          floor={v.metric === 'temp' ? null : 0}
          ticks={v.metric === 'net' || v.metric === 'disk' ? (lo, hi) => byteTicks(lo, hi, 4) : undefined}
          xLabel={timeFormat}
          step={10}
        />
      </section>

      <section class="card">
        <h2>{t('Storage')}</h2>
        {#if r.disks.length}
          <ul class="disks">
            {#each r.disks as d}
              {@const p = diskPct(d)}
              <li>
                <div class="row">
                  <strong>{diskName(d.label, t)}</strong>
                  <span class="muted">{d.mount ?? ''}{d.fstype ? ` · ${d.fstype}` : ''}</span>
                  <span class="spacer"></span>
                  <span class={statusOf(diskTone(p))}>{pct(p, loc)}</span>
                </div>
                {@render meter(p, diskTone(p), t('{disk} used', { disk: diskName(d.label, t) }))}
                <p class="sub num">{t('{free} free of {total}', { free: bytes(d.free, loc), total: bytes(d.used + d.free, loc) })}</p>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">{t('No disk visible from here yet.')}</p>
        {/if}
      </section>
    </div>

    <div class="two even">
      <section class="card">
        <h2>{t('Containers')}</h2>
        {#if r.containers.length}
          <div class="scroll">
            <table>
              <thead><tr><th>{t('Name')}</th><th class="n">{t('CPU')}</th><th class="n">{t('Memory')}</th></tr></thead>
              <tbody>
                {#each r.containers as c}
                  <tr>
                    <td><span title={c.id}>{c.name}</span></td>
                    <td class="n num">{pct(c.cpu_pct, loc)}</td>
                    <td class="n num">{bytes(c.mem, loc)}{#if c.mem_limit}<span class="muted"> / {bytes(c.mem_limit, loc)}</span>{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="hint muted">{t('CPU is a share of the whole machine.')}</p>
        {:else}
          <div class="quiet">
            <Mascot mood="idle" size={40} decorative />
            <p class="muted">{t('No containers visible from here.')}</p>
          </div>
        {/if}
      </section>

      <section class="card">
        <h2>{t('Busiest processes')}</h2>
        {#if r.top.length}
          <div class="scroll">
            <table>
              <thead><tr><th>{t('Process')}</th><th>{t('Container')}</th><th class="n">{t('CPU')}</th><th class="n">{t('Memory')}</th></tr></thead>
              <tbody>
                {#each r.top as p}
                  <tr>
                    <td>{p.name}</td>
                    <td class="muted">{p.container ?? t('machine')}</td>
                    <td class="n num">{pct(p.cpu_pct, loc)}</td>
                    <td class="n num">{bytes(p.mem, loc)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="muted">{t('Nothing yet.')}</p>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .page {
    display: grid;
    gap: var(--space-4);
  }
  h1,
  h2,
  p {
    margin: 0;
  }
  h1 {
    font-size: 1.5rem;
    line-height: 1.2;
  }
  h2 {
    font-size: 1rem;
    margin-bottom: var(--space-3);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  .beni {
    display: inline-flex;
    margin: -8px 0;
  }
  .who {
    flex: 1;
    min-width: 200px;
    display: grid;
    gap: 2px;
  }
  .say {
    color: var(--ink-2);
    margin-top: var(--space-1);
  }
  .facts {
    display: flex;
    gap: var(--space-5);
    margin: 0;
  }
  .facts div {
    display: grid;
    gap: 2px;
  }
  .facts dt {
    font-size: 0.8125rem;
    color: var(--ink-3);
  }
  .facts dd {
    margin: 0;
    font-weight: 600;
  }
  .banner {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--ring);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 0.875rem;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-4);
  }
  .stat {
    display: grid;
    align-content: start;
    gap: var(--space-1);
    min-width: 0;
  }
  .big {
    font-size: 2.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .pair {
    font-size: 1.25rem;
    font-weight: 600;
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
  }
  .arrow {
    color: var(--ink-3);
    font-size: 0.875rem;
    width: 1em;
  }
  .sub {
    color: var(--ink-2);
    font-size: 0.8125rem;
  }
  .status {
    font-size: 0.875rem;
  }
  .meter {
    display: block;
    height: 6px;
    margin: var(--space-2) 0 var(--space-1);
    border-radius: 3px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--ring);
    overflow: hidden;
  }
  .meter .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
  }
  .meter .fill.warning {
    background: var(--warning);
  }
  .meter .fill.serious {
    background: var(--serious);
  }
  .meter .fill.critical {
    background: var(--critical);
  }
  .cores {
    display: flex;
    gap: 3px;
    align-items: flex-end;
    height: 28px;
    margin-top: var(--space-2);
  }
  .core {
    flex: 1;
    max-width: 14px;
    height: 100%;
    display: flex;
    align-items: flex-end;
    background: var(--surface-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .core span {
    display: block;
    width: 100%;
    background: var(--series);
  }
  .sensors {
    font-size: 0.8125rem;
    margin-top: var(--space-1);
  }
  .sensors summary {
    cursor: pointer;
    color: var(--ink-2);
  }
  .sensors ul {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .sensors li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .two {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--space-4);
  }
  .two.even {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .bar {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .segmented {
    flex-wrap: wrap;
  }
  .disks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-4);
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .row .muted {
    font-size: 0.8125rem;
  }
  .spacer {
    flex: 1;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  th,
  td {
    text-align: left;
    padding: 6px 12px 6px 0;
    border-bottom: 1px solid var(--grid);
    white-space: nowrap;
  }
  th {
    color: var(--ink-2);
    font-weight: 500;
  }
  .n {
    text-align: right;
    padding-right: 0;
    padding-left: 12px;
  }
  .hint {
    font-size: 0.8125rem;
    margin-top: var(--space-2);
  }
  .quiet {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  @media (max-width: 860px) {
    .two,
    .two.even {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 520px) {
    .facts {
      width: 100%;
    }
  }
</style>
