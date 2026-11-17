<script lang="ts">
  import { onMount } from 'svelte';
  import type { DataOf } from '$shell';
  import { EmptyState, Icon, PageHead, Sheet, useT, mascotName } from '$shell/ui';
  import { ago, mascotMood } from '../lib/board';
  import ForecastChart from '../lib/ForecastChart.svelte';
  import { Live, shownEvents } from '../lib/live.svelte';
  import { condition, hhmm, periods, summary } from '../lib/weather';
  import WeatherIcon from '../lib/WeatherIcon.svelte';
  import type { load } from './+page.server';

  /** The house at a glance in the app's own look (Assistant UI); the calm monochrome board is /home/eink. */
  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();
  // svelte-ignore state_referenced_locally
  const live = new Live(data.snapshot);
  onMount(() => live.start());

  const SETTINGS = '/settings/extensions/home';
  const snap = $derived(live.snap);
  const now = $derived(live.now);
  const tz = $derived(snap.timezone || undefined);
  const hour = $derived(Number(new Date(now).toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })));
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(t.locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const home = $derived(snap.ha.home);
  const w = $derived(snap.weather.data);
  const cond = $derived(condition(w?.current.code));
  const next4 = $derived(w ? periods(w.hours) : []);
  const sum = $derived(w ? summary(w) : null);
  const hours = $derived(w ? w.hours.filter((_, i) => i % 3 === 0).slice(0, 8) : []);
  const pip = $derived(mascotMood(snap, hour, t));
  const alerts = $derived(home?.alerts ?? []);
  const warnings = $derived(snap.weather.warnings);
  const nothingSet = $derived(!snap.ha.configured && !snap.weather.configured && !snap.calendar.configured);
  const events = $derived(snap.calendar.events);
  const shown = $derived(shownEvents(events, now));
  const isPast = (e: { allDay: boolean; end: string }) => !e.allDay && Date.parse(e.end) <= now;
  const deg = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v)}°`);
  const mm = (v: number | null | undefined) => (v == null ? '–' : `${new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(v)} mm`);

  let view = $state<'chart' | 'list'>('chart');
  /** Which group's members the sheet lists: the lights that are on, or the doors and windows that are open. */
  let detail = $state<'lights' | 'contacts' | null>(null);
  const group = $derived(detail === 'lights' ? home?.lights : detail === 'contacts' ? home?.contacts : undefined);
</script>

<svelte:head><title>{t('Home')} · {t('Assistant')}</title></svelte:head>

<PageHead title={t('Home')} sub={pip.line} mood={pip.mood}>
  {#snippet actions()}
    <button type="button" class="btn-glass btn-icon" onclick={() => live.refresh()} aria-label={t('Refresh')} disabled={live.loading}>
      {#if live.loading}<span class="spin"></span>{:else}<Icon name="refresh" size={20} />{/if}
    </button>
  {/snippet}
</PageHead>

{#if nothingSet}
  <div class="card">
    <EmptyState title={t('Nothing to watch yet')} level={2} mascotLabel={t('{name} is waiting', { name: mascotName() })}>
      <p class="muted">{t('Add your Home Assistant address and token, and a weather location, in System settings.')}</p>
      <a class="btn-primary" href={SETTINGS}>{t('Open settings')}</a>
    </EmptyState>
  </div>
{:else}
  {#if snap.ha.error}
    <p class="card status critical">{snap.ha.error}. {t('Lights, doors and calendar are unavailable.')} <a href={SETTINGS}>{t('Check the settings')}</a></p>
  {/if}

  {#if alerts.length || warnings.length}
    <div class="list-group alerts" role="status">
      {#each alerts as a (a.name + a.at)}
        <div class="list-row">
          <span class="list-icon" style:--c="var(--critical)"><Icon name="activity" size={18} /></span>
          <span class="list-text"><span class="list-title">{a.name}</span><span class="list-sub">{a.active ? t('since {time}', { time: timeOf(a.at) }) : ago(a.at, now, t)}</span></span>
        </div>
      {/each}
      {#each warnings as wn (wn.title)}
        <div class="list-row">
          <span class="list-icon" style:--c="var(--{wn.tone === 'critical' ? 'critical' : 'warning'})"><Icon name="sun" size={18} /></span>
          <span class="list-text"><span class="list-title">{wn.title}</span>{#if wn.detail}<span class="list-sub">{wn.detail}</span>{/if}</span>
          {#if wn.source === 'forecast'}<span class="list-end"><span class="chip">{t('forecast')}</span></span>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if snap.ha.configured && home}
    <div class="house">
      <button type="button" class="card stat" onclick={() => (detail = 'lights')} aria-haspopup="dialog">
        <span class="eyebrow"><Icon name="bulb" size={18} />{t('Lights')}</span>
        <span class="figure">{home.lights.active.length}<small> / {home.lights.total}</small></span>
        <span class="muted">{home.lights.active.length ? t('on') : t('all off')}</span>
      </button>
      <button type="button" class="card stat" onclick={() => (detail = 'contacts')} aria-haspopup="dialog">
        <span class="eyebrow"><Icon name="house" size={18} />{t('Doors and windows')}</span>
        <span class="figure">{home.contacts.active.length}<small> / {home.contacts.total}</small></span>
        <span class="muted">{home.contacts.active.length ? t('open') : t('all closed')}</span>
      </button>
    </div>
  {/if}

  <div class="grid">
    <section class="card weather" aria-label={t('Weather now')}>
      {#if w}
        <div class="now">
          <WeatherIcon sky={cond.sky} night={!w.current.isDay} size={72} />
          <div>
            <div class="figure">{deg(w.current.temp)}</div>
            <div class="cond">{t(cond.label)}</div>
          </div>
        </div>
        <p class="muted small">
          {t('wind {kmh} km/h', { kmh: w.current.wind == null ? '–' : Math.round(w.current.wind) })} · {t('rain {mm}', { mm: mm(w.current.precip) })}
          {#if w.current.feels !== null && Math.abs((w.current.feels ?? 0) - (w.current.temp ?? 0)) >= 2}· {t('feels {deg}', { deg: deg(w.current.feels) })}{/if}
          · {w.place}
        </p>
        <ol class="periods">
          {#each next4 as p (p.time)}
            <li class="well">
              <span class="muted num">{hhmm(p.time)}</span>
              <WeatherIcon sky={condition(p.code).sky} night={!p.isDay} size={32} label={t(condition(p.code).label)} />
              <strong>{deg(p.temp)}</strong>
              <span class="muted num">{mm(p.precip)}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <EmptyState title={t('No forecast')} level={2} mood="tired" size={56} mascotLabel={t('{name} has no forecast', { name: mascotName() })}>
          <p class="muted">
            {#if snap.weather.error}{t('No forecast: {error}.', { error: snap.weather.error })}{:else}{t('Set a weather location in')} <a href={SETTINGS}>{t('settings')}</a>.{/if}
          </p>
        </EmptyState>
      {/if}
    </section>

    {#if w}
      <section class="card ahead" aria-label={t('Next 24 hours')}>
        <div class="head">
          <h2>{t('Next 24 hours')}</h2>
          <div class="segmented" role="group" aria-label={t('Forecast view')}>
            <button type="button" aria-pressed={view === 'chart'} onclick={() => (view = 'chart')}>{t('Chart')}</button>
            <button type="button" aria-pressed={view === 'list'} onclick={() => (view = 'list')}>{t('List')}</button>
          </div>
        </div>
        {#if view === 'chart'}
          <ForecastChart hours={w.hours} />
        {:else}
          <div class="list-group flat">
            {#each hours as h (h.time)}
              <div class="list-row">
                <span class="num hour">{hhmm(h.time)}</span>
                <WeatherIcon sky={condition(h.code).sky} night={!h.isDay} size={28} label={t(condition(h.code).label)} />
                <span class="list-text"><span class="list-title">{deg(h.temp)}</span></span>
                <span class="list-end num">{mm(h.precip)} · {h.wind == null ? '–' : `${Math.round(h.wind)} km/h`}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if sum}
          <dl class="facts">
            <div class="well"><dt>{t('Heaviest rain')}</dt><dd class="num">{sum.heaviest ? `${mm(sum.heaviest.mm)} · ${hhmm(sum.heaviest.time)}` : t('dry for 24 h')}</dd></div>
            <div class="well"><dt>{t('Wind')}</dt><dd class="num">{sum.wind ? `${sum.wind.min}–${sum.wind.max} km/h` : '–'}</dd></div>
            <div class="well"><dt>{t('Night')}</dt><dd class="num">{sum.night == null ? '–' : t('low {deg}°', { deg: sum.night })}</dd></div>
            {#if sum.sunrise && sum.sunset}<div class="well"><dt>{t('Daylight')}</dt><dd class="num">{hhmm(sum.sunrise)}–{hhmm(sum.sunset)}</dd></div>{/if}
          </dl>
        {/if}
      </section>
    {/if}
  </div>

  {#if snap.calendar.configured}
    <div class="section-head"><h2>{t('Today')}</h2><a class="btn-plain btn-sm" href="/calendar">{t('Calendar')}</a></div>
    {#if snap.calendar.error}
      <p class="muted">{t('Calendar unavailable: {error}.', { error: snap.calendar.error })}</p>
    {:else if events.length}
      <div class="list-group">
        {#each shown as e (e.title + e.when)}
          <div class="list-row" class:past={isPast(e)}>
            <span class="num when">{e.when}</span>
            <span class="list-text"><span class="list-title">{e.title}</span>{#if e.location}<span class="list-sub">{e.location}</span>{/if}</span>
          </div>
        {/each}
      </div>
      {#if events.length > shown.length}<p class="muted small">{t('and {n} more', { n: events.length - shown.length })}</p>{/if}
    {:else}
      <p class="muted">{t('Nothing in the calendar today.')}</p>
    {/if}
  {/if}

  <p class="stamp muted small">
    {live.failedAt !== null ? t('Could not refresh. Showing data from {time}; retrying.', { time: timeOf(snap.at) }) : t('Data from {time}.', { time: timeOf(snap.at) })}
    <a href="/home/eink">{t('E-ink board')}</a>
  </p>
{/if}

{#if detail && group}
  <Sheet title={detail === 'lights' ? t('Lights') : t('Doors and windows')} onclose={() => (detail = null)}>
    {#if group.active.length}
      <div class="list-group">
        {#each group.active as x (x.name)}
          <div class="list-row"><span class="list-text"><span class="list-title">{x.name}</span></span><span class="list-end">{ago(x.since, now, t)}</span></div>
        {/each}
      </div>
    {:else}
      <p class="muted">{detail === 'lights' ? t.n(group.total, 'The light is off.', 'All {n} lights are off.') : t.n(group.total, 'The door or window is closed.', 'All {n} doors and windows are closed.')}</p>
    {/if}
    {#if group.unknown.length}<p class="muted small">{t('{n} not reporting', { n: group.unknown.length })}</p>{/if}
  </Sheet>
{/if}

<style>
  .alerts,
  .house,
  .grid {
    margin-bottom: var(--space-4);
  }
  .house {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .stat {
    display: grid;
    gap: 2px;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .stat .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .stat .eyebrow :global(svg) {
    color: var(--accent-ink);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  }
  .grid > *,
  .house > * {
    min-width: 0;
    gap: var(--space-3);
    align-items: start;
  }
  .now {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .cond {
    font-weight: var(--weight-bold);
  }
  .small {
    font-size: var(--text-sm);
  }
  .periods {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }
  .periods li {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: var(--space-2) 0;
    font-size: var(--text-sm);
  }
  .periods strong {
    font-family: var(--font-rounded);
    font-size: var(--text-lg);
  }
  .ahead .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .ahead h2 {
    font-size: var(--text-lg);
  }
  .flat {
    border: 0;
    box-shadow: none;
  }
  .hour,
  .when {
    width: 6.5rem;
    flex: none;
    color: var(--ink-2);
    font-size: var(--text-md);
  }
  .hour {
    width: 3rem;
  }
  .past {
    opacity: 0.55;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: var(--space-2);
    margin: var(--space-3) 0 0;
  }
  .facts dt {
    font-size: var(--text-sm);
    color: var(--ink-3);
  }
  .facts dd {
    margin: 0;
    font-weight: var(--weight-bold);
  }
  .stamp {
    margin-top: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  @media (max-width: 820px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
