<script lang="ts">
  import { useT } from '$shell/ui';
  import { hhmm, type Hour } from './weather';

  /**
   * The next 24 hours: temperature as one line (orange, warm), precipitation as bars under it (blue).
   * Latest-now point labelled, 0° drawn dashed when the line crosses it, crosshair + tooltip on hover
   * and arrow keys. The "List" tab next to it is this chart's table twin.
   */
  let { hours }: { hours: Hour[] } = $props();
  const t = useT();

  let width = $state(560);
  const H = 270;
  const PAD = { l: 10, r: 34, t: 22 };
  const LINE_BOTTOM = 150;
  const BARS_TOP = 178;
  const BARS_BOTTOM = 236;

  const temps = $derived(hours.map((h) => h.temp));
  const known = $derived(temps.filter((v): v is number => v !== null));
  const lo = $derived(known.length ? Math.min(...known) : 0);
  const hi = $derived(known.length ? Math.max(...known) : 1);
  const span = $derived(Math.max(4, hi - lo));
  const mid = $derived((hi + lo) / 2);

  const x = (i: number) => PAD.l + (i / Math.max(1, hours.length - 1)) * (width - PAD.l - PAD.r);
  const y = (v: number) => LINE_BOTTOM - ((v - (mid - span / 2)) / span) * (LINE_BOTTOM - PAD.t);

  const path = $derived.by(() => {
    let d = '';
    let pen = false;
    hours.forEach((h, i) => {
      if (h.temp === null) return (pen = false);
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.temp).toFixed(1)}`;
      pen = true;
    });
    return d;
  });
  const area = $derived(path ? `${path}L${x(hours.length - 1).toFixed(1)},${LINE_BOTTOM}L${x(0).toFixed(1)},${LINE_BOTTOM}Z` : '');
  /** The warmest hour gets its label, unless it is the end of the line (labelled there). */
  const peak = $derived(hours.reduce((m, h, i) => ((h.temp ?? -Infinity) > (hours[m]?.temp ?? -Infinity) ? i : m), 0));
  const zero = $derived(lo < 0 && hi > 0 ? y(0) : null);

  const maxRain = $derived(Math.max(1, ...hours.map((h) => h.precip ?? 0)));
  const barW = $derived(Math.max(3, ((width - PAD.l - PAD.r) / Math.max(1, hours.length)) * 0.62));
  const barH = (mm: number | null) => ((mm ?? 0) / maxRain) * (BARS_BOTTOM - BARS_TOP);
  const wettest = $derived(hours.reduce((m, h, i) => ((h.precip ?? 0) > (hours[m]?.precip ?? 0) ? i : m), 0));

  /** Ticks: now, then every full 6 hours (00, 06, 12, 18), never crowding "now". */
  const ticks = $derived(
    hours
      .map((h, i) => ({ i, hour: Number(h.time.slice(11, 13)) }))
      .filter(({ i, hour }) => i === 0 || (hour % 6 === 0 && i >= 3))
  );

  let hover = $state<number | null>(null);
  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - PAD.l) / (width - PAD.l - PAD.r)) * (hours.length - 1));
    hover = Math.max(0, Math.min(hours.length - 1, i));
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') hover = Math.min(hours.length - 1, (hover ?? -1) + 1);
    else if (e.key === 'ArrowLeft') hover = Math.max(0, (hover ?? 1) - 1);
    else if (e.key === 'Escape') hover = null;
    else return;
    e.preventDefault();
  }
  const last = $derived(hours.length - 1);
  const fmtT = (v: number | null) => (v === null ? '–' : `${Math.round(v)}°`);
  const fmtMm = (v: number | null) => (v === null ? '–' : `${+v.toFixed(1)} mm`);
</script>

<div class="chart" bind:clientWidth={width}>
  {#if hours.length > 1}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      viewBox="0 0 {width} {H}"
      width={width}
      height={H}
      role="img"
      aria-label={t('Temperature and precipitation over the next 24 hours. Use the arrow keys to read each hour.')}
      tabindex="0"
      onpointermove={move}
      onpointerleave={() => (hover = null)}
      onkeydown={key}
      onblur={() => (hover = null)}
    >
      {#each ticks as tk}
        <line class="grid" x1={x(tk.i)} x2={x(tk.i)} y1={PAD.t - 8} y2={BARS_BOTTOM} />
      {/each}
      {#if zero !== null}
        <line class="zero" x1={PAD.l} x2={width - PAD.r} y1={zero} y2={zero} />
        <text class="tick" x={width - PAD.r + 4} y={zero + 4}>0°</text>
      {/if}
      <path class="wash" d={area} />
      <path class="line" d={path} />

      {#each hours as h, i}
        {#if (h.precip ?? 0) > 0}
          <rect class="bar" x={x(i) - barW / 2} y={BARS_BOTTOM - barH(h.precip)} width={barW} height={Math.max(1.5, barH(h.precip))} rx="1.5" />
        {/if}
      {/each}
      <line class="axis" x1={PAD.l} x2={width - PAD.r} y1={BARS_BOTTOM} y2={BARS_BOTTOM} />
      {#if (hours[wettest]?.precip ?? 0) > 0}
        <text class="tick" x={x(wettest)} y={BARS_BOTTOM - barH(hours[wettest].precip) - 6} text-anchor="middle">{fmtMm(hours[wettest].precip)}</text>
      {:else}
        <text class="tick" x={PAD.l} y={BARS_BOTTOM - 6}>{t('dry for 24 h')}</text>
      {/if}

      {#if hours[0].temp !== null}
        <circle class="now" cx={x(0)} cy={y(hours[0].temp)} r="5" />
      {/if}
      {#if peak > 0 && peak < last - 2 && hours[peak].temp !== null}
        <text class="end" x={x(peak)} y={y(hours[peak].temp) - 9} text-anchor="middle">{fmtT(hours[peak].temp)}</text>
      {/if}
      {#if hours[last].temp !== null}
        <text class="end" x={x(last) + 6} y={y(hours[last].temp) + 4}>{fmtT(hours[last].temp)}</text>
      {/if}

      {#each ticks as tk}
        <text class="tick time" class:strong={tk.i === 0} x={x(tk.i)} y={H - 8} text-anchor={tk.i === 0 ? 'start' : 'middle'}>
          {tk.i === 0 ? t('now') : hhmm(hours[tk.i].time)}
        </text>
      {/each}

      {#if hover !== null}
        {@const h = hours[hover]}
        <line class="cross" x1={x(hover)} x2={x(hover)} y1={PAD.t - 8} y2={BARS_BOTTOM} />
        {#if h.temp !== null}<circle class="dot" cx={x(hover)} cy={y(h.temp)} r="4" />{/if}
      {/if}
    </svg>
    {#if hover !== null}
      {@const h = hours[hover]}
      <div class="tip" style:left="{Math.min(Math.max(x(hover), 70), width - 70)}px" role="status">
        <strong>{hhmm(h.time)}</strong>
        <span>{fmtT(h.temp)}</span>
        <span>{fmtMm(h.precip)}</span>
        {#if h.wind !== null}<span>{Math.round(h.wind)} km/h</span>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    touch-action: pan-y;
  }
  svg:focus-visible {
    outline-offset: 4px;
  }
  .grid {
    stroke: var(--grid);
    stroke-width: 1;
  }
  .axis {
    stroke: var(--axis);
  }
  .zero {
    stroke: var(--axis);
    stroke-dasharray: 3 4;
  }
  .wash {
    fill: var(--hue-orange);
    opacity: 0.1;
  }
  .line {
    fill: none;
    stroke: var(--hue-orange);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .bar {
    fill: var(--hue-blue);
    opacity: 0.75;
  }
  .now {
    fill: var(--hue-orange);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .tick {
    font-size: 12px;
    fill: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .time {
    font-size: 13px;
    fill: var(--ink-2);
  }
  .strong {
    fill: var(--ink);
    font-weight: 600;
  }
  .end {
    font-size: 13px;
    font-weight: 600;
    fill: var(--ink);
  }
  .cross {
    stroke: var(--ink-3);
    stroke-width: 1;
  }
  .dot {
    fill: var(--surface);
    stroke: var(--hue-orange);
    stroke-width: 2;
  }
  .tip {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    display: flex;
    gap: var(--space-2);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--ring), 0 4px 14px rgba(0, 0, 0, 0.08);
    font-size: 0.8125rem;
    white-space: nowrap;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .tip span {
    color: var(--ink-2);
  }
  @media (prefers-reduced-motion: no-preference) {
    .line {
      stroke-dasharray: 2000;
      animation: draw 900ms ease-out both;
    }
    .wash {
      animation: fade 600ms 500ms both;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 2000;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
