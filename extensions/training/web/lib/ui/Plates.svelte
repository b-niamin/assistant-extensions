<script lang="ts">
  import { useT } from '$shell/ui';
  import { fmtN, plateMath, PLATES } from '../gym';

  /** The plate calculator: plates on each side of the bar for a weight; can fill the empty sets. */
  let { kg = $bindable(60), onuse }: { kg?: number; onuse?: (kg: number) => void } = $props();
  const t = useT();
  let bar = $state(20);
  let text = $state(fmtN(kg, t.locale));
  const r = $derived(plateMath(kg, bar));
  const color = (p: number) => PLATES.find((x) => x[0] === p)!;
  const drawn = $derived.by(() => {
    let x = 150;
    return r.out.map((p) => {
      const [, c, h] = color(p);
      const w = p >= 10 ? 14 : p >= 2.5 ? 10 : 7;
      const out = { x, w, h, c };
      x += w + 2;
      return out;
    });
  });
  const width = $derived(drawn.length ? drawn[drawn.length - 1].x + drawn[drawn.length - 1].w + 2 : 150);
  const exact = $derived(kg - Math.max(0, r.rest) * 2);
</script>

<label class="small muted" for="plKg">{t('Total weight (kg)')}</label>
<input id="plKg" inputmode="decimal" bind:value={text} oninput={() => (kg = parseFloat(text.replace(',', '.')) || 0)} style:margin="4px 0 12px" />
<div class="small muted" style:margin-bottom="4px">{t('Bar')}</div>
<div class="segmented full">
  {#each [20, 15, 10, 0] as b (b)}<button type="button" aria-pressed={bar === b} onclick={() => (bar = b)}>{b ? `${b} kg` : t('no bar')}</button>{/each}
</div>
<div class="barbell">
  <svg viewBox="0 0 {Math.max(width + 30, 220)} 120" aria-hidden="true">
    <rect x="10" y="56" width={Math.max(width + 20, 200) - 10} height="8" rx="3" fill="var(--ink-4)" />
    <rect x="132" y="48" width="14" height="24" rx="2" fill="var(--ink-3)" />
    {#each drawn as d, i (i)}<rect x={d.x} y={60 - d.h / 2} width={d.w} height={d.h} rx="2" fill={d.c} stroke="rgba(27,33,48,.25)" />{/each}
  </svg>
</div>
{#if kg < bar}
  <p class="muted">{t('The weight is less than the bar alone.')}</p>
{:else if r.out.length}
  <div class="small muted">{t('On each side:')}</div>
  <div class="platelist">{#each r.out as p, i (i)}<span class:light={p === 5 || p === 0.5} style:background={color(p)[1]}>{String(p).replace('.', ',')}</span>{/each}</div>
{:else}
  <p class="muted">{t('Just the bar, no plates.')}</p>
{/if}
{#if r.rest > 0.001}<p class="small" style:margin-top="10px">{t('{missing} kg short of the exact weight. Closest: {closest} kg.', { missing: fmtN(r.rest * 2, t.locale), closest: fmtN(exact, t.locale) })}</p>{/if}
{#if onuse}<button type="button" class="btn-primary btn-lg btn-block" style:margin-top="14px" onclick={() => onuse(Math.round(exact * 100) / 100)}>{t('Put {kg} kg in the empty sets', { kg: fmtN(exact, t.locale) })}</button>{/if}
