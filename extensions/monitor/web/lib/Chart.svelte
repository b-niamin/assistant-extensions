<script lang="ts">
  import { Mascot, useT } from '$shell/ui';
  import { byteTicks, niceTicks } from './ticks';

  /**
   * One or two series over time: 2px lines (a 10 % wash under a single one), hairline grid, round y
   * ticks, the latest value labelled at the end, crosshair + tooltip on hover and arrow keys, and a
   * table twin. Gaps (machine or collector off) stay gaps. Drawn in pixel space so nothing stretches.
   */
  type Line = { label: string; hue: string; values: (number | null)[] };
  let {
    times,
    lines,
    format,
    label,
    floor = 0,
    ceil = null,
    timeFormat,
    bytes = false
  }: {
    times: string[];
    lines: Line[];
    format: (v: number | null) => string;
    label: string;
    /** The y axis starts here (0 for percentages and rates), unless data goes lower. */
    floor?: number | null;
    /** And never ends below this (100 for percentages). */
    ceil?: number | null;
    timeFormat: (iso: string, long: boolean) => string;
    /** Values are bytes (per second): ticks fall on round KB, MB, GB. */
    bytes?: boolean;
  } = $props();
  const t = useT();

  const H = 240;
  const PAD = { top: 16, right: 64, bottom: 28, left: 52 };
  let W = $state(720);
  let hover = $state<number | null>(null);

  const all = $derived(lines.flatMap((l) => l.values).filter((v): v is number => v !== null));
  const ticks = $derived.by(() => {
    if (!all.length) return [];
    const lo = Math.min(...all, floor ?? Infinity);
    const hi = Math.max(...all, ceil ?? -Infinity, lo + 1e-9);
    return (bytes ? byteTicks : niceTicks)(lo, hi, 4);
  });
  const lo = $derived(ticks[0] ?? 0);
  const hi = $derived(ticks[ticks.length - 1] ?? 1);
  const n = $derived(times.length);
  const innerW = $derived(Math.max(10, W - PAD.left - PAD.right));
  const x = (i: number) => PAD.left + (i / Math.max(1, n - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  const base = H - PAD.bottom;
  const single = $derived(lines.length === 1);

  /** Stretches of consecutive buckets with data, per line. */
  function runs(values: (number | null)[]) {
    const out: { i: number; v: number }[][] = [];
    let cur: { i: number; v: number }[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push({ i, v });
    });
    if (cur.length) out.push(cur);
    return out;
  }
  const path = (r: { i: number; v: number }[]) => r.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = (r: { i: number; v: number }[]) => `${path(r)}L${x(r[r.length - 1].i).toFixed(1)},${base}L${x(r[0].i).toFixed(1)},${base}Z`;
  const lastOf = (values: (number | null)[]) => values.findLastIndex((v) => v !== null);

  const xTicks = $derived.by(() => {
    const k = Math.max(2, Math.min(6, Math.floor(innerW / 110)));
    if (n < 2) return [];
    return Array.from({ length: k }, (_, j) => Math.round((j / (k - 1)) * (n - 1)));
  });

  function onMove(e: PointerEvent) {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    hover = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - PAD.left) / innerW) * (n - 1))));
  }
  function onKey(e: KeyboardEvent) {
    if (!n) return;
    const from = hover ?? Math.max(...lines.map((l) => lastOf(l.values)));
    if (e.key === 'ArrowLeft') hover = Math.max(0, from - (e.shiftKey ? 10 : 1));
    else if (e.key === 'ArrowRight') hover = Math.min(n - 1, from + (e.shiftKey ? 10 : 1));
    else if (e.key === 'Escape') hover = null;
    else return;
    e.preventDefault();
  }
  const tipLeft = $derived(hover === null ? 0 : Math.min(Math.max(x(hover), 80), W - 80));
</script>

<figure class="chart" bind:clientWidth={W}>
  {#if !all.length}
    <div class="empty" style:height="{H}px">
      <Mascot mood="idle" size={44} decorative />
      <span>{t('No readings in this range yet.')}</span>
    </div>
  {:else}
    {#if !single}
      <ul class="legend">
        {#each lines as l}<li style:--series="var(--hue-{l.hue})"><span class="key"></span>{t(l.label)}</li>{/each}
      </ul>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      width={W}
      height={H}
      role="img"
      aria-label={t('{label}, {from} to {to}. Use arrow keys to read values.', { label, from: timeFormat(times[0], true), to: timeFormat(times[n - 1], true) })}
      tabindex="0"
      onpointermove={onMove}
      onpointerleave={() => (hover = null)}
      onkeydown={onKey}
      onblur={() => (hover = null)}
    >
      {#each ticks as v}
        <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
        <text class="ytick" x={PAD.left - 8} y={y(v)} dy="0.32em" text-anchor="end">{format(v)}</text>
      {/each}
      <line class="baseline" x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} />
      {#each xTicks as i}
        <text x={x(i)} y={H - 8} text-anchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{timeFormat(times[i], false)}</text>
      {/each}

      {#each lines as l}
        <g style:--series="var(--hue-{l.hue})">
          {#each runs(l.values) as r}
            {#if single}<path class="area" d={area(r)} />{/if}
            {#if r.length === 1}
              <circle class="lone" cx={x(r[0].i)} cy={y(r[0].v)} r="2.5" />
            {:else}
              <path class="line" d={path(r)} pathLength="1" />
            {/if}
          {/each}
          {#if lastOf(l.values) >= 0 && hover === null}
            {@const i = lastOf(l.values)}
            <circle class="dot" cx={x(i)} cy={y(l.values[i]!)} r="4" />
            <text class="endlabel" x={x(i) + 9} y={y(l.values[i]!)} dy="0.32em">{format(l.values[i])}</text>
          {/if}
          {#if hover !== null && l.values[hover] !== null}
            <circle class="dot" cx={x(hover)} cy={y(l.values[hover]!)} r="4" />
          {/if}
        </g>
      {/each}
      {#if hover !== null}
        <line class="cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} />
      {/if}
    </svg>

    {#if hover !== null}
      <div class="tip" style:left="{tipLeft}px" aria-live="polite">
        {#each lines as l}
          <strong style:--series="var(--hue-{l.hue})">{#if !single}<span class="key"></span>{/if}{format(l.values[hover])}</strong>
        {/each}
        <span>{timeFormat(times[hover], true)}</span>
      </div>
    {/if}
  {/if}

  <details>
    <summary>{t('Show as table')}</summary>
    <div class="tablewrap">
      <table>
        <thead>
          <tr><th>{t('Time')}</th>{#each lines as l}<th>{t(l.label)}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each times.map((_, i) => n - 1 - i) as i}
            <tr><td>{timeFormat(times[i], true)}</td>{#each lines as l}<td>{format(l.values[i])}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</figure>

<style>
  .chart {
    position: relative;
    margin: 0;
    width: 100%;
  }
  svg {
    display: block;
    touch-action: pan-y;
    border-radius: var(--radius-sm);
  }
  .empty {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--space-2);
    color: var(--ink-3);
    border: 1px dashed var(--grid);
    border-radius: var(--radius-sm);
  }
  .legend {
    display: flex;
    gap: var(--space-4);
    list-style: none;
    margin: 0 0 var(--space-2);
    padding: 0;
    font-size: 0.8125rem;
    color: var(--ink-2);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .key {
    display: inline-block;
    width: 14px;
    height: 3px;
    border-radius: 2px;
    background: var(--series);
    margin-right: 6px;
    vertical-align: middle;
  }
  .grid {
    stroke: var(--grid);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .baseline {
    stroke: var(--axis);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  text {
    font-size: 11px;
    fill: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .endlabel {
    fill: var(--ink);
    font-size: 12px;
    font-weight: 600;
  }
  .area {
    fill: color-mix(in srgb, var(--series, var(--accent)) 12%, transparent);
  }
  .line {
    fill: none;
    stroke: var(--series, var(--accent));
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .lone {
    fill: var(--series, var(--accent));
  }
  .dot {
    fill: var(--series, var(--accent));
    stroke: var(--surface);
    stroke-width: 2;
  }
  .cross {
    stroke: var(--ink-3);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .tip {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    display: grid;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    box-shadow:
      0 0 0 1px var(--ring),
      0 4px 12px rgba(0, 0, 0, 0.08);
    pointer-events: none;
    white-space: nowrap;
    text-align: center;
  }
  .tip strong {
    font-size: 0.9375rem;
  }
  .tip span {
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  @media (prefers-reduced-motion: no-preference) {
    .line {
      stroke-dasharray: 1;
      animation: draw 1100ms cubic-bezier(0.65, 0, 0.35, 1) both;
    }
    .area {
      animation: fade 700ms ease-out 400ms both;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  details {
    margin-top: var(--space-3);
    font-size: 0.8125rem;
  }
  summary {
    cursor: pointer;
    color: var(--ink-2);
    width: fit-content;
  }
  .tablewrap {
    max-height: 280px;
    overflow: auto;
    margin-top: var(--space-2);
  }
  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 4px 16px 4px 0;
    border-bottom: 1px solid var(--grid);
  }
  th {
    color: var(--ink-2);
    font-weight: 500;
  }
</style>
