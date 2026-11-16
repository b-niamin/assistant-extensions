<script lang="ts">
  import type { DataOf } from '$shell';
  import { enhance, Mascot, useT, type Mood } from '$shell/ui';
  import { GROUP_LABELS, GROUPS, itemFrom, libraryById, MUSCLES, searchLibrary, type LibraryEntry } from '../../../lib/library';
  import {
    autoTitle,
    CARDIO_SPORTS,
    itemHue,
    minutesOf,
    progressOf,
    SPORT_LABELS,
    stepLength,
    targetInput,
    parseTarget,
    UNITS,
    type CardioItem,
    type ExerciseItem,
    type Item,
    type Step
  } from '../../../lib/model';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; saved?: string } | null } = $props();
  const t = useT();

  const s = $derived(data.session);
  // The page works on a copy of the workout; Save sends it back whole.
  const copy = () => structuredClone($state.snapshot(data.session.items)) as Item[];
  // svelte-ignore state_referenced_locally
  let items = $state<Item[]>(copy());
  // svelte-ignore state_referenced_locally
  let rpe = $state(data.session.result?.rpe != null ? String(data.session.result.rpe) : '');
  // svelte-ignore state_referenced_locally
  let note = $state(data.session.result?.note ?? '');
  // svelte-ignore state_referenced_locally
  let startedAt = $state(data.session.result?.started_at ?? '');
  // svelte-ignore state_referenced_locally
  let title = $state(data.session.title);
  $effect(() => {
    void data.session;
    items = copy();
    title = data.session.title;
    rpe = data.session.result?.rpe != null ? String(data.session.result.rpe) : '';
    note = data.session.result?.note ?? '';
  });

  let picking = $state(false);
  let query = $state('');
  let group = $state('all');
  let open = $state<number | null>(null);
  let confirmDelete = $state(false);
  let dirty = $state(false);

  const found = $derived(searchLibrary(data.library as LibraryEntry[], query, group, t).slice(0, 60));
  function add(e: LibraryEntry) {
    items.push(itemFrom(e));
    dirty = true;
  }
  function addFree() {
    const name = query.trim();
    if (!name) return;
    items.push({ kind: 'exercise', name, unit: 'reps', sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }], rest_s: 90 });
    query = '';
    dirty = true;
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    dirty = true;
  }
  function remove(i: number) {
    items.splice(i, 1);
    dirty = true;
  }

  // Rest timer: starts when a set is ticked.
  let restLeft = $state(0);
  let restAll = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  function startRest(n: number) {
    restLeft = restAll = n;
    clearInterval(timer);
    timer = setInterval(() => {
      restLeft = Math.max(0, restLeft - 1);
      if (!restLeft) clearInterval(timer);
    }, 1000);
  }
  function tick(e: ExerciseItem, i: number) {
    e.sets[i].done = !e.sets[i].done;
    if (!startedAt) startedAt = new Date().toISOString();
    if (e.sets[i].done && e.rest_s && e.sets.some((x) => !x.done)) startRest(e.rest_s);
    dirty = true;
  }
  function tickCardio(c: CardioItem) {
    c.done = !c.done;
    if (!startedAt) startedAt = new Date().toISOString();
    dirty = true;
  }
  $effect(() => () => clearInterval(timer));
  const addSet = (e: ExerciseItem) => {
    const last = e.sets[e.sets.length - 1];
    e.sets.push(last ? { ...last, done: undefined } : e.unit === 'reps' ? { reps: 10 } : { seconds: e.unit === 'minutes' ? 600 : 30 });
    dirty = true;
  };
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

  // Blocks for the watch: the steps of a cardio item, as Garmin takes them.
  const KINDS = ['warmup', 'work', 'recovery', 'rest', 'cooldown'] as const;
  const KIND_LABELS: Record<string, string> = { warmup: 'Warm-up', work: 'Work', recovery: 'Recovery', rest: 'Rest', cooldown: 'Cool-down' };
  const newStep = (kind: string): Step => ({ kind, durationType: 'time', durationValue: kind === 'work' ? 300 : 600 });
  function lengthInput(st: Step): string {
    const v = Number(st.durationValue);
    if (st.durationType === 'time' && v > 0) return mmss(v);
    if (st.durationType === 'distance' && v > 0) return String(v);
    return '';
  }
  function setLength(st: Step, v: string) {
    if (st.durationType === 'time') {
      const m = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(v.trim());
      st.durationValue = m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : undefined;
    } else if (st.durationType === 'distance') st.durationValue = num(v);
    dirty = true;
  }
  function setTarget(st: Step, v: string) {
    const target = parseTarget(v);
    if (target) st.target = target;
    else delete st.target;
    dirty = true;
  }

  const prog = $derived(progressOf(items));
  const mood: Mood = $derived(s.status === 'done' ? 'charged' : s.status === 'skipped' ? 'tired' : prog.done ? 'steady' : 'idle');
  const longDay = $derived(new Date(`${s.day}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }));
  const statusText = $derived(s.status === 'done' ? t('done') : s.status === 'skipped' ? t('skipped') : t('planned'));
  const minutes = $derived(minutesOf({ duration_min: s.duration_min, items }));
  const shownTitle = $derived(title.trim() || (items.length ? autoTitle(items, t) : data.isNew ? t('New workout') : s.title));
  const entryOf = (i: Item) => (i.ref ? libraryById(i.ref, data.library as LibraryEntry[]) : undefined);
  const unitLabel = (u: string) => (u === 'minutes' ? t('Minutes') : u === 'seconds' ? t('Seconds') : t('Reps'));
</script>

<svelte:head><title>{shownTitle} · {t('Training')}</title></svelte:head>

<nav class="crumbs"><a href="/training?w={s.day}">{t('Training')}</a>{#if data.plan}{' · '}<a href="/training/plans/{data.plan.id}">{data.plan.name}</a>{/if}</nav>

<header class="head rise">
  <Mascot {mood} size={64} label={t('Pingo in a sweatband')} />
  <div>
    <p class="eyebrow">{longDay}{s.time_local ? ` · ${s.time_local}` : ''}{minutes ? ` · ${minutes} min` : ''}</p>
    <h1>{shownTitle}</h1>
    {#if !data.isNew}
      <p class="muted"><span class="status {s.status === 'done' ? 'good' : s.status === 'skipped' ? 'warning' : ''}">{statusText}</span>{#if prog.all}{'\u00a0· '}{t('{done} of {all} done', { done: prog.done, all: prog.all })}{/if}</p>
    {/if}
  </div>
</header>

<form
  method="POST"
  action="?/save"
  use:enhance={() => async ({ update, result }) => {
    await update({ reset: false });
    if (result.type === 'success') dirty = false;
  }}
>
  <input type="hidden" name="items" value={JSON.stringify(items)} />
  <input type="hidden" name="started_at" value={startedAt} />
  {#if data.template}<input type="hidden" name="template" value={data.template} />{/if}

  <details class="card rise details" open={data.isNew}>
    <summary><h2>{t('Details')}</h2><span class="muted small">{[s.day, s.time_local, data.plan?.name].filter(Boolean).join(' · ')}</span></summary>
    <div class="form">
      <label class="wide">{t('Title')}<input name="title" maxlength="120" bind:value={title} placeholder={items.length ? autoTitle(items, t) : t('e.g. Run and full body')} /></label>
      <label>{t('Day')}<input name="day" type="date" required value={s.day} onchange={() => (dirty = true)} /></label>
      <label>{t('Time (optional)')}<input name="time" type="time" value={s.time_local ?? ''} onchange={() => (dirty = true)} /></label>
      <label>{t('Plan')}
        <select name="plan" onchange={() => (dirty = true)}>
          <option value="">{t('No plan')}</option>
          {#each data.plans as pl (pl.id)}<option value={pl.id} selected={pl.id === s.plan_id}>{pl.name}{pl.active ? ` (${t('active')})` : ''}</option>{/each}
        </select>
      </label>
      <label>{t('Minutes in all (optional)')}<input name="duration" type="number" min="1" max="1440" value={s.duration_min ?? ''} onchange={() => (dirty = true)} /></label>
      <label class="wide">{t('Description')}<textarea name="description" rows="2" maxlength="4000" onchange={() => (dirty = true)}>{s.description ?? ''}</textarea></label>
    </div>
  </details>

  <section class="card rise" aria-labelledby="items-title">
    <div class="between">
      <h2 id="items-title">{t('Workout')}</h2>
      {#if restLeft}<p class="rest num" role="timer" aria-live="polite">{t('Rest')} {mmss(restLeft)} <button type="button" class="btn btn-ghost" onclick={() => (restLeft = 0, clearInterval(timer))}>{t('Skip')}</button></p>{/if}
    </div>
    {#if restLeft}<div class="restbar" aria-hidden="true"><span style:width="{restAll ? (restLeft / restAll) * 100 : 0}%"></span></div>{/if}

    {#each items as it, i (i)}
      {@const entry = entryOf(it)}
      <fieldset class="item" style="--hue: var(--hue-{itemHue(it)})">
        <legend class="sr">{it.kind === 'cardio' ? t(it.name || SPORT_LABELS[it.sport]) : t(it.name)}</legend>
        <div class="itemhead">
          <span class="dot" aria-hidden="true"></span>
          <div class="grow">
            {#if it.kind === 'cardio'}
              <strong>{it.name ? t(it.name) : t(SPORT_LABELS[it.sport])}</strong>
            {:else}
              <strong>{t(it.name)}</strong>
              {#if entry?.muscles?.length}<span class="muted small"> · {entry.muscles.map((m) => t(MUSCLES[m])).join(', ')}</span>{/if}
            {/if}
          </div>
          <div class="tools">
            {#if entry?.description || entry?.cautions}
              <button type="button" class="btn btn-ghost" aria-expanded={open === i} onclick={() => (open = open === i ? null : i)}>{t('How to')}</button>
            {/if}
            <button type="button" class="btn btn-ghost" aria-label={t('Move up')} disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
            <button type="button" class="btn btn-ghost" aria-label={t('Move down')} disabled={i === items.length - 1} onclick={() => move(i, 1)}>↓</button>
            <button type="button" class="btn btn-ghost" aria-label={t('Remove')} onclick={() => remove(i)}>✕</button>
          </div>
        </div>
        {#if open === i && entry}
          <div class="howto small">
            {#if entry.description}<p>{t(entry.description)}</p>{/if}
            {#if entry.cautions?.length}
              <p class="muted">{t('Watch out for')}:</p>
              <ul>{#each entry.cautions as c (c)}<li>{t(c)}</li>{/each}</ul>
            {/if}
          </div>
        {/if}

        {#if it.kind === 'cardio'}
          {@const c = it}
          <div class="cardio">
            <label class="field sport">{t('Sport')}
              <select bind:value={c.sport} onchange={() => (dirty = true)}>
                {#each CARDIO_SPORTS as sp (sp)}<option value={sp}>{t(SPORT_LABELS[sp])}</option>{/each}
              </select>
            </label>
            <label class="field">{t('Time')}
              <span class="unitbox"><input class="num" inputmode="numeric" placeholder="–" value={c.duration_min ?? ''} oninput={(ev) => ((c.duration_min = num(ev.currentTarget.value)), (dirty = true))} /><span class="unit">min</span></span>
            </label>
            <label class="field">{t('Distance')}
              <span class="unitbox"><input class="num" inputmode="decimal" placeholder="–" value={c.distance_m ? c.distance_m / 1000 : ''} oninput={(ev) => { const v = num(ev.currentTarget.value); c.distance_m = v ? Math.round(v * 1000) : undefined; dirty = true; }} /><span class="unit">km</span></span>
            </label>
            <button type="button" class="donebtn" aria-pressed={!!c.done} onclick={() => tickCardio(c)}><span class="check" aria-hidden="true">✓</span>{c.done ? t('Done') : t('Mark done')}</button>
          </div>
          <details class="blocks" open={!!c.steps?.length}>
            <summary class="small">{t('Blocks for the watch')}{c.steps?.length ? ` (${c.steps.length})` : ''}</summary>
            {#snippet row(st: Step, list: Step[], k: number)}
              <div class="step">
                <select aria-label={t('Part')} bind:value={st.kind} onchange={() => (dirty = true)}>
                  {#each KINDS as kd (kd)}<option value={kd}>{t(KIND_LABELS[kd])}</option>{/each}
                </select>
                <select aria-label={t('Length')} bind:value={st.durationType} onchange={() => ((st.durationValue = undefined), (dirty = true))}>
                  <option value="time">{t('Time')}</option>
                  <option value="distance">{t('Distance')}</option>
                  <option value="lap">{t('Until lap')}</option>
                </select>
                {#if st.durationType !== 'lap'}
                  <input class="num" aria-label={st.durationType === 'time' ? t('Time, mm:ss') : t('Metres')} placeholder={st.durationType === 'time' ? 'mm:ss' : 'm'} value={lengthInput(st)} onchange={(ev) => setLength(st, ev.currentTarget.value)} />
                {:else}<span></span>{/if}
                <input aria-label={t('Target: pace 4:50-5:10 or heart rate 140-150')} placeholder={t('pace 4:50-5:10 / HR 140-150')} value={targetInput(st.target)} onchange={(ev) => setTarget(st, ev.currentTarget.value)} />
                <button type="button" class="btn btn-ghost" aria-label={t('Remove')} onclick={() => (list.splice(k, 1), (dirty = true))}>✕</button>
              </div>
            {/snippet}
            {#each c.steps ?? [] as st, k (k)}
              {#if st.kind === 'repeat'}
                {@const inner = st.steps as Step[]}
                <div class="repeat">
                  <label class="inline">{t('Repeat')}
                    <input class="num reps" inputmode="numeric" value={st.repeats ?? 2} onchange={(ev) => ((st.repeats = Math.max(1, Math.min(50, Number(ev.currentTarget.value) || 1))), (dirty = true))} />×
                  </label>
                  <button type="button" class="btn btn-ghost" aria-label={t('Remove')} onclick={() => (c.steps!.splice(k, 1), (dirty = true))}>✕</button>
                  {#each inner as s2, k2 (k2)}{@render row(s2, inner, k2)}{/each}
                  <button type="button" class="btn btn-ghost small" onclick={() => (inner.push(newStep('work')), (dirty = true))}>+ {t('Step')}</button>
                </div>
              {:else}
                {@render row(st, c.steps!, k)}
              {/if}
            {/each}
            <div class="row">
              <button type="button" class="btn" onclick={() => ((c.steps ??= []).push(newStep(c.steps?.length ? 'work' : 'warmup')), (dirty = true))}>+ {t('Step')}</button>
              <button type="button" class="btn" onclick={() => ((c.steps ??= []).push({ kind: 'repeat', repeats: 4, steps: [{ kind: 'work', durationType: 'distance', durationValue: 400 }, { kind: 'recovery', durationType: 'time', durationValue: 90 }] }), (dirty = true))}>+ {t('Repeat')}</button>
            </div>
            {#if c.steps?.length}<p class="muted small">{c.steps.map((x) => (x.kind === 'repeat' ? `${x.repeats}×` : stepLength(x, t))).join(' · ')}</p>{/if}
          </details>
        {:else}
          {@const e = it}
          <ol class="sets">
            <li class="set sethead" class:single={e.unit === 'minutes'} aria-hidden="true">
              <span></span>{#if e.unit !== 'minutes'}<span>kg</span>{/if}<span>{e.unit === 'reps' ? t('reps') : e.unit === 'seconds' ? 's' : 'min'}</span>
            </li>
            {#each e.sets as set, si (si)}
              <li class="set" class:done={set.done} class:single={e.unit === 'minutes'}>
                <span class="setno num" aria-hidden="true">{si + 1}</span>
                {#if e.unit !== 'minutes'}
                  <span class="unitbox"><input class="num" inputmode="decimal" placeholder="–" aria-label={t('kg, set {n}', { n: si + 1 })} value={set.kg ?? ''} oninput={(ev) => ((set.kg = num(ev.currentTarget.value)), (dirty = true))} /><span class="unit">kg</span></span>
                {/if}
                {#if e.unit === 'reps'}
                  <span class="unitbox"><input class="num" inputmode="numeric" placeholder="–" aria-label={t('reps, set {n}', { n: si + 1 })} value={set.reps ?? ''} oninput={(ev) => ((set.reps = num(ev.currentTarget.value)), (dirty = true))} /><span class="unit">{t('reps')}</span></span>
                {:else if e.unit === 'seconds'}
                  <span class="unitbox"><input class="num" inputmode="numeric" placeholder="–" aria-label={t('seconds, set {n}', { n: si + 1 })} value={set.seconds ?? ''} oninput={(ev) => ((set.seconds = num(ev.currentTarget.value)), (dirty = true))} /><span class="unit">s</span></span>
                {:else}
                  <span class="unitbox"><input class="num" inputmode="decimal" placeholder="–" aria-label={t('minutes, set {n}', { n: si + 1 })} value={set.seconds ? set.seconds / 60 : ''} oninput={(ev) => { const v = num(ev.currentTarget.value); set.seconds = v ? Math.round(v * 60) : undefined; dirty = true; }} /><span class="unit">min</span></span>
                {/if}
                <button type="button" class="tick" aria-pressed={!!set.done} aria-label={t('Set {n} done', { n: si + 1 })} onclick={() => tick(e, si)}>✓</button>
                <button type="button" class="btn btn-ghost x" aria-label={t('Remove set {n}', { n: si + 1 })} onclick={() => (e.sets.splice(si, 1), (dirty = true))}>✕</button>
              </li>
            {/each}
          </ol>
          <div class="itemfoot">
            <button type="button" class="addset" onclick={() => addSet(e)}>+ {t('Set')}</button>
            {#if !e.ref}
              <label class="inline small">{t('Counts')}
                <select bind:value={e.unit} onchange={() => (dirty = true)}>{#each UNITS as u (u)}<option value={u}>{unitLabel(u)}</option>{/each}</select>
              </label>
            {/if}
            {#if e.unit !== 'minutes'}
              <label class="inline small">{t('Rest')}
                <select value={String(e.rest_s ?? 0)} onchange={(ev) => ((e.rest_s = Number(ev.currentTarget.value) || undefined), (dirty = true))}>
                  {#each [0, 30, 45, 60, 90, 120, 180, 240] as r (r)}<option value={String(r)}>{r ? mmss(r) : t('none')}</option>{/each}
                </select>
              </label>
            {/if}
          </div>
        {/if}
      </fieldset>
    {:else}
      <p class="muted">{t('Nothing in it yet. Add a run, exercises from the library, the sauna...')}</p>
    {/each}

    {#if !picking}
      <button type="button" class="btn btn-primary" onclick={() => (picking = true)}>+ {t('Add to the workout')}</button>
    {:else}
      <div class="picker" role="group" aria-label={t('Library')}>
        <div class="between">
          <input class="grow" type="search" placeholder={t('Search: name or muscle')} aria-label={t('Search the library')} bind:value={query} />
          <button type="button" class="btn btn-ghost" onclick={() => (picking = false)}>{t('Close')}</button>
        </div>
        <div class="chips" role="radiogroup" aria-label={t('Group')}>
          {#each ['all', ...GROUPS, 'back_friendly'] as g (g)}
            <button type="button" class="chip" role="radio" aria-checked={group === g} onclick={() => (group = g)}>
              {g === 'all' ? t('All') : g === 'back_friendly' ? t('Easy on the back') : t(GROUP_LABELS[g as keyof typeof GROUP_LABELS])}
            </button>
          {/each}
        </div>
        <ul class="found">
          {#each found as e (e.id)}
            <li>
              <button type="button" class="pick" onclick={() => add(e)}>
                <span class="dot" style="background: var(--hue-{e.kind === 'cardio' ? 'blue' : e.group === 'recovery' ? 'violet' : 'magenta'})" aria-hidden="true"></span>
                <span class="grow">
                  <strong>{t(e.name)}</strong>{#if e.custom}<span class="muted small"> · {t('yours')}</span>{/if}<br />
                  <span class="muted small">{e.kind === 'cardio' ? t('Cardio: time, distance, blocks') : e.muscles?.length ? e.muscles.map((m) => t(MUSCLES[m])).join(', ') : unitLabel(e.unit ?? 'reps')}</span>
                </span>
                <span class="plus" aria-hidden="true">+</span>
              </button>
            </li>
          {:else}
            <li class="muted small">{t('Nothing found.')}</li>
          {/each}
        </ul>
        {#if query.trim()}
          <button type="button" class="btn" onclick={addFree}>{t('Add “{name}” as an exercise', { name: query.trim() })}</button>
        {/if}
        <p class="muted small">{t('Your own exercises, with a description: ')}<a href="/training/library">{t('the library')}</a>.</p>
      </div>
    {/if}
  </section>

  <section class="card rise" aria-labelledby="how-title">
    <h2 id="how-title">{data.isNew ? t('Save') : t('How it went')}</h2>
    {#if !data.isNew}
      <fieldset class="rpe">
        <legend>{t('Effort (RPE 0-10)')}</legend>
        <div class="rpechips">
          {#each ['', ...Array.from({ length: 11 }, (_, i) => String(i))] as n (n)}
            <label class="rpechip" class:on={rpe === n}><input type="radio" name="rpe" value={n} bind:group={rpe} />{n === '' ? '–' : n}</label>
          {/each}
        </div>
      </fieldset>
      <label class="field">{t('Note')}<textarea name="note" rows="2" maxlength="2000" bind:value={note} placeholder={t('How did it feel?')}></textarea></label>
    {/if}
    {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
    {#if form?.saved === 'finish'}<p class="muted" role="status">{t('Well done. Saved as done.')}</p>{:else if form?.saved === 'template'}<p class="muted" role="status">{t('Saved, and as a template.')}</p>{:else if form?.saved && !dirty}<p class="muted" role="status">{t('Saved.')}</p>{/if}
    <div class="row">
      {#if data.isNew}
        <button class="btn btn-primary" name="how" value="save">{t('Save the workout')}</button>
        <button class="btn" name="how" value="finish">{t('Save as done')}</button>
      {:else}
        {#if s.status !== 'done'}<button class="btn btn-primary" name="how" value="finish">{t('Finish')}</button>{/if}
        <button class="btn" name="how" value="save">{dirty ? t('Save changes') : t('Save')}</button>
        {#if s.status === 'planned'}<button class="btn btn-ghost" name="how" value="skip">{t('Skip')}</button>{:else}<button class="btn btn-ghost" name="how" value="reopen">{t('Back to planned')}</button>{/if}
      {/if}
    </div>
    <details class="tpl">
      <summary class="small">{t('Save as a template')}</summary>
      <div class="row">
        <label class="grow">{t('Template name')}<input name="template_name" maxlength="120" placeholder={t('e.g. Full body A')} /></label>
        <button class="btn" name="how" value="template">{t('Save as a template')}</button>
      </div>
    </details>
    {#if !data.isNew}
      <p class="muted small">
        {#if s.sent_at}{t('On the Garmin watch.')}{:else if data.watchable && s.status === 'planned'}{t('Not on the watch yet. Ask Claude: "Send this workout to my watch."')}{/if}
        {#if s.activity_ref}{t('Linked to the activity {id}.', { id: s.activity_ref })}{/if}
      </p>
    {/if}
  </section>
</form>

{#if !data.isNew}
  <section class="danger">
    {#if !confirmDelete}
      <button class="btn btn-ghost" type="button" onclick={() => (confirmDelete = true)}>{t('Delete this workout')}</button>
    {:else}
      <form method="POST" action="?/remove" class="row">
        <span>{t('Delete it for good?')}</span>
        <button class="btn">{t('Delete')}</button>
        <button class="btn btn-ghost" type="button" onclick={() => (confirmDelete = false)}>{t('Cancel')}</button>
      </form>
    {/if}
  </section>
{/if}

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
  .head h1 {
    overflow-wrap: anywhere;
  }
  .dot {
    display: inline-block;
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--hue);
  }
  .card {
    margin-bottom: var(--space-4);
  }
  .between {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }
  h2 {
    margin: 0 0 var(--space-3);
  }
  .between h2 {
    margin: 0;
  }
  #items-title {
    margin-bottom: var(--space-3);
  }
  .small {
    font-size: var(--text-sm);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .details summary {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
    cursor: pointer;
  }
  .details summary h2 {
    margin: 0;
  }
  .form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }
  .form label,
  .row label,
  .cardio label {
    display: grid;
    gap: var(--space-1);
  }
  .form .wide {
    grid-column: 1 / -1;
  }
  @media (max-width: 640px) {
    .form {
      grid-template-columns: 1fr;
    }
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: end;
    flex-wrap: wrap;
    margin: var(--space-3) 0;
  }
  label.inline {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .error {
    color: var(--critical-ink);
  }
  .tools {
    display: flex;
    gap: 0;
  }
  .item {
    min-width: 0;
    border: 1px solid var(--ring);
    border-left: 4px solid var(--hue);
    border-radius: var(--radius-sm);
    padding: var(--space-3) var(--space-4);
    margin: 0 0 var(--space-3);
    background: var(--surface);
  }
  .itemhead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .itemhead .dot {
    display: none;
  }
  .field {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--ink-2);
    min-width: 0;
  }
  .field input,
  .field select,
  .field textarea {
    width: 100%;
    font: inherit;
    color: var(--ink);
    font-size: var(--text-base);
  }
  .unitbox {
    position: relative;
    display: block;
    min-width: 0;
  }
  .unitbox input {
    width: 100%;
    padding-right: 2.8rem;
    text-align: right;
  }
  .unit {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    font-size: var(--text-sm);
    pointer-events: none;
  }
  .cardio {
    display: grid;
    grid-template-columns: minmax(9rem, 12rem) 7.5rem 7.5rem auto;
    gap: var(--space-3);
    align-items: end;
    margin-top: var(--space-3);
  }
  @media (max-width: 640px) {
    .cardio {
      grid-template-columns: 1fr 1fr;
    }
    .cardio .sport,
    .cardio .donebtn {
      grid-column: 1 / -1;
    }
  }
  .donebtn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    justify-self: start;
    min-height: 34px;
    padding: 0 14px 0 6px;
    border: 1px solid var(--ring);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
  }
  .donebtn .check,
  .tick {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--ring);
    color: transparent;
    font-size: var(--text-sm);
    font-weight: 600;
    background: var(--surface);
  }
  .donebtn[aria-pressed='true'] {
    border-color: var(--good);
    color: var(--good-ink);
  }
  .donebtn[aria-pressed='true'] .check,
  .tick[aria-pressed='true'] {
    background: var(--good);
    border-color: var(--good);
    color: #fff;
  }
  .sets {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
    max-width: 30rem;
  }
  .set {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 2.75rem 2.25rem;
    gap: var(--space-2);
    align-items: center;
    padding: 4px;
    border-radius: var(--radius-sm);
    transition: background 0.2s;
  }
  .set.single {
    grid-template-columns: 2rem minmax(0, 12rem) 2.75rem 2.25rem;
  }
  .set.done {
    background: color-mix(in srgb, var(--good) 12%, transparent);
  }
  .set.done input {
    color: var(--good-ink);
  }
  .sethead {
    display: none;
  }
  @media (max-width: 640px) {
    .item {
      padding: var(--space-3) var(--space-2) var(--space-3) var(--space-3);
    }
    .set {
      grid-template-columns: 1.75rem minmax(0, 1fr) minmax(0, 1fr) 2.5rem 1.75rem;
      gap: 6px;
    }
    .set.single {
      grid-template-columns: 1.75rem minmax(0, 1fr) 2.5rem 1.75rem;
    }
    .sethead {
      display: grid;
      padding-bottom: 0;
      font-size: var(--text-xs);
      color: var(--ink-3);
      text-align: right;
    }
    .sethead span {
      padding-right: 10px;
    }
    .set .unit {
      display: none;
    }
    .set .unitbox input {
      padding-right: 10px;
    }
  }
  .setno {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .tick {
    width: 2.5rem;
    height: 2.5rem;
    justify-self: center;
    cursor: pointer;
    padding: 0;
  }
  .tick:not([aria-pressed='true']) {
    color: var(--ink-3);
    opacity: 0.6;
  }
  .x {
    padding: 0;
  }
  .itemfoot {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
    margin-top: var(--space-3);
  }
  .addset {
    border: 1px dashed var(--ring);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-2);
    padding: 4px 14px;
    min-height: 34px;
    cursor: pointer;
  }
  @media (hover: hover) {
    .addset:hover,
    .donebtn:hover {
      color: var(--ink);
      border-color: var(--ink-3);
    }
  }
  .rpe {
    border: 0;
    padding: 0;
    margin: 0 0 var(--space-3);
  }
  .rpe legend {
    font-size: var(--text-sm);
    color: var(--ink-2);
    margin-bottom: var(--space-2);
  }
  .rpechips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .rpechip {
    display: inline-grid;
    place-items: center;
    min-width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--ring);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .rpechip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .rpechip.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
    font-weight: 600;
  }
  .rpechip:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .blocks[open] {
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
  }
  .howto {
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    margin: var(--space-2) 0;
  }
  .howto p {
    margin: var(--space-1) 0;
  }
  .howto ul {
    margin: 0;
    padding-left: var(--space-5);
  }
  .step > * {
    min-width: 0;
  }
  .step input,
  .step select,
  .row .grow input {
    width: 100%;
  }
  .blocks {
    margin-top: var(--space-2);
  }
  .blocks summary {
    cursor: pointer;
    color: var(--ink-2);
    width: fit-content;
  }
  .step {
    display: grid;
    grid-template-columns: 8rem 8rem 6rem minmax(8rem, 1fr) auto;
    gap: var(--space-2);
    margin: var(--space-2) 0;
  }
  @media (max-width: 640px) {
    .step {
      grid-template-columns: 1fr 1fr;
    }
  }
  .repeat {
    border-left: 3px solid var(--hue);
    padding-left: var(--space-3);
    margin: var(--space-2) 0;
  }
  .repeat > label {
    display: inline-flex;
  }
  .reps {
    width: 4rem;
  }
  .rest {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--accent-ink);
  }
  .restbar {
    height: 4px;
    border-radius: 2px;
    background: var(--surface-2);
    margin: var(--space-2) 0;
    overflow: hidden;
  }
  .restbar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 1s linear;
  }
  .picker {
    border: 1px solid var(--ring);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    margin-top: var(--space-3);
    display: grid;
    gap: var(--space-3);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .chip {
    border: 1px solid var(--ring);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    padding: 2px 12px;
    font-size: var(--text-sm);
    min-height: 32px;
  }
  .chip[aria-checked='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--page);
  }
  .found {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-2);
    max-height: 26rem;
    overflow: auto;
  }
  .pick {
    width: 100%;
    display: flex;
    gap: var(--space-2);
    align-items: center;
    text-align: left;
    padding: var(--space-2);
    border: 1px solid var(--surface-2);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  @media (hover: hover) {
    .pick:hover {
      border-color: var(--ring);
    }
  }
  .plus {
    font-size: var(--text-lg);
    color: var(--accent-ink);
  }
  .tpl summary {
    cursor: pointer;
    color: var(--ink-2);
    width: fit-content;
  }
  .danger {
    margin: var(--space-6) 0;
  }
</style>
