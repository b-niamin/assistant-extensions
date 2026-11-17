<script lang="ts">
  import { page } from '$app/state';
  import type { DataOf, ExtensionInfo } from '$shell';
  import { enhance, Icon, PageHead, Sheet, useT } from '$shell/ui';
  import { HUES, type CalendarItem } from '../../lib/calendars';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string } | null } = $props();
  const t = useT();

  const mine = $derived(data.calendars.filter((c) => c.kind !== 'app'));
  const apps = $derived(data.calendars.filter((c) => c.kind === 'app'));
  // svelte-ignore state_referenced_locally
  let hidden = $state<string[]>(data.hidden);
  $effect(() => {
    hidden = data.hidden;
  });

  /** The sheet: a new calendar, or one to change. */
  let sheet = $state<{ mode: 'add' } | { mode: 'edit'; cal: CalendarItem } | null>(page.url.searchParams.has('add') ? { mode: 'add' } : null);
  let kind = $state<'own' | 'link'>('own');
  // svelte-ignore state_referenced_locally
  let hue = $state<string>(data.nextHue);
  let confirmRemove = $state(false);
  function open(next: typeof sheet) {
    sheet = next;
    confirmRemove = false;
    kind = 'own';
    hue = next?.mode === 'edit' ? next.cal.hue : data.nextHue;
  }
  const close = () => (sheet = null);
  const done = () => async ({ update, result }: { update: (o?: { reset?: boolean }) => Promise<void>; result: { type: string } }) => {
    await update({ reset: false });
    if (result.type === 'success') close();
  };
  const appIcon = (id: string) => ((page.data.extensions ?? []) as ExtensionInfo[]).find((e) => e.id === id)?.icon ?? 'apps';
  const what = (c: CalendarItem) => {
    if (c.problem) return c.kind === 'feed' ? (data.errors[c.key] ?? t('not loading')) : t('did not answer');
    return c.kind === 'own' ? t('Your entries') : c.kind === 'feed' ? t('From a link, read-only') : t('From the app');
  };
</script>

<svelte:head><title>{t('Calendars')} · {t('Calendar')}</title></svelte:head>

<PageHead title={t('Calendars')} sub={t('Which calendars the month shows. Each person picks their own.')} accessory="pencil">
  {#snippet actions()}
    <button type="button" class="btn-glass btn-icon" onclick={() => open({ mode: 'add' })} aria-label={t('Add a calendar')}><Icon name="plus" /></button>
  {/snippet}
</PageHead>

{#snippet row(c: CalendarItem)}
  {@const on = !hidden.includes(c.key)}
  <div class="list-row" style="--hue: var(--hue-{c.hue})">
    <span class="list-icon" style:--c="var(--hue-{c.hue})">
      <Icon name={c.kind === 'feed' ? 'link' : c.kind === 'app' ? appIcon(c.key) : 'calendar'} size={18} />
    </span>
    {#if c.id}
      <button type="button" class="list-text edit" onclick={() => open({ mode: 'edit', cal: c })}>
        <span class="list-title">{c.name}</span>
        <span class="list-sub" class:bad={c.problem}>{what(c)}</span>
      </button>
    {:else}
      <span class="list-text">
        <span class="list-title">{c.name}</span>
        <span class="list-sub" class:bad={c.problem}>{what(c)}</span>
      </span>
    {/if}
    <form
      class="list-end"
      method="POST"
      action="?/show"
      use:enhance={() => {
        const before = hidden;
        hidden = on ? [...hidden, c.key] : hidden.filter((k) => k !== c.key);
        return async ({ result, update }) => {
          if (result.type !== 'success') {
            hidden = before;
            await update();
          }
        };
      }}
    >
      <input type="hidden" name="key" value={c.key} />
      <input type="hidden" name="on" value={on ? '0' : '1'} />
      <button class="switch" role="switch" aria-checked={on} aria-label={on ? t('Hide {name}', { name: c.name }) : t('Show {name}', { name: c.name })}><span></span></button>
    </form>
  </div>
{/snippet}

<div class="section-head"><h2>{t('Your calendars')}</h2></div>
{#if mine.length}
  <div class="list-group">{#each mine as c (c.key)}{@render row(c)}{/each}</div>
{:else}
  <p class="muted">{t('None yet. Add one for your own entries ("Family", "Work"), or subscribe to Google, iCloud or Outlook by a link.')}</p>
{/if}
<button type="button" class="btn-tinted btn-block add" onclick={() => open({ mode: 'add' })}><Icon name="calendar-plus" size={20} />{t('Add a calendar')}</button>

{#if apps.length}
  <div class="section-head"><h2>{t('From the apps')}</h2></div>
  <div class="list-group">{#each apps as c (c.key)}{@render row(c)}{/each}</div>
{/if}

{#if sheet}
  <Sheet title={sheet.mode === 'add' ? t('New calendar') : sheet.cal.name} onclose={close}>
    {#if sheet.mode === 'add'}
      <form method="POST" action="?/add" class="form" use:enhance={done}>
        <div class="choice" role="radiogroup" aria-label={t('Kind')}>
          <label class:on={kind === 'own'}>
            <input type="radio" name="kind" value="own" bind:group={kind} />
            <Icon name="calendar" /><b>{t('Your own')}</b><span>{t('Entries added here or by Claude')}</span>
          </label>
          <label class:on={kind === 'link'}>
            <input type="radio" name="kind" value="link" bind:group={kind} />
            <Icon name="link" /><b>{t('From a link')}</b><span>{t('Google, iCloud, Outlook (ICS)')}</span>
          </label>
        </div>
        <label>{t('Name')}<input name="name" required maxlength="60" placeholder={kind === 'own' ? t('e.g. Family') : t('e.g. Work')} /></label>
        {#if kind === 'link'}
          <label>
            {t('Link')}<input name="link" type="url" required inputmode="url" autocomplete="off" placeholder="https://… .ics" />
            <span class="hint">{t('Google: calendar settings, "Secret address in iCal format". iCloud: share as a public calendar. Outlook: publish the calendar, ICS. The link is kept secret.')}</span>
          </label>
        {/if}
        {@render colours()}
        {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
        <button class="btn-primary btn-lg btn-block">{t('Add the calendar')}</button>
      </form>
    {:else}
      {@const c = sheet.cal}
      <form method="POST" action="?/edit" class="form" use:enhance={done}>
        <input type="hidden" name="id" value={c.id} />
        <label>{t('Name')}<input name="name" required maxlength="60" value={c.name} /></label>
        {@render colours()}
        {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
        <button class="btn-primary btn-lg btn-block">{t('Save')}</button>
      </form>
      <form method="POST" action="?/remove" class="remove" use:enhance={done}>
        <input type="hidden" name="id" value={c.id} />
        {#if confirmRemove}
          <p>{c.kind === 'own' ? t('Remove “{name}” and every entry in it?', { name: c.name }) : t('Stop showing “{name}”? The link is forgotten.', { name: c.name })}</p>
          <button class="btn-danger btn-block">{t('Remove')}</button>
        {:else}
          <button type="button" class="btn-plain danger" onclick={() => (confirmRemove = true)}>{t('Remove the calendar')}</button>
        {/if}
      </form>
    {/if}
  </Sheet>
{/if}

{#snippet colours()}
  <fieldset class="colours">
    <legend>{t('Colour')}</legend>
    {#each HUES as h (h)}
      <label style="--c: var(--hue-{h})"><input type="radio" name="hue" value={h} bind:group={hue} /><span class="sr">{h}</span></label>
    {/each}
  </fieldset>
{/snippet}

<style>
  .add {
    margin-top: var(--space-3);
  }
  .edit {
    border: 0;
    padding: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .bad {
    color: var(--critical-ink);
  }
  /* The on/off switch of a row: a button, so it posts without a page of its own. */
  .switch {
    position: relative;
    width: 51px;
    height: 31px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--fill-1);
    cursor: pointer;
    transition: background 150ms;
  }
  .switch::after {
    content: '';
    position: absolute;
    inset: -7px -2px;
  }
  .switch span {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 4px rgb(0 0 0 / 20%);
    transition: transform 150ms;
  }
  .switch[aria-checked='true'] {
    background: var(--hue);
  }
  .switch[aria-checked='true'] span {
    transform: translateX(20px);
  }
  .form {
    display: grid;
    gap: var(--space-4);
  }
  .form label {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .form input:not([type='radio']) {
    width: 100%;
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .choice {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .choice label {
    display: grid;
    gap: 2px;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--fill-2);
    color: var(--ink-3);
    cursor: pointer;
  }
  .choice label :global(svg) {
    color: var(--accent-ink);
  }
  .choice b {
    color: var(--ink);
    font-size: var(--text-md);
  }
  .choice label.on {
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .choice input,
  .colours input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .colours {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    border: 0;
    margin: 0;
    padding: 0;
  }
  .colours legend {
    font-size: var(--text-sm);
    color: var(--ink-2);
    margin-bottom: var(--space-2);
  }
  .colours label {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--c);
    cursor: pointer;
  }
  .colours label:has(input:checked) {
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 5px var(--c);
  }
  .colours label:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 6px;
  }
  .error {
    color: var(--critical-ink);
    margin: 0;
  }
  .remove {
    margin-top: var(--space-5);
    display: grid;
    gap: var(--space-2);
    text-align: center;
  }
  .remove p {
    margin: 0;
  }
  .danger {
    color: var(--critical-ink);
  }
</style>
