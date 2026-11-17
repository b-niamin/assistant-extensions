<script lang="ts">
  import { replaceState } from '$app/navigation';
  import type { DataOf, SharedEntry } from '$shell';
  import { enhance, EmptyState, Icon, PageHead, Sheet, useT, type Mood } from '$shell/ui';
  import { calendarKey } from '../lib/calendars';
  import { shiftMonth } from '../lib/month';
  import { clock, daysOf } from '../lib/view';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; added?: boolean } | null } = $props();
  const t = useT();

  // svelte-ignore state_referenced_locally
  let selected = $state(data.selected);
  $effect(() => {
    selected = data.selected;
  });
  let adding = $state(false);
  let allDay = $state(false);

  const hues = $derived(new Map(data.calendars.map((c) => [c.key, c.hue])));
  const hue = (e: SharedEntry) => `--hue: var(--hue-${hues.get(calendarKey(e)) ?? 'blue'})`;
  const shown = $derived(data.entries.filter((e) => !data.hidden.includes(calendarKey(e))));
  const byDay = $derived.by(() => {
    const m = new Map<string, SharedEntry[]>();
    for (const e of shown) for (const d of daysOf(e, data.timeZone)) (m.get(d) ?? m.set(d, []).get(d)!).push(e);
    return m;
  });
  const dayList = $derived(byDay.get(selected) ?? []);
  const onToday = $derived((byDay.get(data.today) ?? []).length);
  const mood: Mood = $derived(onToday === 0 ? 'idle' : onToday > 4 ? 'charged' : 'steady');
  const line = $derived(onToday === 0 ? t('Nothing on today. A free day.') : t.n(onToday, '{n} thing on today.', '{n} things on today.'));

  const monthName = $derived(
    new Date(`${data.month}-01T12:00:00Z`).toLocaleDateString(t.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  );
  const weekdays = $derived(
    Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 10, 9 + i, 12)).toLocaleDateString(t.locale, { weekday: 'short', timeZone: 'UTC' }))
  );
  const longDay = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const timeOf = (e: SharedEntry, day: string) => {
    if (e.allDay) return t('All day');
    const days = daysOf(e, data.timeZone);
    if (days.length > 1 && day !== days[0]) return day === days[days.length - 1] ? t('until {time}', { time: clock(e.end, data.timeZone) }) : t('All day');
    return e.end === e.start ? clock(e.start, data.timeZone) : `${clock(e.start, data.timeZone)}–${clock(e.end, data.timeZone)}`;
  };
  const own = (e: SharedEntry) => e.source.extension === 'calendar' && /^e\d+$/.test(e.id);
  const where = (e: SharedEntry) => [timeOf(e, selected), e.kind ?? e.source.name, e.location].filter(Boolean).join(' · ');

  function pick(day: string) {
    selected = day;
    const month = day.slice(0, 7);
    if (month === data.month) replaceState(`?m=${month}&d=${day}`, {});
  }
</script>

<svelte:head><title>{t('Calendar')} · {t('Assistant')}</title></svelte:head>

<PageHead title={t('Calendar')} sub={line} {mood}>
  {#snippet actions()}
    <button type="button" class="btn-glass btn-icon" onclick={() => (adding = true)} aria-label={t('Add an entry')}><Icon name="plus" /></button>
  {/snippet}
</PageHead>

<div class="layout">
  <section class="card month" aria-labelledby="month-title">
    <div class="month-head">
      <h2 id="month-title">{monthName}</h2>
      {#if !data.today.startsWith(data.month)}<a class="btn-plain btn-sm" href="?d={data.today}" data-sveltekit-noscroll>{t('Today')}</a>{/if}
      <a class="btn btn-icon btn-sm" href="?m={shiftMonth(data.month, -1)}" aria-label={t('Previous month')} data-sveltekit-noscroll><Icon name="back" size={18} /></a>
      <a class="btn btn-icon btn-sm" href="?m={shiftMonth(data.month, 1)}" aria-label={t('Next month')} data-sveltekit-noscroll><Icon name="forward" size={18} /></a>
    </div>
    <table class="grid" aria-label={monthName}>
      <thead>
        <tr>{#each weekdays as w (w)}<th scope="col">{w}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each data.weeks as week (week[0])}
          <tr>
            {#each week as day (day)}
              {@const list = byDay.get(day) ?? []}
              <td class:out={!day.startsWith(data.month)} class:today={day === data.today} class:sel={day === selected}>
                <button type="button" class="cell" onclick={() => pick(day)} aria-pressed={day === selected}>
                  <span class="num">{Number(day.slice(8))}</span>
                  <span class="sr">{longDay(day)}, {t.n(list.length, '{n} entry', '{n} entries')}</span>
                  <span class="items" aria-hidden="true">
                    {#each list.slice(0, 3) as e (e.source.extension + e.id)}
                      <span class="item" style={hue(e)}>{e.title}</span>
                    {/each}
                    {#if list.length > 3}<span class="more">+{list.length - 3}</span>{/if}
                  </span>
                </button>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="day" aria-labelledby="day-title">
    <div class="section-head"><h2 id="day-title">{longDay(selected)}</h2></div>
    {#if dayList.length}
      <div class="list-group">
        {#each dayList as e (e.source.extension + e.id)}
          <div class="list-row entry" style={hue(e)}>
            <span class="list-icon swatch" aria-hidden="true"></span>
            <span class="list-text">
              {#if e.href && !e.href.startsWith('/calendar')}<a class="list-title" href={e.href}>{e.title}</a>{:else}<span class="list-title">{e.title}</span>{/if}
              <span class="list-sub">{where(e)}</span>
              {#if e.note}<span class="list-sub note">{e.note}</span>{/if}
            </span>
            {#if own(e)}
              <form class="list-end" method="POST" action="?m={data.month}&d={selected}&/remove" use:enhance>
                <input type="hidden" name="id" value={e.id} />
                <button class="btn-plain btn-icon btn-sm" aria-label={t('Remove {title}', { title: e.title })}><Icon name="trash" size={18} /></button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="card">
        <EmptyState mood="asleep" size={56} level={3} title={t('Nothing on this day.')}>
          {#if !data.own.length}<p class="muted">{t('Add a calendar, then your entries.')} <a href="/calendar/calendars">{t('Calendars')}</a></p>{/if}
        </EmptyState>
      </div>
    {/if}
    <button type="button" class="btn-tinted btn-block add" onclick={() => (adding = true)}><Icon name="plus" size={18} />{t('Add an entry')}</button>
  </section>
</div>

{#if adding}
  <Sheet title={t('New entry')} onclose={() => (adding = false)}>
    {#if !data.own.length}
      <EmptyState mood="idle" size={56} level={3} title={t('No calendar yet')}>
        <p class="muted">{t('Entries go into a calendar. Add one first, e.g. "Family" or "Work".')}</p>
      </EmptyState>
      <a class="btn-primary btn-lg btn-block" href="/calendar/calendars?add=1">{t('Add a calendar')}</a>
    {:else}
      <form
        method="POST"
        action="?m={data.month}&d={selected}&/add"
        class="form"
        use:enhance={() => async ({ update, result }) => {
          await update({ reset: false });
          if (result.type === 'success') adding = false;
        }}
      >
        <label class="wide">{t('Title')}<input name="title" required maxlength="200" /></label>
        <fieldset class="wide cals">
          <legend>{t('Calendar')}</legend>
          {#each data.own as c, i (c.id)}
            <label class="cal" style="--hue: var(--hue-{c.hue})"><input type="radio" name="calendar" value={c.id} checked={i === 0} /><span>{c.name}</span></label>
          {/each}
        </fieldset>
        <label>{t('Date')}<input name="date" type="date" value={selected} required /></label>
        <label>{t('Until (optional)')}<input name="end_date" type="date" min={selected} /></label>
        <label class="check wide"><input type="checkbox" role="switch" name="all_day" bind:checked={allDay} /> {t('All day')}</label>
        {#if !allDay}
          <label>{t('From')}<input name="start_time" type="time" required /></label>
          <label>{t('To')}<input name="end_time" type="time" /></label>
        {/if}
        <label class="wide">{t('Place')}<input name="location" maxlength="200" /></label>
        <label class="wide">{t('Note')}<textarea name="note" maxlength="1000" rows="2"></textarea></label>
        {#if form?.error}<p class="error wide" role="alert">{form.error}</p>{/if}
        <button class="btn-primary btn-lg btn-block wide">{t('Save')}</button>
      </form>
    {/if}
  </Sheet>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
    gap: var(--space-5);
    align-items: start;
  }
  .month {
    padding: var(--space-3);
  }
  .month-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2) var(--space-3);
  }
  .month-head h2 {
    flex: 1;
    font-size: var(--text-xl);
    font-weight: var(--weight-heavy);
    text-transform: capitalize;
  }
  .grid {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  th {
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    color: var(--ink-3);
    padding: 0 0 var(--space-2);
    text-transform: capitalize;
  }
  td {
    padding: 2px;
    vertical-align: top;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    width: 100%;
    min-height: 5.5rem;
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  @media (hover: hover) {
    .cell:hover {
      background: var(--fill-2);
    }
  }
  .out .cell {
    color: var(--ink-4);
  }
  .num {
    align-self: flex-start;
    display: grid;
    place-items: center;
    min-width: 28px;
    height: 28px;
    border-radius: 50%;
    font-family: var(--font-rounded);
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
  }
  .today .num {
    color: var(--accent-ink);
  }
  .sel .num {
    background: var(--accent-fill);
    color: #fff;
  }
  .items {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .item {
    font-size: var(--text-xs);
    line-height: 1.35;
    padding: 0 0.35rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--hue) 18%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .day {
    min-width: 0;
  }
  .day .section-head {
    margin-top: 0;
  }
  .day .section-head h2 {
    font-size: var(--text-lg);
    text-transform: capitalize;
  }
  .swatch {
    background: var(--hue);
    width: 12px;
    height: 12px;
    border-radius: 50%;
    align-self: flex-start;
    margin-top: 6px;
  }
  .entry {
    align-items: flex-start;
  }
  .entry .list-title {
    font-weight: var(--weight-medium);
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  a.list-title {
    color: var(--accent-ink);
  }
  .note {
    white-space: pre-line;
  }
  .add {
    margin-top: var(--space-3);
  }
  .form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
  }
  .form label {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .form input:not([type='checkbox'], [type='radio']),
  .form textarea {
    width: 100%;
  }
  .form .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-base);
    color: var(--ink);
  }
  .cals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    border: 0;
    margin: 0;
    padding: 0;
  }
  .cals legend {
    font-size: var(--text-sm);
    color: var(--ink-2);
    margin-bottom: var(--space-1);
  }
  .form .cal {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--fill-2);
    color: var(--ink);
    font-size: var(--text-md);
    cursor: pointer;
  }
  .cal input {
    accent-color: var(--hue);
  }
  .cal:has(input:checked) {
    background: color-mix(in srgb, var(--hue) 20%, transparent);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .error {
    color: var(--critical-ink);
    margin: 0;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .cell {
      min-height: 3rem;
      align-items: center;
    }
    .num {
      align-self: center;
    }
    .items {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 2px;
    }
    .item {
      width: 6px;
      height: 6px;
      padding: 0;
      border-radius: 50%;
      background: var(--hue);
      color: transparent;
    }
    .more {
      display: none;
    }
  }
</style>
