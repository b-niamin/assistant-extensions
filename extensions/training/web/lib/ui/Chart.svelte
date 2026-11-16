<script lang="ts">
  import { fmtN, fmtShort } from '../gym';

  /** The progress line of an exercise: grid, the line drawn in, the last point in red with its value. */
  let { pts, locale = 'en' }: { pts: { d: string; v: number }[]; locale?: string } = $props();
  const W = 340, H = 180, pl = 34, pr = 14, pt = 18, pb = 24;
  const P = $derived(pts.length === 1 ? [pts[0], pts[0]] : pts);
  const range = $derived.by(() => {
    const vs = P.map((p) => p.v);
    let mn = Math.min(...vs), mx = Math.max(...vs);
    if (mx - mn < 1) { mn -= 5; mx += 5; }
    const pad = (mx - mn) * 0.15;
    return { mn: Math.max(0, mn - pad), mx: mx + pad };
  });
  const x = (i: number) => pl + (W - pl - pr) * (i / (P.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - range.mn) / (range.mx - range.mn));
  const L = $derived(P.length - 1);
  const line = $derived(P.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' '));
</script>

<svg viewBox="0 0 {W} {H}" aria-hidden="true">
  {#each [range.mn, (range.mn + range.mx) / 2, range.mx] as tk (tk)}
    <line x1={pl} x2={W - pr} y1={y(tk)} y2={y(tk)} stroke="var(--g-line)" />
    <text x={pl - 6} y={y(tk) + 4} text-anchor="end" font-size="11" fill="var(--g-muted)">{Math.round(tk)}</text>
  {/each}
  <path d={line} fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
  {#each P as p, i (i)}
    <circle cx={x(i)} cy={y(p.v)} r={i === L ? 5 : 3.5} fill={i === L ? 'var(--g-red)' : 'var(--g-surface)'} stroke={i === L ? 'var(--g-red)' : 'var(--ink)'} stroke-width="2" />
  {/each}
  <text x={pl} y={H - 5} font-size="11" fill="var(--g-muted)">{fmtShort(P[0].d, locale)}</text>
  <text x={W - pr} y={H - 5} font-size="11" fill="var(--g-muted)" text-anchor="end">{fmtShort(P[L].d, locale)}</text>
  <text x={Math.min(x(L), W - pr)} y={y(P[L].v) - 11} font-size="15" font-weight="600" fill="var(--ink)" text-anchor="end" style:font-family="var(--g-cond)">{fmtN(P[L].v, locale)}</text>
</svg>
