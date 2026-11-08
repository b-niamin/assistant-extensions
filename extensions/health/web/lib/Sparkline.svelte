<script lang="ts">
  import type { Point } from './stats';

  /** A short trend: the history in the de-emphasis grey, the latest reading in the accent. */
  let { points, height = 28 }: { points: Point[]; height?: number } = $props();

  const H = $derived(height);
  const P = 5;
  let W = $state(120);

  const vals = $derived(points.map((p) => p.value).filter((v): v is number => v !== null));
  const min = $derived(Math.min(...vals));
  const span = $derived(Math.max(...vals) - min || 1);
  const x = (i: number) => P + (i / Math.max(1, points.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / span) * (H - 2 * P);
  const path = $derived.by(() => {
    let d = '';
    // A trend glyph, not a record: bridge missing days so the shape stays readable.
    points.forEach((p, i) => {
      if (p.value === null) return;
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    });
    return d;
  });
  const last = $derived(points.findLastIndex((p) => p.value !== null));
</script>

<div class="spark" style:height="{H}px" bind:clientWidth={W}>
  {#if vals.length >= 2}
    <svg width={W} height={H} aria-hidden="true">
      <path d={path} pathLength="1" />
      <circle cx={x(last)} cy={y(points[last].value!)} r="3.5" />
    </svg>
  {/if}
</div>

<style>
  svg {
    display: block;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: var(--axis);
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  circle {
    fill: var(--series, var(--accent));
    stroke: var(--surface);
    stroke-width: 2;
  }
  @media (prefers-reduced-motion: no-preference) {
    path {
      stroke-dasharray: 1;
      animation: draw 900ms cubic-bezier(0.65, 0, 0.35, 1) 200ms both;
    }
    circle {
      animation: pop 360ms cubic-bezier(0.3, 1.6, 0.5, 1) 1000ms both;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
  }
  @keyframes pop {
    from {
      transform: scale(0);
    }
  }
  circle {
    transform-box: fill-box;
    transform-origin: center;
  }
</style>
