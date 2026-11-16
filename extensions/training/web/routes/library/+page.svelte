<script lang="ts">
  import type { DataOf } from '$shell';
  import { enhance, Mascot, useT } from '$shell/ui';
  import { GROUP_LABELS, GROUPS, MUSCLES, searchLibrary, type LibraryEntry } from '../../lib/library';
  import { CARDIO_SPORTS, SPORT_LABELS, UNITS } from '../../lib/model';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; saved?: string } | null } = $props();
  const t = useT();
  let query = $state('');
  let group = $state('all');
  let open = $state<string | null>(null);
  let editing = $state<LibraryEntry | null>(null);
  let adding = $state(false);
  let kind = $state<'exercise' | 'cardio'>('exercise');

  const list = $derived(searchLibrary(data.library as LibraryEntry[], query, group, t));
  const unitLabel = (u: string) => (u === 'minutes' ? t('Minutes') : u === 'seconds' ? t('Seconds') : t('Reps'));
  function startEdit(e: LibraryEntry | null) {
    editing = e;
    kind = e?.kind ?? 'exercise';
    adding = true;
  }
</script>

<svelte:head><title>{t('Exercises')} · {t('Training')}</title></svelte:head>

<nav class="crumbs"><a href="/training">{t('Training')}</a></nav>

<header class="head rise">
  <Mascot mood="steady" size={56} label={t('Pingo in a sweatband')} />
  <div>
    <h1>{t('Exercises')}</h1>
    <p class="muted">{t('Everything a workout can hold: cardio, exercises with how to do them and what to watch out for, recovery.')}</p>
  </div>
</header>

<div class="filters rise">
  <input type="search" placeholder={t('Search: name or muscle')} aria-label={t('Search the library')} bind:value={query} />
  <div class="chips" role="radiogroup" aria-label={t('Group')}>
    {#each ['all', ...GROUPS, 'back_friendly'] as g (g)}
      <button type="button" class="chip" role="radio" aria-checked={group === g} onclick={() => (group = g)}>
        {g === 'all' ? t('All') : g === 'back_friendly' ? t('Easy on the back') : t(GROUP_LABELS[g as keyof typeof GROUP_LABELS])}
      </button>
    {/each}
  </div>
</div>

<ul class="list rise">
  {#each list as e (e.id)}
    <li class="card entry">
      <button type="button" class="top" aria-expanded={open === e.id} onclick={() => (open = open === e.id ? null : e.id)}>
        <span class="dot" style="background: var(--hue-{e.kind === 'cardio' ? 'blue' : e.group === 'recovery' ? 'violet' : 'magenta'})" aria-hidden="true"></span>
        <span class="grow">
          <strong>{t(e.name)}</strong>{#if e.custom}<span class="muted small"> · {t('yours')}</span>{/if}<br />
          <span class="muted small">
            {e.kind === 'cardio' ? t(SPORT_LABELS[e.sport ?? 'other']) : [e.muscles?.length ? e.muscles.map((m) => t(MUSCLES[m])).join(', ') : '', e.unit !== 'reps' ? unitLabel(e.unit ?? 'reps') : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
      {#if open === e.id}
        <div class="body small">
          {#if e.also?.length}<p class="muted">{t('Also')}: {e.also.map((m) => t(MUSCLES[m])).join(', ')}</p>{/if}
          {#if e.description}<p>{t(e.description)}</p>{/if}
          {#if e.cautions?.length}
            <p class="muted">{t('Watch out for')}:</p>
            <ul>{#each e.cautions as c (c)}<li>{t(c)}</li>{/each}</ul>
          {/if}
          {#if e.back_friendly}<p class="muted">{t('Easy on the back.')}</p>{/if}
          {#if e.custom}
            <div class="row">
              <button type="button" class="btn" onclick={() => startEdit(e)}>{t('Edit')}</button>
              <form method="POST" action="?/remove" use:enhance>
                <input type="hidden" name="id" value={e.id} />
                <button class="btn btn-ghost">{t('Delete')}</button>
              </form>
            </div>
          {/if}
        </div>
      {/if}
    </li>
  {:else}
    <li class="muted">{t('Nothing found.')}</li>
  {/each}
</ul>

<section class="card rise" aria-labelledby="own-title">
  <h2 id="own-title">{editing ? t('Change “{name}”', { name: editing.name }) : t('Your own exercise')}</h2>
  {#if !adding}
    <button class="btn btn-primary" type="button" onclick={() => startEdit(null)}>{t('Add an exercise')}</button>
  {:else}
    {#key editing?.id}
      <form
        method="POST"
        action="?/save"
        class="form"
        use:enhance={() => async ({ update, result }) => {
          await update();
          if (result.type === 'success') {
            adding = false;
            editing = null;
          }
        }}
      >
        {#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
        <label class="wide">{t('Name')}<input name="name" required maxlength="80" value={editing?.name ?? ''} /></label>
        <label>{t('Kind')}
          <select name="kind" bind:value={kind}><option value="exercise">{t('Exercise')}</option><option value="cardio">{t('Cardio')}</option></select>
        </label>
        {#if kind === 'cardio'}
          <label>{t('Sport')}
            <select name="sport">{#each CARDIO_SPORTS as sp (sp)}<option value={sp} selected={editing?.sport === sp}>{t(SPORT_LABELS[sp])}</option>{/each}</select>
          </label>
        {:else}
          <label>{t('Counts')}
            <select name="unit">{#each UNITS as u (u)}<option value={u} selected={(editing?.unit ?? 'reps') === u}>{unitLabel(u)}</option>{/each}</select>
          </label>
          <fieldset class="wide muscles">
            <legend>{t('Muscles')}</legend>
            {#each Object.entries(MUSCLES) as [id, label] (id)}
              <label class="check"><input type="checkbox" name="muscles" value={id} checked={editing?.muscles?.includes(id as never)} /> {t(label)}</label>
            {/each}
          </fieldset>
        {/if}
        <label class="wide">{t('How to do it (optional)')}<textarea name="description" rows="3" maxlength="2000">{editing?.description ?? ''}</textarea></label>
        <label class="wide">{t('What to watch out for, one per line (optional)')}<textarea name="cautions" rows="3" maxlength="2000">{editing?.cautions?.join('\n') ?? ''}</textarea></label>
        {#if form?.error}<p class="error wide" role="alert">{form.error}</p>{/if}
        <div class="row wide">
          <button class="btn btn-primary">{t('Save')}</button>
          <button class="btn btn-ghost" type="button" onclick={() => ((adding = false), (editing = null))}>{t('Cancel')}</button>
        </div>
      </form>
    {/key}
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
  .filters {
    display: grid;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
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
  .list {
    list-style: none;
    margin: 0 0 var(--space-5);
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-2);
    align-items: start;
  }
  .entry {
    padding: 0;
  }
  .top {
    width: 100%;
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-3);
    border: 0;
    background: none;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .body {
    padding: 0 var(--space-3) var(--space-3);
  }
  .body p {
    margin: var(--space-1) 0;
  }
  .body ul {
    margin: 0;
    padding-left: var(--space-5);
  }
  .small {
    font-size: var(--text-sm);
  }
  h2 {
    margin: 0 0 var(--space-3);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
    margin-top: var(--space-2);
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
  .muscles {
    border: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-1);
  }
  .muscles legend {
    margin-bottom: var(--space-2);
  }
  label.check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .error {
    color: var(--critical-ink);
  }
</style>
