<script lang="ts">
  import { replaceState } from '$app/navigation';
  import type { DataOf, SharedEntry } from '$shell';
  import { enhance, Mascot, useT, type Mood } from '$shell/ui';
  import { hueOf } from '../lib/look';
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
  let hidden = $state<string[]>([]);
  let adding = $state(false);
  let allDay = $state(false);

  // Apps with something in this month (or a problem); one with nothing here is left out.
  const chips = $derived(data.sources.filter((s) => s.count > 0 || s.error));
  const shown = $derived(data.entries.filter((e) => !hidden.includes(e.source.extension)));
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

  function pick(day: string) {
    selected = day;
    const month = day.slice(0, 7);
    if (month === data.month) replaceState(`?m=${month}&d=${day}`, {});
  }
  const toggle = (id: string) => (hidden = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
</script>

<svelte:head><title>{t('Calendar')} · {t('Assistant')}</title></svelte:head>

<header class="head">
  <Mascot {mood} size={44} decorative accessory="pencil" />
  <div>
    <h1>{t('Calendar')}</h1>
    <p class="muted">{line}</p>
  </div>
</header>

<div class="bar">
  <nav class="months" aria-label={t('Month')}>
    <a class="btn btn-ghost" href="?m={shiftMonth(data.month, -1)}" aria-label={t('Previous month')} data-sveltekit-noscroll>‹</a>
    <h2 class="month">{monthName}</h2>
    <a class="btn btn-ghost" href="?m={shiftMonth(data.month, 1)}" aria-label={t('Next month')} data-sveltekit-noscroll>›</a>
    {#if !data.today.startsWith(data.month)}<a class="btn btn-ghost" href="?d={data.today}" data-sveltekit-noscroll>{t('Today')}</a>{/if}
  </nav>
  {#if chips.length > 1}
    <ul class="sources" aria-label={t('Apps on the calendar')}>
      {#each chips as s (s.extension)}
        <li>
          <button
            type="button"
            class="chip"
            aria-pressed={!hidden.includes(s.extension)}
            style="--hue: var(--hue-{hueOf(s.extension)})"
            onclick={() => toggle(s.extension)}
            title={s.error ? t('{name} did not answer', { name: s.name }) : undefined}
          >
            <span class="dot" aria-hidden="true"></span>{s.name}{#if s.error}<span class="warn" aria-hidden="true">!</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<div class="layout">
  <table class="grid card" aria-label={monthName}>
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
                    <span class="item" style="--hue: var(--hue-{hueOf(e.source.extension)})">{e.title}</span>
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

  <section class="day card" aria-labelledby="day-title">
    <div class="day-head">
      <h2 id="day-title">{longDay(selected)}</h2>
      <button type="button" class="btn" onclick={() => (adding = !adding)} aria-expanded={adding}>{adding ? t('Cancel') : t('Add')}</button>
    </div>

    {#if adding}
      <form
        method="POST"
        action="?m={data.month}&d={selected}&/add"
        class="add"
        use:enhance={() => async ({ update, result }) => {
          await update({ reset: false });
          if (result.type === 'success') adding = false;
        }}
      >
        <label class="wide">{t('Title')}<input name="title" required maxlength="200" /></label>
        <label>{t('Date')}<input name="date" type="date" value={selected} required /></label>
        <label>{t('Until (optional)')}<input name="end_date" type="date" min={selected} /></label>
        <label class="check wide"><input type="checkbox" name="all_day" bind:checked={allDay} /> {t('All day')}</label>
        {#if !allDay}
          <label>{t('From')}<input name="start_time" type="time" required /></label>
          <label>{t('To')}<input name="end_time" type="time" /></label>
        {/if}
        <label class="wide">{t('Place')}<input name="location" maxlength="200" /></label>
        <label class="wide">{t('Note')}<textarea name="note" maxlength="1000" rows="2"></textarea></label>
        {#if form?.error}<p class="error wide" role="alert">{form.error}</p>{/if}
        <button class="btn btn-primary wide">{t('Save')}</button>
      </form>
    {/if}

    {#if dayList.length}
      <ul class="list">
        {#each dayList as e (e.source.extension + e.id)}
          <li style="--hue: var(--hue-{hueOf(e.source.extension)})">
            <span class="when num">{timeOf(e, selected)}</span>
            <div class="what">
              {#if e.href && !e.href.startsWith('/calendar')}<a href={e.href}>{e.title}</a>{:else}<span>{e.title}</span>{/if}
              <span class="meta">
                <span class="dot" aria-hidden="true"></span>{e.kind ?? e.source.name}{#if e.kind && e.kind !== e.source.name}<span class="muted"> · {e.source.name}</span>{/if}
                {#if e.location}<span class="muted"> · {e.location}</span>{/if}
              </span>
              {#if e.note}<p class="note muted">{e.note}</p>{/if}
            </div>
            {#if own(e)}
              <form method="POST" action="?m={data.month}&d={selected}&/remove" use:enhance>
                <input type="hidden" name="id" value={e.id} />
                <button class="btn-ghost remove" aria-label={t('Remove {title}', { title: e.title })}>×</button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {:else if !adding}
      <div class="empty">
        <Mascot mood="asleep" size={40} decorative accessory="pencil" />
        <p class="muted">
          {#if !data.entries.length && !data.subscriptions}
            {t('Nothing here yet. Add an entry, or subscribe to a calendar in')}
            <a href="/settings/extensions/calendar">{t('System settings')}</a>.
          {:else}
            {t('Nothing on this day.')}
          {/if}
        </p>
      </div>
    {/if}
  </section>
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .head p {
    margin: 0;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .months {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .month {
    margin: 0;
    min-width: 11ch;
    text-align: center;
    font-size: var(--text-lg);
    text-transform: capitalize;
  }
  .sources {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid var(--field-border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    padding: 0.2rem 0.7rem;
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .chip[aria-pressed='false'] {
    color: var(--ink-3);
    text-decoration: line-through;
  }
  .chip[aria-pressed='false'] .dot {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--hue);
  }
  .warn {
    color: var(--critical-ink);
    font-weight: var(--weight-bold);
  }
  .dot {
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--hue);
    flex: none;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
    gap: var(--space-4);
    align-items: start;
  }
  .grid {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    padding: var(--space-2);
  }
  th {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--ink-3);
    padding: var(--space-1) 0 var(--space-2);
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
    gap: 2px;
    width: 100%;
    min-height: 5.5rem;
    padding: var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  @media (hover: hover) {
    .cell:hover {
      background: var(--surface-2);
    }
  }
  .out .cell {
    color: var(--ink-3);
  }
  .today .num {
    background: var(--accent-fill);
    color: var(--page);
    border-radius: 999px;
    padding: 0 0.4rem;
  }
  .sel .cell {
    border-color: var(--accent);
  }
  .num {
    align-self: flex-start;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .items {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .item {
    font-size: var(--text-xs);
    line-height: 1.3;
    padding: 0 0.3rem;
    border-left: 3px solid var(--hue);
    background: color-mix(in srgb, var(--hue) 14%, transparent);
    border-radius: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .day {
    display: grid;
    gap: var(--space-3);
    position: sticky;
    top: var(--space-4);
  }
  .day-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .day-head h2 {
    margin: 0;
    font-size: var(--text-base);
    text-transform: capitalize;
  }
  .add {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .add label {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .add .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .error {
    color: var(--critical-ink);
    margin: 0;
  }
  .list {
    list-style: none;
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
  }
  .list li {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: start;
    padding-left: var(--space-2);
    border-left: 3px solid var(--hue);
  }
  .when {
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .what {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .what a,
  .what > span:first-child {
    font-weight: var(--weight-medium);
    overflow-wrap: anywhere;
  }
  .meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    font-size: var(--text-xs);
  }
  .note {
    margin: 0;
    font-size: var(--text-sm);
    white-space: pre-line;
  }
  .remove {
    border: 0;
    background: none;
    color: var(--ink-3);
    font-size: var(--text-lg);
    line-height: 1;
    padding: 0 var(--space-1);
    cursor: pointer;
  }
  .empty {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .empty p {
    margin: 0;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .day {
      position: static;
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
      width: 0.4rem;
      height: 0.4rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--hue);
      color: transparent;
    }
    .more {
      display: none;
    }
    .list li {
      grid-template-columns: 5rem minmax(0, 1fr) auto;
    }
  }
</style>
