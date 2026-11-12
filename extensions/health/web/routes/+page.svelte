<script lang="ts">
  import { goto } from '$app/navigation';
  import { scaledTicks, type DataOf } from '$shell';
  import { countUp, LineChart, lineFor, Mascot, moodFor, saveOnChoose, Sparkline, todayIn, useT } from '$shell/ui';
  import MetricIcon from '../lib/MetricIcon.svelte';
  import { hueOf } from '../lib/look';
  import { formatValue, METRICS, specOf, type MetricSpec } from '../lib/metrics';
  import { ago, daysBetween, deltaVsBaseline, readinessLevel, shortDay } from '../lib/stats';
  import { hms, km, pace, sportLabel } from '../lib/format';

  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();

  const today = todayIn();

  /** The sync pill: green only for a recent good pass; a partial one is yellow, an old one red. */
  const SYNC_OLD_MS = 6 * 3600_000;
  const pill = $derived.by(() => {
    const r = data.sync.lastRun;
    if (!r) return null;
    const at = r.finished_at ?? r.started_at;
    const when = ago(at, undefined, t);
    if (r.status === 'running') return { tone: 'warning', text: t('Garmin syncing, started {when}', { when: ago(r.started_at, undefined, t) }) };
    if (r.status === 'failed') return { tone: 'critical', text: t('Garmin sync failed {when}', { when }) };
    if (Date.now() - new Date(at).getTime() > SYNC_OLD_MS) return { tone: 'critical', text: t('Last Garmin sync {when}', { when }) };
    if (r.status === 'partial') return { tone: 'warning', text: t('Garmin synced {when}, some data skipped', { when }) };
    return { tone: 'good', text: t('Garmin synced {when}', { when }) };
  });
  const PACED = ['running', 'trail_running', 'treadmill_running', 'walking', 'hiking'];

  const reading = (key: string) => data.latest.find((r) => r.key === key);
  const spec = $derived(specOf(data.metric)!);
  const fmt = (v: number | null) => formatValue(spec, v, t.locale);
  const tick = (v: number) => (spec.format === 'duration' ? `${+(v / 3600).toFixed(1)}h` : v.toLocaleString(t.locale));

  const readiness = $derived(reading('training_readiness'));
  const level = $derived(readinessLevel(readiness?.value ?? null));
  const mood = $derived(moodFor(readiness?.value));
  const pipSays = $derived(t(lineFor(mood, today)));

  const stats = $derived.by(() => {
    const vals = data.series.map((p) => p.value).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      n: vals.length
    };
  });

  /** The whole row opens the activity; the name is the real link (keyboard, middle click). */
  function open(e: MouseEvent, id: string) {
    if ((e.target as HTMLElement).closest('a') || e.metaKey || e.ctrlKey) return;
    goto(`/health/activity/${id}`);
  }

  const maxLoad = $derived(Math.max(1, ...data.activities.map((a) => a.training_load ?? 0)));

  function diffText(s: MetricSpec, diff: number): string {
    const sign = diff > 0 ? '+' : '−';
    const abs = Math.abs(diff);
    if (s.format === 'duration') {
      const m = Math.round(abs / 60);
      return `${sign}${m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`}`;
    }
    return `${sign}${Math.round(abs).toLocaleString(t.locale)}`;
  }
  const asOf = (day: string | null | undefined) =>
    !day ? t('no recent data') : daysBetween(day, today) > 1 ? t('as of {day}', { day: shortDay(day, false, t.locale) }) : '';
</script>

<svelte:head><title>{t('Training & Health')} · Assistant</title></svelte:head>

{#snippet delta(s: MetricSpec, key: string)}
  {@const d = deltaVsBaseline(s, data.trends[key] ?? [])}
  {#if d}
    <span class="delta {d.tone}">
      <span aria-hidden="true">{d.tone === 'flat' ? '→' : d.diff > 0 ? '↑' : '↓'}</span>
      {d.tone === 'flat' ? t('steady') : diffText(s, d.diff)}
      <span class="vs">{t('vs 7-day avg')}</span>
    </span>
  {/if}
{/snippet}

<div class="pagehead">
  <div>
    <p class="eyebrow">{new Date().toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1>{t('Training & Health')}</h1>
  </div>
  {#if pill}
    <a class="sync status {pill.tone}" href="/settings/extensions/health">{pill.text}</a>
  {:else}
    <a class="sync status" href="/settings/extensions/health">{t('Garmin not synced yet')}</a>
  {/if}
</div>

<section class="overview" aria-label={t('Latest readings')}>
  <div
    class="card hero rise"
    class:current={data.metric === 'training_readiness'}
    style:--series={hueOf('training_readiness')}
  >
    <a class="eyebrow stretch" data-sveltekit-noscroll data-sveltekit-replacestate href="?metric=training_readiness&days={data.days}" aria-current={data.metric === 'training_readiness' ? 'true' : undefined}>{t('Training readiness')}</a>
    <div class="heroline">
      <strong class="heronum" use:countUp={readiness?.value ?? null}>{readiness?.value == null ? '–' : Math.round(readiness.value)}</strong>
      {#if level}<span class="status {level.tone} level">{t(level.label)}</span>{/if}
    </div>
    {@render delta(specOf('training_readiness')!, 'training_readiness')}
    <div class="pipline">
      <div class="pipwrap"><Mascot {mood} size={76} label={t('Beni says: {line}', { line: pipSays })} /></div>
      <p class="bubble">{pipSays}</p>
    </div>
    <Sparkline values={(data.trends['training_readiness'] ?? []).map((p) => p.value)} height={48} />
    <span class="meta">{t('Last 14 days')} {asOf(readiness?.day) ? `· ${asOf(readiness?.day)}` : ''}</span>
  </div>

  <div class="tiles">
    {#each data.tiles as key, i}
      {@const s = specOf(key)!}
      {@const r = reading(key)}
      <a
        class="card tile rise"
        data-sveltekit-noscroll
        data-sveltekit-replacestate
        href="?metric={key}&days={data.days}"
        aria-current={key === data.metric ? 'true' : undefined}
        style:--i={i + 1}
        style:--series={hueOf(key)}
      >
        <span class="tilehead"><MetricIcon metric={key} size={26} /><span class="eyebrow">{t(s.label)}</span></span>
        <strong class="value">{formatValue(s, r?.value ?? null, t.locale)}</strong>
        {@render delta(s, key)}
        <Sparkline values={(data.trends[key] ?? []).map((p) => p.value)} />
        {#if asOf(r?.day)}<span class="meta">{asOf(r?.day)}</span>{/if}
      </a>
    {/each}
  </div>
</section>

<section class="card trend rise" style:--i="7" style:--series={hueOf(data.metric)} aria-labelledby="trend-title">
  <div class="toolbar">
    <form method="GET" use:saveOnChoose data-sveltekit-noscroll data-sveltekit-replacestate>
      <label>
        <span class="sr">{t('Metric')}</span>
        <select name="metric">
          {#each METRICS as m}
            <option value={m.key} selected={m.key === data.metric}>{t(m.label)}</option>
          {/each}
        </select>
      </label>
      <input type="hidden" name="days" value={data.days} />
      <noscript><button class="btn">{t('Show')}</button></noscript>
    </form>
    <nav class="segmented" aria-label={t('Range')}>
      {#each data.ranges as r}
        <a data-sveltekit-noscroll data-sveltekit-replacestate href="?metric={data.metric}&days={r}" aria-current={r === data.days ? 'true' : undefined}>{r === 365 ? t('1 y') : t('{n} d', { n: r })}</a>
      {/each}
    </nav>
  </div>

  <div class="trendhead">
    <h2 id="trend-title"><MetricIcon metric={data.metric} size={30} />{t(spec.label)}<span class="muted">· {data.days === 365 ? t('last year') : t('last {n} days', { n: data.days })}</span></h2>
    {#if stats}
      <dl class="summary">
        <div><dt>{t('Average')}</dt><dd>{fmt(stats.avg)}</dd></div>
        <div><dt>{t('Low')}</dt><dd>{fmt(stats.min)}</dd></div>
        <div><dt>{t('High')}</dt><dd>{fmt(stats.max)}</dd></div>
        <div><dt>{t('Days with data')}</dt><dd>{stats.n}/{data.series.length}</dd></div>
      </dl>
    {/if}
  </div>

  {#key `${data.metric}-${data.days}`}
    <LineChart
      labels={data.series.map((p) => p.day)}
      series={[{ label: t(spec.label), values: data.series.map((p) => p.value) }]}
      format={fmt}
      {tick}
      label={t(spec.label)}
      column={t('Day')}
      xLabel={(day, long) => shortDay(day, long, t.locale)}
      ticks={spec.format === 'duration' ? (lo, hi) => scaledTicks(lo, hi, 3600) : undefined}
      height={260}
      pad={{ left: 44, right: 56 }}
    />
  {/key}
</section>

<section class="card rise" style:--i="8" aria-labelledby="act-title">
  <h2 id="act-title">{t('Recent activities')}</h2>
  {#if data.activities.length === 0}
    <p class="muted">{t('No activities synced yet.')}</p>
  {:else}
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th>{t('Date')}</th>
            <th>{t('Activity')}</th>
            <th class="r">{t('Distance')}</th>
            <th class="r">{t('Time')}</th>
            <th class="r">{t('Pace')}</th>
            <th class="r">{t('Avg HR')}</th>
            <th class="loadcol">{t('Training load')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.activities as a}
            <tr class="link" onclick={(e) => open(e, a.activity_id)}>
              <td class="date">
                {shortDay(a.start_time_local, a.start_time_local.slice(0, 4) !== today.slice(0, 4), t.locale)}
                <span class="muted">{a.start_time_local.slice(11, 16)}</span>
              </td>
              <td>
                <a class="name" href="/health/activity/{a.activity_id}">{a.name ?? t(sportLabel(a.sport))}</a>
                <span class="sport">{t(sportLabel(a.sport))}</span>
              </td>
              <td class="r">{a.distance_m ? km(a.distance_m, t.locale) : '–'}</td>
              <td class="r">{hms(a.duration_s)}</td>
              <td class="r">{PACED.includes(a.sport) ? (pace(a.distance_m, a.duration_s) ?? '–') : '–'}</td>
              <td class="r">{a.avg_hr ?? '–'}</td>
              <td class="loadcol">
                {#if a.training_load != null}
                  <div class="loadcell">
                    <span class="load">
                      <span class="bar" style:width="{(a.training_load / maxLoad) * 100}%"></span>
                    </span>
                    <span class="loadnum">{Math.round(a.training_load)}</span>
                  </div>
                {:else}–{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

{#if !data.sync.connected || data.sync.lastRun?.error}
  <section class="card notice" aria-labelledby="sync-title">
    <h2 id="sync-title">{t('Garmin sync')}</h2>
    {#if !data.sync.connected}
      <p>{t('Not connected yet.')} <a href="/settings/extensions/health">{t('Connect Garmin in System settings')}</a>.</p>
    {/if}
    {#if data.sync.lastRun?.error}
      <p class="status critical">{data.sync.lastRun.error} · <a href="/settings/extensions/health">{t('Sync settings')}</a></p>
    {/if}
  </section>
{/if}

<style>
  .pagehead {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
  .pagehead p {
    margin: 0 0 var(--space-1);
  }
  .sync {
    font-size: 0.8125rem;
    color: var(--ink-2);
    text-decoration: none;
  }
  .sync:hover {
    color: var(--ink);
  }

  /* Overview: one hero figure, then a row of stat tiles. */
  .overview {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 3fr;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }
  .hero,
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-4);
    color: var(--ink);
    text-decoration: none;
    transition:
      border-color 120ms,
      transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 200ms;
  }
  @media (prefers-reduced-motion: no-preference) {
    .hero:hover,
    .tile:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
    }
  }
  .hero {
    padding: var(--space-5);
    gap: var(--space-2);
    background:
      radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--brand) 16%, transparent), transparent 60%),
      var(--surface);
  }
  .pipline {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-2) 0 var(--space-1);
  }
  .hero {
    position: relative;
  }
  .stretch {
    color: inherit;
    text-decoration: none;
  }
  .stretch::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .stretch:focus-visible {
    outline: none;
  }
  .stretch:focus-visible::after {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .pipwrap {
    position: relative;
    z-index: 1;
    flex: none;
    margin-left: -6px;
  }
  .bubble {
    position: relative;
    flex: 1;
    margin: 0;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--brand) 12%, var(--surface));
    font-size: 0.875rem;
    color: var(--ink);
  }
  .bubble::before {
    content: '';
    position: absolute;
    left: -5px;
    top: calc(50% - 6px);
    width: 12px;
    height: 12px;
    transform: rotate(45deg);
    background: inherit;
    border-radius: 2px;
  }
  .tilehead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .tile .value + :global(*) {
    margin-bottom: var(--space-2);
  }
  .hero:hover,
  .tile:hover {
    border-color: var(--axis);
  }
  .hero.current,
  .tile[aria-current='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .heroline {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }
  .heronum {
    font-size: 4rem;
    line-height: 1;
    font-weight: 650;
    letter-spacing: -0.03em;
  }
  .level {
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .value {
    font-size: 1.625rem;
    line-height: 1.15;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .delta {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink-2);
  }
  .delta.good {
    color: var(--good-ink);
  }
  .delta.bad {
    color: var(--critical);
  }
  .delta .vs {
    font-weight: 400;
    color: var(--ink-3);
  }
  .meta {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .hero :global(.spark),
  .tile :global(.spark) {
    margin-top: auto;
  }

  /* Trend */
  .trend {
    margin-bottom: var(--space-3);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .toolbar form {
    margin: 0;
  }
  .trendhead {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3) var(--space-5);
    margin-bottom: var(--space-4);
  }
  .trendhead h2 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 1.125rem;
  }
  .trendhead h2 .muted {
    font-weight: 400;
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    margin: 0;
  }
  .summary dt {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .summary dd {
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* Activities */
  section > h2 {
    margin-bottom: var(--space-4);
  }
  .tablewrap {
    overflow-x: auto;
    margin: 0 calc(-1 * var(--space-5));
    padding: 0 var(--space-5);
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
    padding: 10px 12px;
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
  .date .muted {
    margin-left: 4px;
  }
  .name {
    font-weight: 600;
    color: var(--ink);
    text-decoration: none;
  }
  tr.link {
    cursor: pointer;
  }
  tr.link:hover .name {
    color: var(--accent-ink);
    text-decoration: underline;
  }
  .sport {
    display: block;
    font-weight: 400;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .loadcol {
    width: 180px;
  }
  .loadcell {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .load {
    flex: 1;
    height: 8px;
    min-width: 60px;
  }
  .bar {
    display: block;
    height: 100%;
    border-radius: 0 4px 4px 0;
    background: var(--hue-orange);
    transform-origin: left;
  }
  @media (prefers-reduced-motion: no-preference) {
    .bar {
      animation: grow 700ms cubic-bezier(0.16, 1, 0.3, 1) 500ms both;
    }
    tbody tr:nth-child(2) .bar { animation-delay: 560ms; }
    tbody tr:nth-child(3) .bar { animation-delay: 620ms; }
    tbody tr:nth-child(4) .bar { animation-delay: 680ms; }
    tbody tr:nth-child(5) .bar { animation-delay: 740ms; }
    tbody tr:nth-child(n + 6) .bar { animation-delay: 800ms; }
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  tbody tr {
    transition: background 120ms;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  .loadnum {
    min-width: 2.5ch;
    text-align: right;
    font-weight: 600;
  }

  .notice {
    margin-top: var(--space-3);
  }
  .notice p {
    margin: 0;
  }

  @media (max-width: 760px) {
    .overview {
      grid-template-columns: 1fr;
    }
    .tiles {
      grid-template-columns: repeat(2, 1fr);
    }
    .heronum {
      font-size: 3.25rem;
    }
  }
</style>
