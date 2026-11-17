<script lang="ts">
  import type { DataOf } from '$shell';
  import { enhance, PageHead, Sheet, useT } from '$shell/ui';
  import { fmtShort, keyOf, usedOn, type Logged } from '../../lib/gym';
  import { GROUP_LABELS, GROUPS, MUSCLES, searchLibrary, type LibraryEntry } from '../../lib/library';
  import { CARDIO_SPORTS, SPORT_LABELS, UNITS } from '../../lib/model';
  import ExerciseInfo from '../../lib/ui/ExerciseInfo.svelte';
  import PhotoPick from '../../lib/ui/PhotoPick.svelte';
  import Thumb from '../../lib/ui/Thumb.svelte';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; saved?: string } | null } = $props();
  const t = useT();
  const lib = $derived(data.library as LibraryEntry[]);
  const history = $derived(data.history as Logged[]);
  const used = $derived(usedOn(history));
  let query = $state('');
  let group = $state('all');
  let info = $state<LibraryEntry | null>(null);
  let editing = $state<LibraryEntry | null>(null);
  let adding = $state(false);
  let kind = $state<'exercise' | 'cardio'>('exercise');
  let photo = $state('');
  let entryName = $state('');
  let startForm = $state<HTMLFormElement>();

  const list = $derived(
    searchLibrary(lib, query, group, t).sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id)) || t(a.name).localeCompare(t(b.name), t.locale))
  );
  const unitLabel = (u: string) => (u === 'minutes' ? t('Minutes') : u === 'seconds' ? t('Seconds') : t('Reps'));
  const sub = (e: LibraryEntry) =>
    e.kind === 'cardio' ? t(SPORT_LABELS[e.sport ?? 'other']) : e.muscles?.length ? e.muscles.map((m) => t(MUSCLES[m])).join(', ') : unitLabel(e.unit ?? 'reps');
  function edit(e: LibraryEntry | null) {
    info = null;
    editing = e;
    kind = e?.kind ?? 'exercise';
    photo = e?.photo ?? '';
    entryName = e?.name ?? '';
    adding = true;
  }
</script>

<svelte:head><title>{t('Exercises')} · {t('Training')}</title></svelte:head>

<PageHead title={t('Exercises')} sub={t('How to do them, common mistakes and the muscles that work')} />

<input class="search" type="search" placeholder={t('Search an exercise')} aria-label={t('Search the library')} bind:value={query} autocomplete="off" />
<div class="chips" role="radiogroup" aria-label={t('Group')}>
  {#each ['all', 'back_friendly', ...GROUPS] as g (g)}
    <button type="button" class="chip" role="radio" aria-checked={group === g} onclick={() => (group = g)}>
      {g === 'all' ? t('All') : g === 'back_friendly' ? t('For a sore lower back') : t(GROUP_LABELS[g as keyof typeof GROUP_LABELS])}
    </button>
  {/each}
</div>

<div class="list-group libl">
  {#each list as e (e.id)}
    <button type="button" class="list-row" onclick={() => (info = e)}>
      <Thumb ref={e.id} name={t(e.name)} sport={e.kind === 'cardio' ? (e.sport ?? 'other') : undefined} cls="sm" />
      <span class="list-text"><span class="list-title">{t(e.name)}</span><span class="list-sub">{sub(e)}{e.custom ? ` · ${t('yours')}` : ''}</span></span>
      {#if used.has(e.id)}<span class="list-end">{t('done {day}', { day: fmtShort(used.get(e.id)!, t.locale) })}</span>{/if}
    </button>
  {:else}
    <div class="empty">{t('No such exercise in the library. Add it as your own below, or during a workout.')}</div>
  {/each}
</div>

<button class="btn btn-block" type="button" onclick={() => edit(null)}>+ {t('Your own exercise')}</button>

<form method="POST" action="?/start" bind:this={startForm} hidden><input type="hidden" name="id" value={info?.id ?? ''} /></form>

{#if info}
  {@const e = info}
  <Sheet onclose={() => (info = null)}>
    <ExerciseInfo entry={e} name={e.name} keyId={keyOf({ ref: e.id })} {history} action={{ label: t('Start a workout with this exercise'), run: () => startForm?.requestSubmit() }} />
    {#if e.custom}
      <div class="row" style:display="flex" style:gap="8px" style:margin-top="10px">
        <button type="button" class="btn btn-sm" onclick={() => edit(e)}>{t('Edit')}</button>
        <form method="POST" action="?/remove" use:enhance={() => async ({ update }) => { info = null; await update(); }}>
          <input type="hidden" name="id" value={e.id} /><button class="btn-danger btn-sm">{t('Delete')}</button>
        </form>
      </div>
    {/if}
  </Sheet>
{/if}

{#if adding}
  <Sheet title={editing ? t('Change “{name}”', { name: editing.name }) : t('Your own exercise')} onclose={() => ((adding = false), (editing = null))}>
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
      <label>{t('Name')}<input name="name" required maxlength="80" bind:value={entryName} /></label>
      <div class="two">
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
        {/if}
      </div>
      {#if kind !== 'cardio'}
        <PhotoPick bind:photo name={entryName} />
        <fieldset class="checks" style:border="0" style:padding="0" style:margin="0">
          <legend class="small muted" style:margin-bottom="6px">{t('Muscles')}</legend>
          {#each Object.entries(MUSCLES) as [id, label] (id)}
            <label><input type="checkbox" name="muscles" value={id} checked={editing?.muscles?.includes(id as never)} /> {t(label)}</label>
          {/each}
        </fieldset>
      {/if}
      <label>{t('How to do it (optional)')}<textarea name="description" rows="3" maxlength="2000">{editing?.description ?? ''}</textarea></label>
      <label>{t('What to watch out for, one per line (optional)')}<textarea name="cautions" rows="3" maxlength="2000">{editing?.cautions?.join('\n') ?? ''}</textarea></label>
      {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
      <button class="btn-primary btn-lg btn-block">{t('Save')}</button>
    </form>
  </Sheet>
{/if}
