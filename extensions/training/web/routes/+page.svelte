<script lang="ts">
  import type { DataOf } from '$shell';
  import { EmptyState, enhance, Mascot, useT, type Mood } from '$shell/ui';
  import { addDays, exerciseLine, SPORT_HUES, SPORT_LABELS, SPORTS, stepsLine } from '../lib/model';
  import { weekCounts, weekOf } from '../lib/view';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; added?: string } | null } = $props();
  const t = useT();
  let adding = $state(false);
  // svelte-ignore state_referenced_locally
  let addDay = $state(data.today);

  const week = $derived(weekOf(data.monday, data.sessions));
  const counts = $derived(weekCounts(data.sessions));
  const todays = $derived(data.sessions.filter((s) => s.day === data.today));
  const mood: Mood = $derived(counts.planned === 0 ? 'idle' : counts.done >= counts.planned ? 'charged' : 'steady');
  const nothing = $derived(!data.sessions.length && !data.plans.length && !data.templates.length);
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const range = $derived(
    `${new Date(`${data.monday}T12:00:00Z`).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${addDays(data.monday, 6)}T12:00:00Z`).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
  );
  const statusText = (s: string) => (s === 'done' ? t('done') : s === 'skipped' ? t('skipped') : t('planned'));
</script>

<svelte:head><title>{t('Training plan')} · {t('Assistant')}</title></svelte:head>

<header class="head rise">
  <Mascot {mood} size={64} label={t('Beni in a sweatband')} />
  <div>
    <p class="eyebrow">{range}</p>
    <h1>{t('Training plan')}</h1>
    <p class="muted">
      {#if counts.planned}{t('{done} of {planned} sessions done this week.', { done: counts.done, planned: counts.planned })}{:else}{t('Nothing planned this week.')}{/if}
    </p>
  </div>
  <nav class="weeknav" aria-label={t('Weeks')}>
    <a class="btn btn-ghost" href="?w={addDays(data.monday, -7)}" data-sveltekit-noscroll>{t('Previous')}</a>
    {#if !(data.today >= data.monday && data.today <= addDays(data.monday, 6))}
      <a class="btn btn-ghost" href="?w={data.today}" data-sveltekit-noscroll>{t('This week')}</a>
    {/if}
    <a class="btn btn-ghost" href="?w={addDays(data.monday, 7)}" data-sveltekit-noscroll>{t('Next')}</a>
  </nav>
</header>

{#if nothing}
  <section class="card rise">
    <EmptyState title={t('No plan yet')} level={2} mascotLabel={t('Beni is waiting')}>
      <p class="muted">
        {t('Ask Claude for one, e.g. "Plan me 8 weeks to a 10 km under 50 minutes, three runs and one gym session a week." Or add a session below.')}
      </p>
    </EmptyState>
  </section>
{/if}

<section class="week" aria-label={t('This week')}>
  {#each week as col, i (col.day)}
    <div class="card daycol rise" class:today={col.day === data.today} style:--i={i}>
      <h2 class="dayname">{dayName(col.day)}</h2>
      {#each col.sessions as s (s.id)}
        <a class="session {s.status}" href="/training/session/{s.id}" style="--hue: var(--hue-{SPORT_HUES[s.sport]})">
          <span class="dot" aria-hidden="true"></span>
          <span class="what">
            <strong>{s.title}</strong>
            <span class="muted small">
              {t(SPORT_LABELS[s.sport])}{s.time_local ? ` · ${s.time_local}` : ''}{s.duration_min ? ` · ${s.duration_min} min` : ''}
            </span>
          </span>
          <span class="state small">{statusText(s.status)}{s.sent_at ? ` · ${t('on the watch')}` : ''}</span>
        </a>
      {:else}
        <p class="muted small rest">{t('Rest')}</p>
      {/each}
    </div>
  {/each}
</section>

<div class="grid">
  <section class="card rise" aria-labelledby="today-title">
    <h2 id="today-title">{t('Today')}</h2>
    {#each todays as s (s.id)}
      <p>
        <a href="/training/session/{s.id}"><strong>{s.title}</strong></a>
        <span class="muted">· {statusText(s.status)}</span><br />
        <span class="muted small">{s.exercises?.length ? s.exercises.map(exerciseLine).join(', ') : stepsLine(s.steps, t) || s.description || ''}</span>
      </p>
    {:else}
      <p class="muted">{t('Nothing planned today.')}</p>
    {/each}
    {#if data.templates.length}
      <form method="POST" action="?/start" class="row" use:enhance>
        <label class="grow">{t('Start a workout now')}
          <select name="template">
            {#each data.templates as tpl (tpl.id)}<option value={tpl.id}>{tpl.name}</option>{/each}
          </select>
        </label>
        <button class="btn btn-primary">{t('Start')}</button>
      </form>
    {/if}
    {#if !adding}
      <button class="btn" type="button" onclick={() => (adding = true)}>{t('Add a session')}</button>
    {:else}
      <form
        method="POST"
        action="?/add"
        class="add"
        use:enhance={() => async ({ update, result }) => {
          await update({ reset: false });
          if (result.type === 'success') adding = false;
        }}
      >
        <label class="wide">{t('Title')}<input name="title" required maxlength="120" /></label>
        <label>{t('Day')}<input name="day" type="date" bind:value={addDay} required /></label>
        <label>{t('Time (optional)')}<input name="time" type="time" /></label>
        <label>{t('Sport')}
          <select name="sport">{#each SPORTS as sp (sp)}<option value={sp}>{t(SPORT_LABELS[sp])}</option>{/each}</select>
        </label>
        <label>{t('Minutes (optional)')}<input name="duration" type="number" min="1" max="1440" /></label>
        {#if data.plans.length}
          <label class="wide">{t('Plan')}
            <select name="plan"><option value="">{t('No plan')}</option>{#each data.plans as pl (pl.id)}<option value={pl.id}>{pl.name}</option>{/each}</select>
          </label>
        {/if}
        <label class="wide">{t('Description')}<textarea name="description" rows="2" maxlength="4000"></textarea></label>
        {#if form?.error}<p class="error wide" role="alert">{form.error}</p>{/if}
        <div class="row wide">
          <button class="btn btn-primary">{t('Save')}</button>
          <button class="btn btn-ghost" type="button" onclick={() => (adding = false)}>{t('Cancel')}</button>
        </div>
      </form>
    {/if}
  </section>

  <section class="card rise" aria-labelledby="plans-title">
    <h2 id="plans-title">{t('Plans')}</h2>
    {#each data.plans as pl (pl.id)}
      <div class="plan">
        <strong>{pl.name}</strong>
        {#if pl.goal}<p class="muted small">{pl.goal}</p>{/if}
        <p class="small">
          {t('{done} of {n} sessions done', { done: pl.done, n: pl.sessions })}{pl.end_day ? ` · ${t('until {day}', { day: pl.end_day })}` : ''}
        </p>
        <div class="bar" role="img" aria-label={t('{done} of {n} sessions done', { done: pl.done, n: pl.sessions })}>
          <span style:width="{pl.sessions ? Math.round((pl.done / pl.sessions) * 100) : 0}%"></span>
        </div>
      </div>
    {:else}
      <p class="muted">{t('No active plan. Claude builds one with you: just ask in the chat.')}</p>
    {/each}
    <p class="muted small">{t('To put a session on your Garmin watch, or name a run on Strava after the plan, ask Claude.')}</p>
  </section>

  {#if data.bests.length}
    <section class="card rise" aria-labelledby="bests-title">
      <h2 id="bests-title">{t('Best sets')}</h2>
      <table>
        <tbody>
          {#each data.bests as b (b.name)}
            <tr><td>{b.name}</td><td class="num r">{b.kg ? `${b.kg} kg × ${b.reps}` : `${b.reps}`}</td><td class="muted small r">{b.day}</td></tr>
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
    margin-bottom: var(--space-5);
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
    min-height: 120px;
  }
  @media (max-width: 640px) {
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
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-2);
    align-items: start;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--ink);
    text-decoration: none;
  }
  .session .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-top: 5px;
    background: var(--hue);
  }
  .session .what {
    display: grid;
  }
  .session .state {
    grid-column: 2;
    color: var(--ink-3);
  }
  .session.done .state {
    color: var(--good);
  }
  .session.skipped {
    opacity: 0.6;
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
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: end;
    margin: var(--space-3) 0;
  }
  .grow {
    flex: 1;
    display: grid;
    gap: var(--space-1);
  }
  .add {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .add label {
    display: grid;
    gap: var(--space-1);
  }
  .add .wide {
    grid-column: 1 / -1;
  }
  .error {
    color: var(--critical-ink);
  }
  .plan {
    margin-bottom: var(--space-4);
  }
  .plan p {
    margin: var(--space-1) 0;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
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
