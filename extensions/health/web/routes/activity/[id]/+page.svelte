<script lang="ts">
  import type { DataOf } from '$shell';
  import { Mascot, useT } from '$shell/ui';
  import StreamChart from '../../../lib/StreamChart.svelte';
  import { paceOf, paceText, PACED } from '../../../lib/activity';
  import { hms, km, sportLabel } from '../../../lib/format';
  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();

  const a = $derived(data.activity);
  const x = $derived(data.extras);
  const paced = $derived(PACED.includes(a.sport));
  const moving = $derived(a.moving_s ?? a.duration_s);
  const avgSpeed = $derived(x.avgSpeedMps ?? (a.distance_m && moving ? a.distance_m / moving : null));
  let hover = $state<number | null>(null);

  const when = $derived.by(() => {
    const d = new Date(a.start_time_local.replace(' ', 'T'));
    return Number.isNaN(d.getTime())
      ? a.start_time_local
      : `${d.toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${a.start_time_local.slice(11, 16)}`;
  });

  type Kpi = { label: string; value: string; sub?: string };
  const kpis = $derived.by(() => {
    const out: Kpi[] = [];
    if (a.distance_m) out.push({ label: t('Distance'), value: km(a.distance_m) });
    out.push({ label: t('Time'), value: hms(moving), sub: a.duration_s && moving && a.duration_s - moving > 60 ? t('{time} elapsed', { time: hms(a.duration_s) }) : undefined });
    if (avgSpeed) {
      if (paced) out.push({ label: t('Avg pace'), value: `${paceText(paceOf(avgSpeed))} /km`, sub: x.maxSpeedMps ? t('best {pace}', { pace: paceText(paceOf(x.maxSpeedMps)) }) : undefined });
      else out.push({ label: t('Avg speed'), value: `${(avgSpeed * 3.6).toFixed(1)} km/h`, sub: x.maxSpeedMps ? t('max {v}', { v: (x.maxSpeedMps * 3.6).toFixed(1) }) : undefined });
    }
    if (a.avg_hr) out.push({ label: t('Avg heart rate'), value: `${a.avg_hr} bpm`, sub: a.max_hr ? t('max {v}', { v: a.max_hr }) : undefined });
    if (a.avg_power) out.push({ label: t('Avg power'), value: `${a.avg_power} W`, sub: a.norm_power ? `NP ${a.norm_power} W` : a.max_power ? t('max {v}', { v: a.max_power }) : undefined });
    if (a.elevation_gain_m) out.push({ label: t('Elevation gain'), value: `${Math.round(a.elevation_gain_m)} m`, sub: x.elevationLossM ? t('loss {m} m', { m: Math.round(x.elevationLossM) }) : undefined });
    if (x.avgCadence) out.push({ label: t('Cadence'), value: `${Math.round(x.avgCadence)} ${a.sport.includes('cycling') ? 'rpm' : 'spm'}` });
    if (a.calories) out.push({ label: t('Calories'), value: `${a.calories.toLocaleString(t.locale)} kcal` });
    if (a.training_load != null) out.push({ label: t('Training load'), value: String(Math.round(a.training_load)) });
    if (x.aerobicEffect != null)
      out.push({
        label: t('Training effect'),
        value: t('{v} aerobic', { v: x.aerobicEffect.toFixed(1) }),
        sub: x.anaerobicEffect != null ? t('{v} anaerobic', { v: x.anaerobicEffect.toFixed(1) }) : undefined
      });
    return out;
  });

  const effect = $derived(x.effectLabel ? t(x.effectLabel.toLowerCase().replace(/_/g, ' ')) : null);
  const lapPace = (mps?: number) => (mps ? (paced ? paceText(paceOf(mps)) : `${(mps * 3.6).toFixed(1)}`) : '–');
</script>

<svelte:head><title>{a.name ?? t(sportLabel(a.sport))} · {t('Training & Health')}</title></svelte:head>

<nav class="crumbs" aria-label={t('Activity navigation')}>
  <a href="/health">{t('Training & Health')}</a>
  <span class="step">
    {#if data.prev}<a href="/health/activity/{data.prev}" rel="prev">{t('Older')}</a>{/if}
    {#if data.next}<a href="/health/activity/{data.next}" rel="next">{t('Newer')}</a>{/if}
  </span>
</nav>

<header class="head rise">
  <div class="beni"><Mascot mood="charged" size={64} label={t('Beni in a sweatband')} /></div>
  <div class="title">
    <p class="eyebrow">{t(sportLabel(a.sport))}{x.location ? ` · ${x.location}` : ''}</p>
    <h1>{a.name ?? t(sportLabel(a.sport))}</h1>
    <p class="muted when">{when}</p>
  </div>
</header>

<section class="kpis" aria-label={t('Summary')}>
  {#each kpis as k, i (k.label)}
    <div class="card kpi rise" style:--i={i + 1}>
      <span class="eyebrow">{k.label}</span>
      <strong class="num">{k.value}</strong>
      {#if k.sub}<span class="sub">{k.sub}</span>{/if}
    </div>
  {/each}
</section>

{#if effect}
  <p class="effect"><span class="status good">{effect}</span> <span class="muted">{t("Garmin's read of what this session trained")}</span></p>
{/if}

<div class="grid" class:withmap={!!data.streams.route}>
  {#if data.streams.route}
    {@const r = data.streams.route}
    <section class="card route rise" style:--i="3" aria-labelledby="route-title">
      <h2 id="route-title">{t('Route')}</h2>
      <svg viewBox="-20 -20 {r.width + 40} {r.height + 40}" role="img" aria-label={t('Route of the activity, drawn from its GPS track')}>
        <path class="track-casing" d={r.d} />
        <path class="track" d={r.d} />
        <circle class="start" cx={r.start[0]} cy={r.start[1]} r="14" />
        <circle class="end" cx={r.end[0]} cy={r.end[1]} r="14" />
      </svg>
      <p class="legend"><span class="dot start"></span>{t('Start')} <span class="dot end"></span>{t('Finish')}</p>
    </section>
  {/if}

  {#if data.streams.series.length}
    <section class="card charts rise" style:--i="4" aria-labelledby="charts-title">
      <h2 id="charts-title">{t('Over time')}</h2>
      {#each data.streams.series as s (s.key)}
        <StreamChart time={data.streams.time} series={s} bind:hover />
      {/each}
    </section>
  {:else}
    <section class="card charts empty rise" style:--i="4">
      <Mascot mood="idle" size={56} />
      <p class="muted">{t('No heart rate, pace or GPS samples for this activity yet. Details are fetched with the next sync.')}</p>
    </section>
  {/if}
</div>

{#if data.laps.length > 1}
  <section class="card rise" style:--i="5" aria-labelledby="laps-title">
    <h2 id="laps-title">{t('Laps')}</h2>
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th>{t('Lap')}</th>
            <th class="r">{t('Distance')}</th>
            <th class="r">{t('Time')}</th>
            <th class="r">{paced ? t('Pace') : t('Speed')}</th>
            <th class="r">{t('Avg HR')}</th>
            {#if data.laps.some((l) => l.avgPower)}<th class="r">{t('Power')}</th>{/if}
            <th class="r">{t('Elev. gain')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.laps as l (l.index)}
            <tr>
              <td>{l.index}</td>
              <td class="r">{l.distanceM ? km(l.distanceM) : '–'}</td>
              <td class="r">{hms(l.durationS ?? null)}</td>
              <td class="r">{lapPace(l.avgSpeedMps)}{l.avgSpeedMps ? (paced ? ' /km' : ' km/h') : ''}</td>
              <td class="r">{l.avgHr ? Math.round(l.avgHr) : '–'}</td>
              {#if data.laps.some((x) => x.avgPower)}<td class="r">{l.avgPower ? `${Math.round(l.avgPower)} W` : '–'}</td>{/if}
              <td class="r">{l.elevationGainM ? `${Math.round(l.elevationGainM)} m` : '–'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

{#if data.journal}
  <section class="card rise" style:--i="6" aria-labelledby="journal-title">
    <h2 id="journal-title">{t('How it felt')}</h2>
    <dl class="journal">
      {#if data.journal.rpe != null}<div><dt>{t('Effort (RPE)')}</dt><dd>{data.journal.rpe}/10</dd></div>{/if}
      {#if data.journal.soreness != null}<div><dt>{t('Soreness')}</dt><dd>{data.journal.soreness}/10</dd></div>{/if}
      {#if data.journal.mood != null}<div><dt>{t('Mood')}</dt><dd>{data.journal.mood}/5</dd></div>{/if}
    </dl>
    {#if data.journal.note}<p>{data.journal.note}</p>{/if}
  </section>
{/if}

<style>
  .crumbs {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    font-size: 0.875rem;
  }
  .crumbs > a::before {
    content: '← ';
  }
  .step {
    display: flex;
    gap: var(--space-4);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }
  .beni {
    flex: none;
  }
  .title {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .title p,
  .title h1 {
    margin: 0;
  }
  .when {
    font-size: 0.875rem;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .kpi {
    display: grid;
    gap: 2px;
    padding: var(--space-4);
  }
  .kpi strong {
    font-size: 1.375rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .sub {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .effect {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: baseline;
    margin: 0 0 var(--space-4);
    font-size: 0.875rem;
  }
  .effect .status {
    font-weight: 600;
    text-transform: capitalize;
  }
  .grid {
    display: grid;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .grid.withmap {
    grid-template-columns: minmax(260px, 2fr) 3fr;
    align-items: start;
  }
  section > h2 {
    margin-bottom: var(--space-4);
  }
  .withmap .route {
    position: sticky;
    top: var(--space-4);
  }
  .route svg {
    display: block;
    width: 100%;
    max-height: 420px;
  }
  .track,
  .track-casing {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .track-casing {
    stroke: var(--surface);
    stroke-width: 7;
  }
  .track {
    stroke: var(--hue-orange);
    stroke-width: 3;
  }
  circle.start,
  .dot.start {
    fill: var(--good);
    background: var(--good);
  }
  circle.end,
  .dot.end {
    fill: var(--ink);
    background: var(--ink);
  }
  circle {
    stroke: var(--surface);
    stroke-width: 4;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: var(--space-2) 0 0;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .dot.end {
    margin-left: var(--space-2);
  }
  .charts {
    display: grid;
    gap: var(--space-4);
  }
  .charts > h2 {
    margin-bottom: 0;
  }
  .charts.empty {
    grid-template-columns: auto 1fr;
    align-items: center;
  }
  .charts.empty p {
    margin: 0;
  }
  .tablewrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--grid);
    white-space: nowrap;
  }
  th:first-child,
  td:first-child {
    padding-left: 0;
  }
  th:last-child,
  td:last-child {
    padding-right: 0;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  th {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ink-3);
    border-bottom-color: var(--axis);
  }
  .r {
    text-align: right;
  }
  .journal {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    margin: 0 0 var(--space-3);
  }
  .journal dt {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .journal dd {
    margin: 0;
    font-weight: 600;
  }
  section.card {
    margin-bottom: var(--space-3);
  }
  @media (max-width: 760px) {
    .grid.withmap {
      grid-template-columns: 1fr;
    }
    .withmap .route {
      position: static;
    }
    .head {
      gap: var(--space-3);
    }
  }
</style>
