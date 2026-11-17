<script lang="ts">
  import { useT } from '$shell/ui';
  import { getContext } from 'svelte';
  import { fmtN, fmtSec, fmtShort, historyOf, imageOf, OWN_PHOTOS, photoUrl, restFor, setsText, type Logged, type Metric } from '../gym';
  import { MUSCLES, type LibraryEntry } from '../library';
  import type { Unit } from '../model';
  import BodyMap from './BodyMap.svelte';
  import Chart from './Chart.svelte';

  /**
   * An exercise in full, as the gym log showed it: your progress (last, record, change, chart, sessions),
   * how the movement looks (two photos, animated), the muscles on the body, how to do it, what to avoid.
   */
  let {
    entry,
    name,
    keyId,
    history,
    action
  }: {
    entry?: LibraryEntry;
    name: string;
    keyId: string;
    history: Logged[];
    action?: { label: string; run: () => void } | null;
  } = $props();
  const t = useT();
  const unit: Unit = $derived(entry?.unit ?? 'reps');
  const rows = $derived(historyOf(history, keyId));
  const timed = $derived(unit !== 'reps' || rows.every((x) => !x.maxKg));
  const metrics = $derived<[Metric, string][]>(
    timed
      ? [['maxR', unit !== 'reps' ? t('Longest') : t('Most reps')], ['sumR', unit !== 'reps' ? t('Total time') : t('Total reps')]]
      : [['e1rm', '1RM'], ['maxKg', t('Max kg')], ['vol', t('Volume')]]
  );
  let picked = $state<Metric | null>(null);
  const metric = $derived(metrics.find((m) => m[0] === picked)?.[0] ?? metrics[0][0]);
  const secs = $derived(unit !== 'reps' && (metric === 'maxR' || metric === 'sumR'));
  const fm = (v: number) => (secs ? fmtSec(v) : fmtN(v, t.locale) + (metric === 'vol' || metric === 'maxR' || metric === 'sumR' ? '' : ' kg'));
  const first = $derived(rows[0]);
  const last = $derived(rows[rows.length - 1]);
  const best = $derived(rows.reduce((a, x) => (x[metric] > a[metric] ? x : a), rows[0]));
  const diff = $derived(last && first ? last[metric] - first[metric] : 0);
  const delta = (d: number) => (secs ? (d < 0 ? '−' : '') + fmtSec(Math.abs(d)) : fmtN(d, t.locale));
  let paused = $state(false);
  const own = getContext<(() => Record<string, string>) | undefined>(OWN_PHOTOS);
  const pic = (frame: 0 | 1) => (entry?.photo ? photoUrl(entry.photo, frame) : imageOf(entry?.id, frame, own?.()));
  const shown = $derived(t(name));
  const scores = $derived(Object.fromEntries([...(entry?.also ?? []).map((m) => [m, 0.38]), ...(entry?.muscles ?? []).map((m) => [m, 1])]));
  const credit = $derived(
    entry?.id === 'halo' || entry?.id === 'kbpass' || entry?.id === 'birddog'
      ? t('A schematic drawing. Tap to stop it.')
      : t('Photos: Free Exercise DB (public domain). Tap the animation to stop it.')
  );
</script>

<div class="det">
  <h2>{shown}</h2>
  <div class="alt">{entry?.custom || !entry ? t('Your own exercise') : shown !== name ? name : ''}</div>

  {#if entry?.kind !== 'cardio'}
    <h3>{t('Your progress')}</h3>
    {#if !rows.length}
      <p class="muted">{t('You have not done this exercise yet. Progress shows up after the first workout.')}</p>
    {:else}
      <div class="mystats">
        <div><b>{fm(last[metric])}</b><span>{t('last time')}</span></div>
        <div><b>{fm(best[metric])}</b><span>{t('record, {day}', { day: fmtShort(best.day, t.locale) })}</span></div>
        <div><b class:up={diff > 0.05} class:dn={diff < -0.05}>{diff > 0.05 ? '+' : ''}{delta(diff)}</b><span>{t('since {day}', { day: fmtShort(first.day, t.locale) })}</span></div>
      </div>
      <div class="segmented full" style:margin-top="10px">
        {#each metrics as [m, l] (m)}<button type="button" aria-pressed={metric === m} onclick={() => (picked = m)}>{l}</button>{/each}
      </div>
      <div class="chart">
        {#if rows.length > 1}<Chart pts={rows.map((x) => ({ d: x.day, v: x[metric] }))} locale={t.locale} />{:else}<p class="muted small" style:margin="4px 0 8px">{t('The chart shows up after the second session of this exercise.')}</p>{/if}
      </div>
      <div style:margin-top="6px">
        {#each rows.slice(-8).reverse() as x, i (x.day + i)}
          {@const k = rows.length - 1 - i}
          {@const d = k > 0 ? x[metric] - rows[k - 1][metric] : null}
          <div class="pg-row">
            <span class="d">{fmtShort(x.day, t.locale)}</span><span class="v">{setsText(x.all, x.unit, t.locale)}</span>
            {#if d === null}<span class="delta">{t('start')}</span>{:else}<span class="delta" class:up={d > 0.05} class:dn={d < -0.05}>{d > 0.05 ? '+' : ''}{Math.abs(d) < 0.05 ? '=' : delta(d)}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if entry && pic(0)}
    <h3>{t('How the movement looks')}</h3>
    <button type="button" class="demo" class:paused aria-label={t('Stop or resume the animation')} onclick={() => (paused = !paused)}>
      <img src={pic(0)} alt={t('{name}: start position', { name: shown })} />
      <img class="b" src={pic(1)} alt={t('{name}: end of the movement', { name: shown })} />
      <span class="lab"><i class="l1">{t('Start position')}</i><i class="l2">{t('End of the movement')}</i></span>
    </button>
    <div class="credit">{credit}</div>
  {/if}
  {#if entry?.muscles?.length}
    <div class="map-box">
      <BodyMap {scores} />
      <div class="legend">
        <div><span class="k"></span><b>{t('Main')}</b><br />{entry.muscles.map((m) => t(MUSCLES[m])).join(', ')}</div>
        {#if entry.also?.length}<div><span class="k" style:opacity=".45"></span><b>{t('Helping')}</b><br />{entry.also.map((m) => t(MUSCLES[m])).join(', ')}</div>{/if}
        {#if entry.unit !== 'minutes'}<div class="muted">{t('Rest: {time}', { time: fmtSec(restFor(entry.id)) })}</div>{/if}
      </div>
    </div>
  {/if}
  {#if entry?.description}
    <h3>{t('How to do it')}</h3>
    <p>{t(entry.description)}</p>
  {/if}
  {#if entry?.cautions?.length}
    <h3>{t('What to avoid')}</h3>
    <ul class="avoid">{#each entry.cautions as c (c)}<li>{t(c)}</li>{/each}</ul>
  {/if}
  {#if action}
    <div style:margin-top="18px"><button type="button" class="btn-primary btn-lg btn-block" onclick={action.run}>{action.label}</button></div>
  {/if}
</div>
