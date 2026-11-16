<script lang="ts">
  import type { DataOf } from '$shell';
  import { Mascot, useT, type Mood } from '$shell/ui';
  import { addDays, itemHue, itemLine, minutesOf, progressOf } from '../lib/model';
  import { weekCounts, weekOf } from '../lib/view';
  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();

  const week = $derived(weekOf(data.monday, data.sessions));
  const counts = $derived(weekCounts(data.sessions));
  const todays = $derived(data.sessions.filter((s) => s.day === data.today));
  const mood: Mood = $derived(counts.planned === 0 ? 'idle' : counts.done >= counts.planned ? 'charged' : 'steady');
  const nothing = $derived(!data.sessions.length && !data.planCount && !data.templates.length);
  const thisWeek = $derived(data.today >= data.monday && data.today <= addDays(data.monday, 6));
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const range = $derived(
    `${new Date(`${data.monday}T12:00:00Z`).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${addDays(data.monday, 6)}T12:00:00Z`).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
  );
  const statusText = (s: string) => (s === 'done' ? t('done') : s === 'skipped' ? t('skipped') : t('planned'));
  const newHref = (day: string) => `/training/session/new?day=${day}`;
</script>

<svelte:head><title>{t('Training')} · {t('Assistant')}</title></svelte:head>

<header class="head rise">
  <Mascot {mood} size={64} label={t('Pingo in a sweatband')} />
  <div>
    <p class="eyebrow">{range}</p>
    <h1>{t('Training')}</h1>
    <p class="muted">
      {#if counts.planned}{t('{done} of {planned} workouts done this week.', { done: counts.done, planned: counts.planned })}{:else}{t('Nothing planned this week.')}{/if}
    </p>
  </div>
  <nav class="weeknav" aria-label={t('Weeks')}>
    <a class="btn btn-ghost" href="?w={addDays(data.monday, -7)}" data-sveltekit-noscroll>{t('Previous')}</a>
    {#if !thisWeek}<a class="btn btn-ghost" href="?w={data.today}" data-sveltekit-noscroll>{t('This week')}</a>{/if}
    <a class="btn btn-ghost" href="?w={addDays(data.monday, 7)}" data-sveltekit-noscroll>{t('Next')}</a>
  </nav>
</header>

<nav class="bar rise" aria-label={t('Training')}>
  <a class="planchip" href={data.active ? `/training/plans/${data.active.id}` : '/training/plans'}>
    <span class="eyebrow">{t('Active plan')}</span>
    <strong>{data.active ? data.active.name : t('None')}</strong>
  </a>
  <a class="btn btn-ghost" href="/training/plans">{t('Plans')}</a>
  <a class="btn btn-ghost" href="/training/library">{t('Exercises')}</a>
  <a class="btn btn-primary" href={newHref(thisWeek ? data.today : data.monday)}>{t('New workout')}</a>
</nav>

{#if nothing}
  <p class="muted hint">
    {t('No plan yet. Ask Claude for one, e.g. "Plan me 8 weeks to a 10 km under 50 minutes, three runs and one gym session a week." Or add a workout: pick a run, exercises, the sauna.')}
  </p>
{/if}

<section class="week" aria-label={t('This week')}>
  {#each week as col, i (col.day)}
    <div class="card daycol rise" class:today={col.day === data.today} style:--i={i}>
      <h2 class="dayname">{dayName(col.day)}</h2>
      {#each col.sessions as s (s.id)}
        {@const min = minutesOf(s)}
        <a class="session {s.status}" href="/training/session/{s.id}">
          <strong>{s.title}</strong>
          {#if s.items.length}
            <span class="dots" aria-hidden="true">{#each s.items as it, k (k)}<span style="background: var(--hue-{itemHue(it)})"></span>{/each}</span>
          {/if}
          <span class="muted small">{[s.time_local, min ? `${min} min` : ''].filter(Boolean).join(' · ')}</span>
          <span class="state small">{statusText(s.status)}{s.sent_at ? ` · ${t('on the watch')}` : ''}</span>
        </a>
      {:else}
        <p class="muted small rest">{t('Rest')}</p>
      {/each}
      <a class="add small" href={newHref(col.day)} aria-label={t('Add a workout on {day}', { day: dayName(col.day) })}>+ {t('Add')}</a>
    </div>
  {/each}
</section>

<div class="grid">
  <section class="card rise" aria-labelledby="today-title">
    <h2 id="today-title">{t('Today')}</h2>
    {#each todays as s (s.id)}
      {@const pr = progressOf(s.items)}
      <a class="todayrow" href="/training/session/{s.id}">
        <strong>{s.title}</strong>
        <span class="muted small">{statusText(s.status)}{pr.all && s.status === 'planned' && pr.done ? ` · ${pr.done}/${pr.all}` : ''}</span>
        <ul class="items small">
          {#each s.items.slice(0, 8) as it, k (k)}<li><span class="dot" style="background: var(--hue-{itemHue(it)})" aria-hidden="true"></span>{itemLine(it, t)}</li>{/each}
        </ul>
      </a>
    {:else}
      <p class="muted">{t('Nothing planned today.')}</p>
    {/each}
    {#if data.templates.length}
      <h3 class="small">{t('Start from a template')}</h3>
      <div class="tpls">
        {#each data.templates.slice(0, 6) as tpl (tpl.id)}
          <a class="btn" href="/training/session/new?day={data.today}&template={tpl.id}">{tpl.name}</a>
        {/each}
      </div>
    {/if}
  </section>

  <section class="card rise" aria-labelledby="plan-title">
    <h2 id="plan-title">{t('Active plan')}</h2>
    {#if data.active}
      {@const pl = data.active}
      <a href="/training/plans/{pl.id}"><strong>{pl.name}</strong></a>
      {#if pl.goal}<p class="muted small">{pl.goal}</p>{/if}
      <p class="small">
        {t('{done} of {n} workouts done', { done: pl.done, n: pl.sessions })}{pl.end_day ? ` · ${t('until {day}', { day: pl.end_day })}` : ''}
      </p>
      <div class="progress" role="img" aria-label={t('{done} of {n} workouts done', { done: pl.done, n: pl.sessions })}>
        <span style:width="{pl.sessions ? Math.round((pl.done / pl.sessions) * 100) : 0}%"></span>
      </div>
    {:else}
      <p class="muted">{data.planCount ? t('No plan is active: the week shows workouts of no plan.') : t('No plan yet. Claude builds one with you: just ask in the chat.')}</p>
    {/if}
    <p><a href="/training/plans">{t('All plans')}</a></p>
    <p class="muted small">{t('To put a workout on your Garmin watch, or name a run on Strava after the plan, ask Claude.')}</p>
  </section>

  {#if data.bests.length}
    <section class="card rise" aria-labelledby="bests-title">
      <h2 id="bests-title">{t('Best sets')}</h2>
      <table>
        <tbody>
          {#each data.bests as b (b.name)}
            <tr><td>{t(b.name)}</td><td class="num r">{b.kg ? `${b.kg} kg × ${b.reps}` : `${b.reps}`}</td><td class="muted small r">{b.day}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

<style>
  .head {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  .head h1,
  .head p {
    margin: 0;
  }
  .weeknav {
    margin-left: auto;
    display: flex;
    gap: var(--space-2);
  }
  .bar {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  .bar .btn-primary {
    margin-left: auto;
  }
  .planchip {
    display: grid;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--ring);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
    line-height: 1.3;
  }
  .hint {
    margin: 0 0 var(--space-4);
  }
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  @media (max-width: 900px) {
    .week {
      grid-template-columns: 1fr;
    }
  }
  .daycol {
    display: grid;
    align-content: start;
    gap: var(--space-2);
    padding: var(--space-3);
    min-height: 140px;
  }
  @media (max-width: 900px) {
    .daycol {
      min-height: 0;
    }
  }
  .daycol.today {
    outline: 2px solid var(--accent);
  }
  .dayname {
    font-size: var(--text-sm);
    margin: 0;
    text-transform: capitalize;
  }
  .session {
    display: grid;
    gap: 2px;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--ink);
    text-decoration: none;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .dots {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .session .state {
    color: var(--ink-3);
  }
  .session.done .state {
    color: var(--good-ink);
  }
  .session.skipped {
    opacity: 0.6;
  }
  .add {
    color: var(--ink-3);
    text-decoration: none;
    justify-self: start;
  }
  @media (hover: hover) {
    .add:hover {
      color: var(--accent-ink);
    }
  }
  .rest {
    margin: 0;
  }
  .small {
    font-size: var(--text-sm);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-4);
  }
  .grid h2 {
    margin-top: 0;
  }
  .todayrow {
    display: grid;
    gap: 2px;
    padding: var(--space-2) 0;
    color: var(--ink);
    text-decoration: none;
    border-bottom: 1px solid var(--surface-2);
  }
  .items {
    list-style: none;
    padding: 0;
    margin: var(--space-1) 0 0;
    display: grid;
    gap: 2px;
    color: var(--ink-2);
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: var(--space-2);
  }
  h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: var(--ink-2);
  }
  .tpls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .progress {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--surface-2);
  }
  .r {
    text-align: right;
  }
</style>
