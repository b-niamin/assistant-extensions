<script lang="ts">
  import { useT } from '$shell/ui';
  import { fmtN } from '../gym';
  import { MUSCLES, type Muscle } from '../library';
  import BodyMap from './BodyMap.svelte';

  /** Sets per muscle: the body map and the top muscles with bars. */
  let { load, empty }: { load: Partial<Record<Muscle, number>>; empty: string } = $props();
  const t = useT();
  const rows = $derived((Object.entries(load) as [Muscle, number][]).sort((a, b) => b[1] - a[1]));
  const max = $derived(rows[0]?.[1] ?? 1);
  const scores = $derived(Object.fromEntries(rows.map(([k, v]) => [k, v / max])));
</script>

{#if !rows.length}
  <div class="muted small">{empty}</div>
{:else}
  <div class="map-wrap">
    <BodyMap {scores} />
    <div class="mlist">
      {#each rows.slice(0, 7) as [k, v], i (k)}
        <div class="mrow"><span>{t(MUSCLES[k])}</span><b>{fmtN(v, t.locale)}</b><div class="bar"><i style:width="{Math.round((v / max) * 100)}%" style:animation-delay="{i * 50}ms"></i></div></div>
      {/each}
      <div class="muted wide" style:font-size="var(--text-xs)" style:margin-top="6px">{t('Number of sets; helping muscles count half a set.')}</div>
    </div>
  </div>
{/if}
