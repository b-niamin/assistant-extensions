<script lang="ts">
  import { onMount } from 'svelte';
  import type { DataOf } from '$shell';
  import { Mascot, useT } from '$shell/ui';
  import { ago, beni, contactsLabel, countdown, lightsLabel } from '../lib/board';
  import ForecastChart from '../lib/ForecastChart.svelte';
  import type { Snapshot } from '../lib/types';
  import { condition, hhmm, periods, summary } from '../lib/weather';
  import WeatherIcon from '../lib/WeatherIcon.svelte';

  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();

  // svelte-ignore state_referenced_locally
  let snap = $state<Snapshot>(data.snapshot);
  let now = $state(Date.now());
  // svelte-ignore state_referenced_locally
  let lastAt = $state(Date.parse(data.snapshot.at));
  // svelte-ignore state_referenced_locally
  let nextAt = $state(Date.parse(data.snapshot.at) + data.snapshot.refreshSeconds * 1000);
  let loading = $state(false);
  let failedAt = $state<number | null>(null);
  let view = $state<'chart' | 'list'>('chart');
  let board: HTMLElement;
  let full = $state(false);

  const SETTINGS = '/settings/extensions/home';
  const RETRY_MS = 15_000;

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const res = await fetch('/home/state', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      snap = (await res.json()) as Snapshot;
      lastAt = Date.now();
      nextAt = lastAt + snap.refreshSeconds * 1000;
      failedAt = null;
    } catch {
      failedAt = Date.now();
      lastAt = Date.now();
      nextAt = lastAt + RETRY_MS;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
      if (now >= nextAt) refresh();
      if (rotating() && now >= turnAt) {
        view = view === 'chart' ? 'list' : 'chart';
        turnAt = now + ROTATE_MS;
      }
    }, 1000);
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAt > 10_000) refresh();
    };
    const fs = () => (full = document.fullscreenElement === board);
    document.addEventListener('visibilitychange', wake);
    document.addEventListener('fullscreenchange', fs);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      document.removeEventListener('fullscreenchange', fs);
    };
  });

  /**
   * On a wall display (full screen) Chart and List take turns every ROTATE_MS. Never under reduced motion,
   * never while focus is in the forecast (a keyboard or screen reader user is reading it), and never again
   * once someone picked a view (WCAG 2.2.2). Pointing at the forecast holds it for a turn.
   */
  const ROTATE_MS = 10_000;
  let turnAt = Date.now() + ROTATE_MS;
  let picked = $state(false);
  let focusInside = $state(false);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rotating = () => full && !reduced && !picked && !focusInside;
  function pick(v: 'chart' | 'list') {
    view = v;
    picked = true;
  }
  const hold = () => (turnAt = Math.max(turnAt, Date.now() + ROTATE_MS));
  const leave = (e: FocusEvent) => {
    if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) focusInside = false;
  };

  // Alerts: only new ones are announced (the list itself re-renders every second with "5 min ago").
  let announced = new Set<string>();
  let announce = $state('');
  $effect(() => {
    const keys = alerts.map((a) => `${a.name}|${a.at}`);
    const fresh = alerts.filter((a, i) => !announced.has(keys[i]));
    if (fresh.length && announced.size) announce = fresh.map((a) => a.name).join(', ');
    announced = new Set(keys);
  });

  // A wall tablet: full screen, and keep the screen on while it is.
  let lock: { release(): Promise<void> } | null = null;
  async function toggleFull() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      await lock?.release().catch(() => {});
      lock = null;
      return;
    }
    await board.requestFullscreen?.().catch(() => {});
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      lock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      lock = null;
    }
  }

  const tz = $derived(snap.timezone || undefined);
  const clock = $derived(new Date(now).toLocaleTimeString(t.locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' }));
  const date = $derived(new Date(now).toLocaleDateString(t.locale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }));
  const hour = $derived(Number(new Date(now).toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })));
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(t.locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' });

  const cd = $derived(countdown(lastAt, nextAt, now));
  const home = $derived(snap.ha.home);
  const w = $derived(snap.weather.data);
  const cond = $derived(condition(w?.current.code));
  const next4 = $derived(w ? periods(w.hours) : []);
  const sum = $derived(w ? summary(w) : null);
  const listHours = $derived(w ? w.hours.filter((_, i) => i % 3 === 0) : []);
  const pip = $derived(beni(snap, hour, t));
  const alerts = $derived(home?.alerts ?? []);
  const warnings = $derived(snap.weather.warnings);
  const nothingSet = $derived(!snap.ha.configured && !snap.weather.configured);
  const deg = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v)}°`);
  const mm = (v: number | null | undefined) => (v == null ? '–' : `${+v.toFixed(1)} mm`);
  const events = $derived(snap.calendar.events);
  const isPast = (e: { allDay: boolean; end: string }) => !e.allDay && Date.parse(e.end) <= now;
  /** Up to six: what is still ahead first, then the latest of what is over, in time order. */
  const shown = $derived.by(() => {
    const ahead = events.filter((e) => !isPast(e));
    const past = events.filter(isPast).slice(-Math.max(0, 6 - ahead.length));
    return events.filter((e) => ahead.slice(0, 6).includes(e) || past.includes(e));
  });
</script>

<svelte:head><title>{t('Home')} · Assistant</title></svelte:head>

{#snippet bulb()}
  <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
  </svg>
{/snippet}
{#snippet pane()}
  <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M12 3v18M4 12h16" />
  </svg>
{/snippet}

<section class="board" class:full bind:this={board} aria-label={t('Home')}>
  <header class="top">
    <span class="beni" title={pip.line}>
      <Mascot mood={pip.mood} size={34} label={t('Beni says: {line}', { line: pip.line })} />
    </span>

    {#if snap.ha.configured}
      <details class="pill" class:on={home && home.lights.active.length > 0}>
        <summary>
          {@render bulb()}
          <span class:strong={home && home.lights.active.length > 0}>{lightsLabel(home?.lights, t)}</span>
        </summary>
        {#if home}
          <div class="pop">
            {#if home.lights.active.length}
              <p class="eyebrow">{t('On')}</p>
              <ul>
                {#each home.lights.active as l}<li><span>{l.name}</span><span class="muted">{ago(l.since, now, t)}</span></li>{/each}
              </ul>
            {:else}
              <p class="muted">{t.n(home.lights.total, 'The light is off.', 'All {n} lights are off.')}</p>
            {/if}
            {#if home.lights.unknown.length}<p class="muted small">{t('{n} not reporting', { n: home.lights.unknown.length })}</p>{/if}
          </div>
        {/if}
      </details>

      <details class="pill" class:open-state={home && home.contacts.active.length > 0}>
        <summary>
          {@render pane()}
          <span class:strong={home && home.contacts.active.length > 0}>{contactsLabel(home?.contacts, t)}</span>
        </summary>
        {#if home}
          <div class="pop">
            {#if home.contacts.active.length}
              <p class="eyebrow">{t('Open')}</p>
              <ul>
                {#each home.contacts.active as c}<li><span>{c.name}</span><span class="muted">{ago(c.since, now, t)}</span></li>{/each}
              </ul>
            {:else}
              <p class="muted">{t.n(home.contacts.total, 'The door or window is closed.', 'All {n} doors and windows are closed.')}</p>
            {/if}
            {#if home.contacts.unknown.length}<p class="muted small">{t('{n} not reporting', { n: home.contacts.unknown.length })}</p>{/if}
          </div>
        {/if}
      </details>
    {/if}

    <span class="spacer"></span>

    <span class="when">
      <span class="date">{date}</span>
      <strong class="clock">{clock}</strong>
    </span>
    <span
      class="refresh"
      class:failed={failedAt !== null}
      title={failedAt !== null
        ? t('Could not refresh. Showing data from {time}; retrying.', { time: timeOf(snap.at) })
        : t('Data from {time}. Next update in {n} s.', { time: timeOf(snap.at), n: cd.left })}
    >
      <span class="track" role="progressbar" aria-label={t('Until the next update')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(cd.progress * 100)}>
        <span class="fill" style:transform="scaleX({1 - cd.progress})"></span>
      </span>
      <span class="secs">{loading ? '…' : failedAt !== null ? t('retry') : `${cd.left} s`}</span>
    </span>
    <button class="btn-ghost icon" onclick={toggleFull} aria-label={full ? t('Leave full screen') : t('Full screen')} title={full ? t('Leave full screen') : t('Full screen')}>
      <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        {#if full}<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />{:else}<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />{/if}
      </svg>
    </button>
  </header>

  {#if nothingSet}
    <div class="empty">
      <Mascot mood="idle" size={88} label={t('Beni is waiting')} />
      <div>
        <h1>{t('Nothing to watch yet')}</h1>
        <p class="muted">{t('Add your Home Assistant address and token, and a weather location, in System settings.')}</p>
        <a class="btn btn-primary go" href={SETTINGS}>{t('Open settings')}</a>
      </div>
    </div>
  {:else}
    <h1 class="sr">{t('Home')}</h1>
    {#if snap.ha.error}
      <p class="banner status critical">
        {snap.ha.error}. {t('Lights, doors and calendar are unavailable.')} <a href={SETTINGS}>{t('Check the settings')}</a>
      </p>
    {/if}

    <div class="main">
      <section class="now" aria-label={t('Weather now')}>
        {#if w}
          <WeatherIcon sky={cond.sky} night={!w.current.isDay} size={92} />
          <p class="hero"><span class="deg">{w.current.temp == null ? '–' : Math.round(w.current.temp)}</span><span class="o">°</span></p>
          <p class="cond">{t(cond.label)}</p>
          <p class="sub num">
            {t('wind {kmh} km/h', { kmh: w.current.wind == null ? '–' : Math.round(w.current.wind) })} · {t('rain {mm}', { mm: mm(w.current.precip) })}
            {#if w.current.feels !== null && Math.abs((w.current.feels ?? 0) - (w.current.temp ?? 0)) >= 2}· {t('feels {deg}', { deg: deg(w.current.feels) })}{/if}
          </p>
          <p class="place muted">{w.place}{snap.weather.stale ? ` · ${t('forecast from {time}', { time: timeOf(w.at) })}` : ''}</p>
          <ol class="periods">
            {#each next4 as p}
              <li>
                <span class="ptime num">{hhmm(p.time)}</span>
                <WeatherIcon sky={condition(p.code).sky} night={!p.isDay} size={34} label={t(condition(p.code).label)} />
                <strong>{deg(p.temp)}</strong>
                <span class="muted num">{mm(p.precip)}</span>
              </li>
            {/each}
          </ol>
        {:else}
          <div class="quiet">
            <Mascot mood="tired" size={64} accessory="umbrella" label={t('Beni has no forecast')} />
            <p class="muted">
              {#if snap.weather.error}{t('No forecast: {error}.', { error: snap.weather.error })}{:else}{t('Set a weather location in')} <a href={SETTINGS}>{t('settings')}</a>.{/if}
            </p>
          </div>
        {/if}
      </section>

      <section class="ahead" aria-label={t('Next 24 hours')} onpointermove={hold} onfocusin={() => (focusInside = true)} onfocusout={leave}>
        {#if w}
          <div class="tabs" role="group" aria-label={t('Forecast view')}>
            <button type="button" aria-pressed={view === 'chart'} onclick={() => pick('chart')}>{t('Chart')}</button>
            <button type="button" aria-pressed={view === 'list'} onclick={() => pick('list')}>{t('List')}</button>
          </div>
          {#if view === 'chart'}
            <div class="lead">
              <span class="mid">{deg(w.current.temp)}</span>
              <span class="leadcond"><WeatherIcon sky={cond.sky} night={!w.current.isDay} size={40} />{t(cond.label)}</span>
            </div>
            <ForecastChart hours={w.hours} />
          {:else}
            <table class="hours">
              <thead>
                <tr><th scope="col">{t('Time')}</th><th scope="col"><span class="sr">{t('Sky')}</span></th><th scope="col" class="r">{t('Temp')}</th><th scope="col" class="r">{t('Rain')}</th><th scope="col" class="r">{t('Wind')}</th></tr>
              </thead>
              <tbody>
                {#each listHours as h}
                  <tr>
                    <td class="num strong">{hhmm(h.time)}</td>
                    <td><WeatherIcon sky={condition(h.code).sky} night={!h.isDay} size={30} label={t(condition(h.code).label)} /></td>
                    <td class="r big">{deg(h.temp)}</td>
                    <td class="r num muted">{mm(h.precip)}</td>
                    <td class="r num muted">{h.wind == null ? '–' : `${Math.round(h.wind)} km/h`}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/if}
      </section>
    </div>

    <div class="lower">
      <section class="today" aria-label={t("Today's calendar")}>
        <p class="eyebrow">{t('Today')}</p>
        {#if !snap.calendar.configured}
          <p class="muted">{t('Add calendar links in System settings, or connect Home Assistant.')}</p>
        {:else if snap.calendar.error}
          <p class="muted">{t('Calendar unavailable: {error}.', { error: snap.calendar.error })}</p>
        {:else if events.length}
          <ul class="events">
            {#each shown as e}
              <li class:allday={e.allDay} class:past={isPast(e)} class:live={!e.allDay && !isPast(e) && Date.parse(e.start) <= now}>
                <span class="etime num">{e.when}</span>
                <span class="etitle">{e.title}{#if isPast(e)}<span class="sr"> ({t('ended')})</span>{/if}</span>
                {#if e.location}<span class="muted eloc">{e.location}</span>{/if}
              </li>
            {/each}
            {#if events.length > shown.length}<li class="muted more">{t('and {n} more', { n: events.length - shown.length })}</li>{/if}
          </ul>
        {:else}
          <p class="muted">{t('Nothing in the calendar today.')}</p>
        {/if}
      </section>

      {#if sum}
        <dl class="facts">
          <div><dt>{t('Heaviest rain')}</dt><dd class="num">{sum.heaviest ? `${mm(sum.heaviest.mm)} · ${t('around {time}', { time: hhmm(sum.heaviest.time) })}` : t('dry for 24 h')}</dd></div>
          <div><dt>{t('Wind')}</dt><dd class="num">{sum.wind ? `${sum.wind.min}–${sum.wind.max} km/h${sum.wind.gusts && sum.wind.gusts > sum.wind.max + 10 ? `, ${t('gusts {kmh}', { kmh: sum.wind.gusts })}` : ''}` : '–'}</dd></div>
          <div><dt>{t('Night')}</dt><dd class="num">{sum.night == null ? '–' : t('low {deg}°', { deg: sum.night })}</dd></div>
          {#if sum.sunrise && sum.sunset}<div><dt>{t('Daylight')}</dt><dd class="num">{hhmm(sum.sunrise)}–{hhmm(sum.sunset)}</dd></div>{/if}
        </dl>
      {/if}
    </div>

    <p class="sr" role="status">{announce ? t('New alert: {names}', { names: announce }) : ''}</p>
    <footer class="alerts" aria-label={t('Alerts')}>
      {#if alerts.length || warnings.length}
        <ul>
          {#each alerts as a}
            <li class="alert">
              <span class="status {a.active ? 'critical' : 'serious'}"><strong>{a.name}</strong></span>
              <span class="muted">{a.active ? t('since {time}', { time: timeOf(a.at) }) : ago(a.at, now, t)}</span>
            </li>
          {/each}
          {#each warnings as wn}
            <li class="alert">
              <span class="status {wn.tone}"><strong>{wn.title}</strong></span>
              {#if wn.detail}<span class="muted">{wn.detail}</span>{/if}
              {#if wn.source === 'forecast'}<span class="tag">{t('forecast')}</span>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="calm">{t('No alerts')}</p>
      {/if}
    </footer>
  {/if}
</section>

<style>
  .board {
    background: var(--surface);
    border: 1px solid var(--ring);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .board.full {
    border: none;
    border-radius: 0;
    height: 100vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  .board.full .main {
    flex: 1;
  }

  /* Top bar: the status line of the house. */
  .top {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--ring);
    min-height: 52px;
    flex-wrap: wrap;
  }
  .beni {
    display: inline-flex;
    margin: -4px 0 -6px;
  }
  .spacer {
    flex: 1;
  }
  .glyph {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .pill {
    position: relative;
  }
  .pill summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    margin: 0 -8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-2);
  }
  .pill summary::-webkit-details-marker {
    display: none;
  }
  .pill summary:hover {
    background: var(--surface-2);
  }
  .pill.on summary .glyph {
    color: var(--hue-yellow);
    fill: color-mix(in srgb, var(--hue-yellow) 30%, transparent);
  }
  .pill.open-state summary .glyph {
    color: var(--serious);
  }
  .strong {
    color: var(--ink);
    font-weight: 600;
  }
  .pop {
    position: absolute;
    z-index: 5;
    top: calc(100% + 6px);
    left: -8px;
    min-width: 240px;
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: 0 0 0 1px var(--ring), 0 8px 24px rgba(0, 0, 0, 0.1);
  }
  .pop p {
    margin: 0 0 var(--space-2);
  }
  .pop ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .pop li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .small {
    font-size: 0.8125rem;
    margin-top: var(--space-2) !important;
  }
  .when {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2);
    font-variant-numeric: tabular-nums;
  }
  .date {
    color: var(--ink-2);
  }
  .clock {
    font-size: 1.125rem;
  }
  .refresh {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-3);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
  .track {
    width: 56px;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--ring);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--ink-2);
    transform-origin: left;
    transition: transform 1s linear;
  }
  .refresh.failed .fill {
    background: var(--warning);
  }
  .secs {
    min-width: 3.2em;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    height: 30px;
  }

  .banner {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--ring);
    background: var(--surface-2);
    font-size: 0.875rem;
  }
  .banner a {
    color: var(--accent-ink);
  }

  /* Weather now (left) and the next 24 hours (right). */
  .main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  }
  .now,
  .ahead {
    padding: var(--space-5);
    min-width: 0;
  }
  .now {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    border-right: 1px solid var(--ring);
  }
  .now p {
    margin: 0;
  }
  .hero {
    display: flex;
    align-items: flex-start;
    line-height: 0.9;
    margin-top: var(--space-3) !important;
    letter-spacing: -0.04em;
  }
  .deg {
    font-size: clamp(5.5rem, 12vw, 9.5rem);
    font-weight: 700;
  }
  .o {
    font-size: clamp(3rem, 6vw, 5rem);
    font-weight: 700;
    margin-top: 0.08em;
  }
  .cond {
    font-size: 1.5rem;
    font-weight: 500;
    margin-top: var(--space-3) !important;
  }
  .sub {
    color: var(--ink-2);
    margin-top: var(--space-1) !important;
  }
  .place {
    font-size: 0.8125rem;
    margin-top: var(--space-1) !important;
  }
  .periods {
    list-style: none;
    margin: var(--space-5) 0 0;
    padding: var(--space-4) 0 0;
    width: 100%;
    border-top: 1px solid var(--ink-3);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }
  .periods li {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 0 var(--space-2);
  }
  .periods li + li {
    border-left: 1px solid var(--grid);
  }
  .periods strong {
    font-size: 1.25rem;
  }
  .ptime {
    color: var(--ink-2);
    font-size: 0.875rem;
  }
  .periods .muted {
    font-size: 0.8125rem;
  }
  .quiet {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
    margin: auto;
    max-width: 30ch;
  }

  .tabs {
    display: flex;
    justify-content: center;
    gap: var(--space-5);
    margin-bottom: var(--space-4);
  }
  .tabs button {
    border: none;
    background: none;
    padding: 4px 2px;
    color: var(--ink-3);
    font-weight: 600;
    border-bottom: 2px solid transparent;
  }
  .tabs button[aria-pressed='true'] {
    color: var(--ink);
    border-bottom-color: var(--brand);
  }
  .lead {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-2);
  }
  .mid {
    font-size: 4rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .leadcond {
    display: grid;
    justify-items: center;
    gap: 2px;
    font-weight: 500;
  }
  .hours {
    width: 100%;
    border-collapse: collapse;
  }
  .hours th {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 500;
    text-align: left;
    padding: 0 0 var(--space-2);
    border-bottom: 1px solid var(--ink-3);
  }
  .hours td {
    padding: 9px 0;
    border-bottom: 1px solid var(--grid);
  }
  .hours tr:last-child td {
    border-bottom: none;
  }
  .hours .r {
    text-align: right;
    padding-left: var(--space-4);
  }
  .big {
    font-size: 1.25rem;
    font-weight: 700;
  }

  /* Today and the weather's fine print. */
  .lower {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    border-top: 1px solid var(--ring);
  }
  .today,
  .facts {
    padding: var(--space-4) var(--space-5);
    margin: 0;
  }
  .today {
    border-right: 1px solid var(--ring);
  }
  .today .eyebrow {
    margin: 0 0 var(--space-2);
  }
  .today > p.muted {
    margin: 0;
  }
  .events {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .events li {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
    min-width: 0;
  }
  .etime {
    flex: none;
    min-width: 7.5em;
    color: var(--ink-2);
    font-size: 0.875rem;
  }
  .etitle {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .eloc {
    font-size: 0.8125rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Past events: a quieter colour that still reads (opacity made them 3:1). */
  .events li.past,
  .events li.past .muted {
    color: var(--ink-3);
  }
  .events li.live .etime {
    color: var(--accent-ink);
    font-weight: 600;
  }
  .more {
    font-size: 0.8125rem;
  }
  .facts {
    display: grid;
    gap: 6px;
    align-content: start;
  }
  .facts div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .facts dt {
    font-weight: 500;
  }
  .facts dd {
    margin: 0;
    color: var(--ink-2);
  }

  .alerts {
    border-top: 1px solid var(--ring);
    padding: var(--space-3) var(--space-5);
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .calm {
    margin: 0;
    color: var(--ink-3);
    font-size: 0.875rem;
  }
  .alerts ul {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    display: grid;
    gap: 6px;
  }
  .alert {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: baseline;
  }
  .tag {
    font-size: 0.75rem;
    color: var(--ink-3);
    border: 1px solid var(--ring);
    border-radius: 999px;
    padding: 0 8px;
  }

  .empty {
    display: flex;
    gap: var(--space-5);
    align-items: center;
    padding: var(--space-7) var(--space-6);
  }
  .empty h1 {
    margin: 0 0 var(--space-2);
    font-size: 1.375rem;
  }
  .empty p {
    margin: 0;
    max-width: 46ch;
  }
  .go {
    display: inline-flex;
    align-items: center;
    margin-top: var(--space-4);
    text-decoration: none;
  }

  @media (max-width: 820px) {
    .main,
    .lower {
      grid-template-columns: 1fr;
    }
    .now,
    .today {
      border-right: none;
      border-bottom: 1px solid var(--ring);
    }
    .top {
      gap: var(--space-3);
    }
    .date,
    .lead {
      display: none;
    }
  }
  @media (max-width: 480px) {
    .now,
    .ahead {
      padding: var(--space-4);
    }
    .refresh .secs {
      display: none;
    }
    .etime {
      min-width: 6.5em;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
