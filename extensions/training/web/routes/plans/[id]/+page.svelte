<script lang="ts">
  import type { DataOf } from '$shell';
  import { enhance, Mascot, useT } from '$shell/ui';
  import { itemHue, minutesOf, mondayOf } from '../../../lib/model';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; saved?: boolean } | null } = $props();
  const t = useT();
  let editing = $state(false);
  let confirmDelete = $state(false);

  const pl = $derived(data.plan);
  const weeks = $derived.by(() => {
    const by = new Map<string, typeof data.sessions>();
    for (const s of data.sessions) {
      const m = mondayOf(s.day);
      by.set(m, [...(by.get(m) ?? []), s]);
    }
    return [...by.entries()];
  });
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const statusText = (s: string) => (s === 'done' ? t('done') : s === 'skipped' ? t('skipped') : t('planned'));
  const stateText = $derived(pl.state === 'active' ? t('Active') : pl.state === 'waiting' ? t('Waiting') : t('Finished'));
</script>

<svelte:head><title>{pl.name} · {t('Training')}</title></svelte:head>

<nav class="crumbs"><a href="/training">{t('Training')}</a> · <a href="/training/plans">{t('Plans')}</a></nav>

<header class="head rise">
  <Mascot mood={pl.state === 'active' ? 'charged' : 'steady'} size={56} label={t('Pingo in a sweatband')} />
  <div>
    <p class="eyebrow">{stateText}{pl.start_day || pl.end_day ? ` · ${pl.start_day ?? '…'} – ${pl.end_day ?? '…'}` : ''}</p>
    <h1>{pl.name}</h1>
    {#if pl.goal}<p class="muted">{pl.goal}</p>{/if}
  </div>
</header>

<div class="actions rise">
  <a class="btn btn-primary" href="/training/session/new?plan={pl.id}&day={data.today}">{t('Add a workout')}</a>
  <form method="POST" action="?/state" use:enhance class="row">
    {#if pl.state === 'active'}
      <button class="btn" name="how" value="pause">{t('Set aside')}</button>
      <button class="btn btn-ghost" name="how" value="finish">{t('Mark finished')}</button>
    {:else if pl.state === 'waiting'}
      <button class="btn" name="how" value="activate">{t('Make active')}</button>
      <button class="btn btn-ghost" name="how" value="finish">{t('Mark finished')}</button>
    {:else}
      <button class="btn" name="how" value="activate">{t('Make active again')}</button>
      <button class="btn btn-ghost" name="how" value="reopen">{t('Back to waiting')}</button>
    {/if}
  </form>
  <button class="btn btn-ghost" type="button" onclick={() => (editing = !editing)}>{t('Edit')}</button>
</div>

{#if editing}
  <section class="card rise">
    <form
      method="POST"
      action="?/edit"
      class="form"
      use:enhance={() => async ({ update, result }) => {
        await update({ reset: false });
        if (result.type === 'success') editing = false;
      }}
    >
      <label class="wide">{t('Name')}<input name="name" required maxlength="120" value={pl.name} /></label>
      <label class="wide">{t('Goal (optional)')}<input name="goal" maxlength="1000" value={pl.goal ?? ''} /></label>
      <label>{t('From')}<input name="start_day" type="date" value={pl.start_day ?? ''} /></label>
      <label>{t('Until')}<input name="end_day" type="date" value={pl.end_day ?? ''} /></label>
      <label class="wide">{t('Notes')}<textarea name="notes" rows="3" maxlength="4000">{pl.notes ?? ''}</textarea></label>
      {#if form?.error}<p class="error wide" role="alert">{form.error}</p>{/if}
      <div class="row wide">
        <button class="btn btn-primary">{t('Save')}</button>
        <button class="btn btn-ghost" type="button" onclick={() => (editing = false)}>{t('Cancel')}</button>
      </div>
    </form>
  </section>
{:else if pl.notes}
  <p class="pre muted">{pl.notes}</p>
{/if}

<section class="card rise" aria-labelledby="w-title">
  <h2 id="w-title">{t('Workouts')} <span class="muted small">{t('{done} of {n} workouts done', { done: pl.done, n: pl.sessions })}</span></h2>
  {#each weeks as [monday, list] (monday)}
    <h3 class="small">{t('Week of {day}', { day: dayName(monday) })}</h3>
    <ul class="sessions">
      {#each list as s (s.id)}
        {@const min = minutesOf(s)}
        <li>
          <a class="session {s.status}" class:today={s.day === data.today} href="/training/session/{s.id}">
            <span class="day small">{dayName(s.day)}</span>
            <span class="what">
              <strong>{s.title}</strong>
              <span class="dots" aria-hidden="true">{#each s.items as it, k (k)}<span style="background: var(--hue-{itemHue(it)})"></span>{/each}</span>
            </span>
            <span class="muted small">{[min ? `${min} min` : '', statusText(s.status)].filter(Boolean).join(' · ')}</span>
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">{t('No workouts in this plan yet. Add one, or ask Claude to fill the plan.')}</p>
  {/each}
</section>

<section class="danger">
  {#if !confirmDelete}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmDelete = true)}>{t('Delete this plan')}</button>
  {:else}
    <form method="POST" action="?/remove" class="row">
      <span>{t('Delete the plan for good?')}</span>
      <label class="row"><input type="checkbox" name="with_sessions" /> {t('Also its workouts still planned')}</label>
      <button class="btn">{t('Delete')}</button>
      <button class="btn btn-ghost" type="button" onclick={() => (confirmDelete = false)}>{t('Cancel')}</button>
    </form>
  {/if}
</section>

<style>
  .crumbs {
    margin-bottom: var(--space-3);
  }
  .head {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    margin-bottom: var(--space-4);
  }
  .head h1,
  .head p {
    margin: 0;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: var(--space-4);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .card {
    margin-bottom: var(--space-4);
  }
  h2 {
    margin: 0 0 var(--space-3);
  }
  h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: var(--ink-2);
  }
  .small {
    font-size: var(--text-sm);
  }
  .pre {
    white-space: pre-line;
  }
  .form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .form label {
    display: grid;
    gap: var(--space-1);
  }
  .form .wide {
    grid-column: 1 / -1;
  }
  .error {
    color: var(--critical-ink);
  }
  .sessions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-1);
  }
  .session {
    display: grid;
    grid-template-columns: 7rem 1fr auto;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--ink);
    text-decoration: none;
  }
  @media (max-width: 640px) {
    .session {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
  .session.today {
    outline: 2px solid var(--accent);
  }
  .session.skipped {
    opacity: 0.6;
  }
  .session.done .muted {
    color: var(--good-ink);
  }
  .what {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
    min-width: 0;
  }
  .dots {
    display: inline-flex;
    gap: 3px;
  }
  .dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .danger {
    margin: var(--space-6) 0;
  }
</style>
