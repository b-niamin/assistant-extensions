<script lang="ts">
  import { hms } from './format';
  import { paceText, type Series } from './activity';
  import { niceTicks } from './stats';

  /**
   * One stream of an activity over time (heart rate, pace, elevation, ...): 2px line over a 10 % wash,
   * hairline grid, round y ticks. The hover position is shared by every chart on the page (`hover`),
   * so moving over one shows the same moment in all of them.
   */
  let {
    time,
    series,
    hover = $bindable(null)
  }: {
    time: number[];
    series: Series;
    hover?: number | null;
  } = $props();

  const H = 150;
  const PAD = { top: 12, right: 12, bottom: 24, left: 44 };
  let W = $state(720);

  const fmt = (v: number | null) =>
    v == null ? '–' : series.key === 'pace' ? `${paceText(v)} /km` : `${Math.round(v).toLocaleString('en-US')} ${series.unit}`;
  const tickText = (v: number) => (series.key === 'pace' ? paceText(v) : Math.round(v).toLocaleString('en-US'));

  const values = $derived(series.values.filter((v): v is number => v !== null));
  // Pace has outliers when walking a few steps: clip the slowest 3 % so the chart keeps its shape.
  const sorted = $derived([...values].sort((a, b) => a - b));
  const lo0 = $derived(series.key === 'pace' ? sorted[Math.floor(sorted.length * 0.01)] : sorted[0]);
  const hi0 = $derived(series.key === 'pace' ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.97))] : sorted[sorted.length - 1]);
  const ticks = $derived(values.length ? niceTicks(lo0 ?? 0, hi0 ?? 1, 3) : [0, 1]);
  const lo = $derived(ticks[0]);
  const hi = $derived(ticks[ticks.length - 1]);
  const t0 = $derived(time[0] ?? 0);
  const t1 = $derived(time[time.length - 1] ?? 1);
  const innerW = $derived(Math.max(10, W - PAD.left - PAD.right));
  const innerH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * innerW;
  const y = (v: number) => {
    const c = Math.max(lo, Math.min(hi, v));
    const f = (c - lo) / (hi - lo || 1);
    return PAD.top + (series.invert ? f : 1 - f) * innerH;
  };
  const base = H - PAD.bottom;

  const runs = $derived.by(() => {
    const out: number[][] = [];
    let cur: number[] = [];
    series.values.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
  });
  const line = (r: number[]) => r.map((i, k) => `${k ? 'L' : 'M'}${x(time[i]).toFixed(1)},${y(series.values[i]!).toFixed(1)}`).join('');
  const area = (r: number[]) => `${line(r)}L${x(time[r[r.length - 1]]).toFixed(1)},${base}L${x(time[r[0]]).toFixed(1)},${base}Z`;

  /** Time ticks on whole 5/10/15/30/60-minute marks. */
  const timeTicks = $derived.by(() => {
    const span = t1 - t0;
    const step = [60, 300, 600, 900, 1800, 3600, 7200].find((s) => span / s <= 6) ?? 7200;
    const out: number[] = [];
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
    return out;
  });
  const timeLabel = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} h` : `${Math.round(s / 60)} min`);

  function nearest(px: number): number {
    const t = t0 + ((px - PAD.left) / innerW) * (t1 - t0);
    let lo2 = 0;
    let hi2 = time.length - 1;
    while (hi2 - lo2 > 1) {
      const mid = (lo2 + hi2) >> 1;
      if (time[mid] < t) lo2 = mid;
      else hi2 = mid;
    }
    return Math.abs(time[lo2] - t) <= Math.abs(time[hi2] - t) ? lo2 : hi2;
  }
  function onmove(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    hover = nearest(e.clientX - r.left);
  }
  const avg = $derived(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const hv = $derived(hover != null ? series.values[hover] : null);
</script>

<figure class="stream" style:--series={series.hue}>
  <figcaption>
    <span class="label">{series.label}</span>
    {#if hover != null}
      <span class="read"><strong>{fmt(hv)}</strong> <span class="muted">at {hms(time[hover] ?? 0)}</span></span>
    {:else if avg != null}
      <span class="read"><span class="muted">avg</span> <strong>{fmt(avg)}</strong></span>
    {/if}
  </figcaption>
  <div class="plot" bind:clientWidth={W}>
    <svg
      width={W}
      height={H}
      role="img"
      aria-label="{series.label} over the activity, average {fmt(avg)}"
      onpointermove={onmove}
      onpointerleave={() => (hover = null)}
    >
      {#each ticks as t (t)}
        <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
        <text class="tick" x={PAD.left - 8} y={y(t)} dy="0.32em" text-anchor="end">{tickText(t)}</text>
      {/each}
      {#each timeTicks as t (t)}
        <text class="tick" x={x(t)} y={H - 6} text-anchor="middle">{timeLabel(t)}</text>
      {/each}
      {#each runs as r, i (i)}
        <path class="wash" d={area(r)} />
        <path class="line" d={line(r)} />
      {/each}
      {#if hover != null && time[hover] != null}
        <line class="cross" x1={x(time[hover])} x2={x(time[hover])} y1={PAD.top} y2={H - PAD.bottom} />
        {#if hv != null}<circle class="dot" cx={x(time[hover])} cy={y(hv)} r="4" />{/if}
      {/if}
    </svg>
  </div>
</figure>

<style>
  .stream {
    margin: 0;
    display: grid;
    gap: var(--space-1);
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
    font-size: 0.8125rem;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .label::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--series);
  }
  .read {
    font-variant-numeric: tabular-nums;
  }
  .plot {
    width: 100%;
    touch-action: pan-y;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--grid);
    stroke-width: 1;
  }
  .tick {
    fill: var(--ink-3);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .wash {
    fill: var(--series);
    opacity: 0.1;
  }
  .line {
    fill: none;
    stroke: var(--series);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .cross {
    stroke: var(--axis);
    stroke-width: 1;
  }
  .dot {
    fill: var(--series);
    stroke: var(--surface);
    stroke-width: 2;
  }
</style>
