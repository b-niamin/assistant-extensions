<script lang="ts">
  import { Mascot } from '$shell/ui';
  import { niceTicks, shortDay, type Point } from './stats';

  /**
   * Single-series daily line: 2px line over a 10 % wash, hairline grid, round y ticks, latest
   * value labelled at the end, crosshair + tooltip on hover/keyboard, and a table twin.
   * Drawn in pixel space (width measured) so text and marks never get stretched.
   */
  let {
    points,
    format,
    tick,
    label,
    tickScale = 1
  }: {
    points: Point[];
    format: (v: number | null) => string;
    tick: (v: number) => string;
    label: string;
    /** ticks are rounded in this unit (3600 puts a seconds series on whole/half hours) */
    tickScale?: number;
  } = $props();

  const H = 260;
  const PAD = { top: 16, right: 56, bottom: 28, left: 44 };
  let W = $state(720);
  let hover = $state<number | null>(null);

  const values = $derived(points.map((p) => p.value).filter((v): v is number => v !== null));
  const ticks = $derived(
    values.length
      ? niceTicks(Math.min(...values) / tickScale, Math.max(...values) / tickScale, 4).map((t) => t * tickScale)
      : []
  );
  const lo = $derived(ticks[0] ?? 0);
  const hi = $derived(ticks[ticks.length - 1] ?? 1);
  const innerW = $derived(Math.max(10, W - PAD.left - PAD.right));
  const x = (i: number) => PAD.left + (i / Math.max(1, points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  const base = H - PAD.bottom;

  /** One run per stretch of consecutive days with data, so gaps stay gaps. */
  const runs = $derived.by(() => {
    const out: { i: number; v: number }[][] = [];
    let cur: { i: number; v: number }[] = [];
    points.forEach((p, i) => {
      if (p.value === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push({ i, v: p.value });
    });
    if (cur.length) out.push(cur);
    return out;
  });
  const line = (r: { i: number; v: number }[]) =>
    r.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = (r: { i: number; v: number }[]) =>
    `${line(r)}L${x(r[r.length - 1].i).toFixed(1)},${base}L${x(r[0].i).toFixed(1)},${base}Z`;

  const xTicks = $derived.by(() => {
    const n = Math.max(2, Math.min(6, Math.floor(innerW / 110)));
    if (points.length < 2) return [];
    return Array.from({ length: n }, (_, k) => Math.round((k / (n - 1)) * (points.length - 1)));
  });
  const multiYear = $derived(points.length > 0 && points[0].day.slice(0, 4) !== points[points.length - 1].day.slice(0, 4));
  const last = $derived(points.findLastIndex((p) => p.value !== null));

  function onMove(e: PointerEvent) {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - PAD.left) / innerW) * (points.length - 1));
    hover = Math.max(0, Math.min(points.length - 1, i));
  }
  function onKey(e: KeyboardEvent) {
    if (!points.length) return;
    const step = e.shiftKey ? 7 : 1;
    if (e.key === 'ArrowLeft') hover = Math.max(0, (hover ?? last) - step);
    else if (e.key === 'ArrowRight') hover = Math.min(points.length - 1, (hover ?? last) + step);
    else if (e.key === 'Escape') hover = null;
    else return;
    e.preventDefault();
  }
  const tipLeft = $derived(hover === null ? 0 : Math.min(Math.max(x(hover), 70), W - 70));
</script>

<figure class="chart" bind:clientWidth={W}>
  {#if values.length === 0}
    <div class="empty" style:height="{H}px">
      <Mascot mood="idle" size={44} decorative />
      <span>No readings in this range yet.</span>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      width={W}
      height={H}
      role="img"
      aria-label="{label}, daily, {shortDay(points[0].day)} to {shortDay(points[points.length - 1].day)}. Use arrow keys to read values."
      tabindex="0"
      onpointermove={onMove}
      onpointerleave={() => (hover = null)}
      onkeydown={onKey}
      onblur={() => (hover = null)}
    >
      {#each ticks as t}
        <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
        <text class="ytick" x={PAD.left - 8} y={y(t)} dy="0.32em" text-anchor="end">{tick(t)}</text>
      {/each}
      <line class="baseline" x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} />
      {#each xTicks as i}
        <text class="xtick" x={x(i)} y={H - 8} text-anchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
          {shortDay(points[i].day, multiYear && (i === 0 || i === points.length - 1))}
        </text>
      {/each}

      {#each runs as r}
        <path class="area" d={area(r)} />
        {#if r.length === 1}
          <circle class="lone" cx={x(r[0].i)} cy={y(r[0].v)} r="2.5" />
        {:else}
          <path class="line" d={line(r)} pathLength="1" />
        {/if}
      {/each}

      {#if last >= 0}
        <g class="end" class:away={hover !== null}>
          <circle class="dot" cx={x(last)} cy={y(points[last].value!)} r="4.5" />
          <text class="endlabel" x={x(last) + 10} y={y(points[last].value!)} dy="0.32em">{format(points[last].value)}</text>
        </g>
      {/if}

      {#if hover !== null}
        <line class="cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} />
        {#if points[hover].value !== null}
          <circle class="dot" cx={x(hover)} cy={y(points[hover].value!)} r="4.5" />
        {/if}
      {/if}
    </svg>

    {#if hover !== null}
      <div class="tip" style:left="{tipLeft}px" aria-live="polite">
        <strong>{format(points[hover].value)}</strong>
        <span>{shortDay(points[hover].day, true)}</span>
      </div>
    {/if}
  {/if}

  <details>
    <summary>Show as table</summary>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Day</th><th>{label}</th></tr></thead>
        <tbody>
          {#each points.toReversed() as p}
            <tr><td>{p.day}</td><td>{format(p.value)}</td></tr>
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
  .end {
    transition: opacity 120ms;
  }
  .end.away {
    opacity: 0;
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
    gap: 0;
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
    .end {
      animation: fade 300ms ease-out 1000ms backwards;
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
