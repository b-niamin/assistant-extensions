<script lang="ts">
  import { useT } from '$shell/ui';
  import { BODY } from '../body';

  /** The body, front and back, with muscles filled by score 0-1 (colour per muscle, red by default). */
  let { scores, colors = {} }: { scores: Record<string, number>; colors?: Record<string, string> } = $props();
  const t = useT();
  const fill = (m: string | null) => {
    const v = m ? scores[m] || 0 : 0;
    return v > 0 ? (colors[m!] ?? 'var(--g-red)') : m ? 'var(--g-body)' : 'var(--g-body-2)';
  };
  const opacity = (m: string | null) => {
    const v = m ? scores[m] || 0 : 0;
    return v > 0 ? (0.25 + 0.75 * Math.min(1, v)).toFixed(2) : undefined;
  };
</script>

<svg viewBox="0 0 216 214" role="img" aria-label={t('A body with the muscles that work marked')}>
  {#each [['f', 0], ['b', 116]] as [side, dx] (side)}
    <g transform="translate({dx} 0)">
      {#each BODY[side as 'f' | 'b'] as [m, pts], i (i)}
        {#each pts as pt, j (j)}<polygon points={pt} fill={fill(m)} fill-opacity={opacity(m)} />{/each}
      {/each}
    </g>
  {/each}
  <text x="50" y="211" text-anchor="middle" font-size="9" fill="var(--g-muted)">{t('front')}</text>
  <text x="166" y="211" text-anchor="middle" font-size="9" fill="var(--g-muted)">{t('back')}</text>
</svg>
