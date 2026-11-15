<script lang="ts">
  import type { DataOf } from '$shell';
  import { enhance, Mascot, useT, type Mood } from '$shell/ui';
  import { SPORT_HUES, SPORT_LABELS, SPORTS, stepsLine, type Exercise } from '../../../lib/model';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; saved?: boolean; logged?: string } | null } = $props();
  const t = useT();

  const s = $derived(data.session);
  let editing = $state(false);
  let confirmDelete = $state(false);

  // The logger works on a copy: the logged sets when there are some, else the plan with nothing done yet.
  const startOf = (): Exercise[] =>
    structuredClone($state.snapshot(data.session.result?.exercises?.length ? data.session.result.exercises : (data.session.exercises ?? []))) as Exercise[];
  // svelte-ignore state_referenced_locally
  let log = $state<Exercise[]>(startOf());
  $effect(() => {
    void data.session.id;
    log = startOf();
  });
  let newExercise = $state('');
  // svelte-ignore state_referenced_locally
  let rpe = $state(data.session.result?.rpe != null ? String(data.session.result.rpe) : '');
  // svelte-ignore state_referenced_locally
  let note = $state(data.session.result?.note ?? '');
  // svelte-ignore state_referenced_locally
  let startedAt = $state(data.session.result?.started_at ?? '');

  // Rest timer: starts when a set is ticked.
  let restLeft = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  function tick(e: Exercise, i: number) {
    e.sets[i].done = !e.sets[i].done;
    if (!startedAt) startedAt = new Date().toISOString();
    if (e.sets[i].done) {
      restLeft = e.rest_s ?? 90;
      clearInterval(timer);
      timer = setInterval(() => {
        restLeft = Math.max(0, restLeft - 1);
        if (!restLeft) clearInterval(timer);
      }, 1000);
    }
  }
  $effect(() => () => clearInterval(timer));
  const addSet = (e: Exercise) => e.sets.push({ ...(e.sets[e.sets.length - 1] ?? { reps: 10 }), done: false });
  function addExercise() {
    const name = newExercise.trim();
    if (!name) return;
    log.push({ name, sets: [{ reps: 10 }] });
    newExercise = '';
  }
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

  const doneSets = $derived(log.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0));
  const allSets = $derived(log.reduce((n, e) => n + e.sets.length, 0));
  const mood: Mood = $derived(s.status === 'done' ? 'charged' : s.status === 'skipped' ? 'tired' : doneSets ? 'steady' : 'idle');
  const longDay = $derived(new Date(`${s.day}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }));
  const steps = $derived(stepsLine(s.steps, t));
  const statusText = $derived(s.status === 'done' ? t('done') : s.status === 'skipped' ? t('skipped') : t('planned'));
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
</script>

<svelte:head><title>{s.title} · {t('Training plan')}</title></svelte:head>

<nav class="crumbs"><a href="/training?w={s.day}">{t('Training plan')}</a></nav>

<header class="head rise" style="--hue: var(--hue-{SPORT_HUES[s.sport]})">
  <Mascot {mood} size={64} label={t('Beni in a sweatband')} />
  <div>
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>{t(SPORT_LABELS[s.sport])}{data.plan ? ` · ${data.plan.name}` : ''}</p>
    <h1>{s.title}</h1>
    <p class="muted">{longDay}{s.time_local ? ` · ${s.time_local}` : ''}{s.duration_min ? ` · ${s.duration_min} min` : ''} · <span class="status {s.status === 'done' ? 'good' : s.status === 'skipped' ? 'warning' : ''}">{statusText}</span></p>
  </div>
</header>

<section class="card rise" aria-labelledby="about-title">
  <div class="between">
    <h2 id="about-title">{t('The session')}</h2>
    {#if !editing}<button class="btn btn-ghost" type="button" onclick={() => (editing = true)}>{t('Edit')}</button>{/if}
  </div>
  {#if editing}
    <form
      method="POST"
      action="?/edit"
      class="form"
      use:enhance={() => async ({ update, result }) => {
        await update({ reset: false });
        if (result.type === 'success') editing = false;
      }}
    >
      <label class="wide">{t('Title')}<input name="title" required maxlength="120" value={s.title} /></label>
      <label>{t('Day')}<input name="day" type="date" required value={s.day} /></label>
      <label>{t('Time (optional)')}<input name="time" type="time" value={s.time_local ?? ''} /></label>
      <label>{t('Sport')}
        <select name="sport">{#each SPORTS as sp (sp)}<option value={sp} selected={sp === s.sport}>{t(SPORT_LABELS[sp])}</option>{/each}</select>
      </label>
      <label>{t('Minutes (optional)')}<input name="duration" type="number" min="1" max="1440" value={s.duration_min ?? ''} /></label>
      <label class="wide">{t('Plan')}
        <select name="plan">
          <option value="">{t('No plan')}</option>
          {#each data.plans as pl (pl.id)}<option value={pl.id} selected={pl.id === s.plan_id}>{pl.name}</option>{/each}
        </select>
      </label>
      <label class="wide">{t('Description')}<textarea name="description" rows="3" maxlength="4000">{s.description ?? ''}</textarea></label>
      {#if form?.error}<p class="error wide" role="alert">{form.error}</p>{/if}
      <div class="row wide">
        <button class="btn btn-primary">{t('Save')}</button>
        <button class="btn btn-ghost" type="button" onclick={() => (editing = false)}>{t('Cancel')}</button>
      </div>
    </form>
  {:else}
    {#if s.description}<p class="pre">{s.description}</p>{/if}
    {#if steps}<p><strong>{t('Workout')}:</strong> {steps}</p>{/if}
    {#if s.distance_m}<p class="muted">{t('Distance')}: {Math.round(s.distance_m / 100) / 10} km</p>{/if}
    <p class="muted small">
      {#if s.sent_at}{t('On the Garmin watch.')}{:else if data.watchable && s.status === 'planned'}{t('Not on the watch yet. Ask Claude: "Send this session to my watch."')}{/if}
      {#if s.activity_ref}{t('Linked to the activity {id}.', { id: s.activity_ref })}{/if}
    </p>
  {/if}
</section>

<section class="card rise" aria-labelledby="log-title">
  <div class="between">
    <h2 id="log-title">{t('Log')}</h2>
    {#if restLeft}<p class="rest num" role="timer" aria-live="polite">{t('Rest')} {mmss(restLeft)}</p>{/if}
  </div>
  <form method="POST" action="?/log" use:enhance={() => async ({ update }) => update({ reset: false })}>
    <input type="hidden" name="exercises" value={JSON.stringify(log)} />
    <input type="hidden" name="started_at" value={startedAt} />
    {#each log as e, ei (ei)}
      <fieldset class="exercise">
        <legend><strong>{e.name}</strong>{e.note ? ` · ${e.note}` : ''}</legend>
        <table>
          <thead><tr><th>{t('Set')}</th><th>kg</th><th>{e.sets.some((x) => x.seconds) ? t('Seconds') : t('Reps')}</th><th><span class="sr">{t('Done')}</span></th></tr></thead>
          <tbody>
            {#each e.sets as set, si (si)}
              <tr class:done={set.done}>
                <td class="num">{si + 1}</td>
                <td><input class="num" inputmode="decimal" aria-label={t('kg, set {n}', { n: si + 1 })} value={set.kg ?? ''} oninput={(ev) => (set.kg = num(ev.currentTarget.value))} /></td>
                <td>
                  {#if set.seconds !== undefined && set.reps === undefined}
                    <input class="num" inputmode="numeric" aria-label={t('seconds, set {n}', { n: si + 1 })} value={set.seconds ?? ''} oninput={(ev) => (set.seconds = num(ev.currentTarget.value))} />
                  {:else}
                    <input class="num" inputmode="numeric" aria-label={t('reps, set {n}', { n: si + 1 })} value={set.reps ?? ''} oninput={(ev) => (set.reps = num(ev.currentTarget.value))} />
                  {/if}
                </td>
                <td><button type="button" class="btn tick" aria-pressed={!!set.done} aria-label={t('Set {n} done', { n: si + 1 })} onclick={() => tick(e, si)}>{set.done ? '✓' : ''}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
        <button type="button" class="btn btn-ghost" onclick={() => addSet(e)}>{t('Add a set')}</button>
      </fieldset>
    {/each}
    {#if s.sport === 'strength' || log.length}
    <div class="row">
      <input class="grow" placeholder={t('Add an exercise')} aria-label={t('Add an exercise')} bind:value={newExercise} onkeydown={(ev) => ev.key === 'Enter' && (ev.preventDefault(), addExercise())} />
      <button type="button" class="btn" onclick={addExercise}>{t('Add')}</button>
    </div>
    {/if}
    <div class="row">
      <label>{t('Effort (RPE 0-10)')}
        <select name="rpe" bind:value={rpe}><option value="">–</option>{#each Array.from({ length: 11 }, (_, i) => i) as n (n)}<option value={String(n)}>{n}</option>{/each}</select>
      </label>
      <label class="grow">{t('Note')}<input name="note" maxlength="2000" bind:value={note} /></label>
    </div>
    {#if allSets}<p class="muted small">{t('{done} of {all} sets done', { done: doneSets, all: allSets })}</p>{/if}
    {#if form?.logged === 'finish'}<p class="muted" role="status">{t('Well done. Saved as done.')}</p>{:else if form?.logged}<p class="muted" role="status">{t('Saved.')}</p>{/if}
    <div class="row">
      {#if s.status !== 'done'}<button class="btn btn-primary" name="how" value="finish">{t('Finish')}</button>{/if}
      <button class="btn" name="how" value="save">{t('Save')}</button>
      {#if s.status === 'planned'}<button class="btn btn-ghost" name="how" value="skip">{t('Skip')}</button>{:else}<button class="btn btn-ghost" name="how" value="reopen">{t('Back to planned')}</button>{/if}
    </div>
  </form>
</section>

<section class="danger">
  {#if !confirmDelete}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmDelete = true)}>{t('Delete this session')}</button>
  {:else}
    <form method="POST" action="?/remove" class="row">
      <span>{t('Delete it for good?')}</span>
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
    margin-bottom: var(--space-5);
  }
  .head h1,
  .head p {
    margin: 0;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--hue);
    margin-right: var(--space-2);
  }
  section.card {
    margin-bottom: var(--space-4);
  }
  .between {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }
  .between h2 {
    margin: 0;
  }
  .pre {
    white-space: pre-line;
  }
  .small {
    font-size: var(--text-sm);
  }
  .form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .form label,
  .row label {
    display: grid;
    gap: var(--space-1);
  }
  .form .wide {
    grid-column: 1 / -1;
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: end;
    flex-wrap: wrap;
    margin: var(--space-3) 0;
  }
  .grow {
    flex: 1;
  }
  .error {
    color: var(--critical-ink);
  }
  .exercise {
    border: 0;
    padding: 0;
    margin: var(--space-4) 0;
  }
  table {
    width: 100%;
    max-width: 26rem;
    border-collapse: collapse;
    margin: var(--space-2) 0;
  }
  th:first-child {
    width: 3rem;
  }
  th {
    text-align: left;
    font-size: var(--text-sm);
    color: var(--ink-3);
    font-weight: var(--weight-medium);
  }
  td {
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
  }
  td input {
    width: 100%;
    max-width: 7rem;
  }
  tr.done td {
    color: var(--ink-3);
  }
  .tick {
    min-width: 2.5rem;
  }
  .tick[aria-pressed='true'] {
    background: var(--good);
    color: var(--page);
  }
  .rest {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--accent-ink);
  }
  .danger {
    margin: var(--space-6) 0;
  }
</style>
