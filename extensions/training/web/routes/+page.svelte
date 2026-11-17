<script lang="ts">
  import { goto } from '$app/navigation';
  import type { DataOf } from '$shell';
  import { enhance, Icon, PageHead, Pager, Sheet, useT, type Mood } from '$shell/ui';
  import { MUSCLE_IDS, recovery, type Logged } from '../lib/gym';
  import { MUSCLES, type LibraryEntry } from '../lib/library';
  import { addDays, itemsLine, type Session } from '../lib/model';
  import BodyMap from '../lib/ui/BodyMap.svelte';
  import { weekRange } from '../lib/view';
  import Stack from '../lib/ui/Stack.svelte';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string } | null } = $props();
  const t = useT();
  const history = $derived(data.history as Logged[]);
  const lib = $derived(data.library as LibraryEntry[]);
  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(data.monday, i)));
  const thisWeek = $derived(data.today >= data.monday && data.today <= addDays(data.monday, 6));
  const done = $derived(data.sessions.filter((s) => s.status === 'done'));
  const doneDays = $derived(new Set(done.map((s) => s.day)));
  const planDays = $derived(new Set(data.sessions.filter((s) => s.status === 'planned').map((s) => s.day)));
  const count = $derived(done.length);
  const planned = $derived(data.sessions.filter((s) => s.status === 'planned' && s.day >= data.today).length);
  const past = $derived(addDays(data.monday, 6) < data.today);
  /** Another week in place (the swipe, the arrows): no new history entry, the page stays where it is. */
  const toWeek = (day: string | null) => goto(day ? `?w=${day}` : '/training', { reset: false, replace: true });
  const pct = $derived(Math.min(1, count / data.goal));
  const C = 2 * Math.PI * 30;
  const last = $derived(history[0]);
  const mood: Mood = $derived(data.going ? 'charged' : count >= data.goal ? 'charged' : count ? 'steady' : 'idle');
  const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekAgo = $derived.by(() => {
    let best: Logged | null = null;
    let bd = 99;
    const tt = Date.parse(`${data.today}T12:00:00Z`);
    for (const w of history) {
      const d = Math.round((tt - Date.parse(`${w.day}T12:00:00Z`)) / 864e5);
      if (d >= 5 && d <= 9 && Math.abs(d - 7) < bd && w.items.some((i) => i.kind === 'exercise')) {
        bd = Math.abs(d - 7);
        best = w;
      }
    }
    return best;
  });
  const rec = $derived(recovery(history, data.today, lib));
  const recScores = $derived(Object.fromEntries(MUSCLE_IDS.filter((m) => rec[m] != null && rec[m]! <= 14).map((m) => [m, 1])));
  const recColors = $derived(Object.fromEntries(MUSCLE_IDS.map((m) => [m, (rec[m] ?? 99) < 2 ? 'var(--critical)' : (rec[m] ?? 99) < 3 ? 'var(--warning)' : 'var(--good)'])));
  const tired = $derived(MUSCLE_IDS.filter((m) => rec[m] != null && rec[m]! < 2).map((m) => t(MUSCLES[m])));
  const stale = $derived(MUSCLE_IDS.filter((m) => rec[m] == null || rec[m]! > 7).map((m) => t(MUSCLES[m])));
  let confirmDel = $state<string | null>(null);
  let naming = $state(false);
  const statusOf = (s: Session) => (s.status === 'done' ? t('done') : s.status === 'skipped' ? t('skipped') : s.result?.started_at ? t('in progress') : t('planned'));
</script>

<svelte:head><title>{t('Training')} · {t('Assistant')}</title></svelte:head>

<PageHead title={t('Training')} sub={last ? t('Last workout: {day}', { day: longDay(last.day) }) : t('Log your first workout')} {mood} />

{#if form?.error}<p class="card small danger" role="alert">{form.error}</p>{/if}

<div class="cols">
  <div>
    {#if data.going}
      <div class="card wa">
        <Stack items={data.going.items} />
        <div class="tx"><div class="h2" style:margin="0">{t('Workout in progress')}</div><div class="muted small">{data.going.title}</div></div>
        <a class="btn-primary btn-sm" href="/training/session/{data.going.id}">{t('Back to it')}</a>
      </div>
    {/if}
    <section class="card hero" aria-label={t('Weekly goal')}>
      <Pager
        key={data.monday}
        label={t('Weeks')}
        prevLabel={t('Previous week')}
        nextLabel={t('Next week')}
        onprev={() => toWeek(addDays(data.monday, -7))}
        onnext={() => toWeek(addDays(data.monday, 7))}>
        {#snippet head()}<div class="eyebrow">{weekRange(data.monday, data.today, t.locale)}</div>{/snippet}
        {#snippet actions()}{#if !thisWeek}<button type="button" class="btn-tinted btn-sm" onclick={() => toWeek(null)}>{t('Today')}</button>{/if}{/snippet}
        <div class="hero-top">
          <div>
            <div class="figure">{count}<small> / {data.goal}</small></div>
            <div class="hero-sub">{count >= data.goal ? t('Goal done') : past ? t('done that week') : planned && !thisWeek ? t('{n} planned', { n: planned }) : t('workouts to the goal')}</div>
          </div>
          <svg class="ring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" class="rb" /><circle cx="36" cy="36" r="30" class="rf" style="--c:{C.toFixed(1)};--o:{(C * (1 - pct)).toFixed(1)}" /></svg>
        </div>
        <div class="hweek">
          {#each days as d, i (d)}
            <div class="hd" class:has={doneDays.has(d)} class:planned={planDays.has(d)} class:today={d === data.today} class:future={d > data.today}>
              <span>{t(WD[i])}</span><b>{Number(d.slice(8))}</b>
            </div>
          {/each}
        </div>
      </Pager>
      <div class="hero-goal">
        <span>{t('Weekly goal')}</span>
        <form method="POST" action="?/goal" use:enhance class="stepper">
          <button name="d" value="-1" aria-label={t('Fewer workouts')} disabled={data.goal <= 1}>−</button><output>{data.goal}</output><button name="d" value="1" aria-label={t('More workouts')}>+</button>
        </form>
      </div>
    </section>

    <div class="qa">
      <form method="POST" action="?/start"><input type="hidden" name="from" value="empty" />
        <button class="qa-b"><span class="btn-primary btn-icon" aria-hidden="true"><Icon name="play" size={24} /></span>{t('Start')}</button>
      </form>
      <form method="POST" action="?/start"><input type="hidden" name="from" value="repeat" />
        <button class="qa-b" disabled={!last}><span class="btn btn-icon" aria-hidden="true"><Icon name="repeat" size={24} /></span>{t('Repeat')}</button>
      </form>
      <form method="POST" action="?/start"><input type="hidden" name="from" value="entry" /><input type="hidden" name="id" value="run" />
        <button class="qa-b"><span class="btn btn-icon" aria-hidden="true"><Icon name="run" size={24} /></span>{t('Run')}</button>
      </form>
      <a class="qa-b" href="/training/library"><span class="btn btn-icon" aria-hidden="true"><Icon name="book" size={24} /></span>{t('Exercises')}</a>
    </div>

    {#if weekAgo}
      {@const ex = weekAgo.items.filter((i) => i.kind === 'exercise')}
      <div class="card wa">
        <div class="tx">
          <div class="h2" style:margin="0">{t('A week ago')}</div>
          <div class="muted small">{cap(longDay(weekAgo.day))}, {ex.slice(0, 3).map((e) => t(e.kind === 'exercise' ? e.name : '')).join(', ')}{ex.length > 3 ? t(' and {n} more', { n: ex.length - 3 }) : ''}</div>
        </div>
        <form method="POST" action="?/start"><input type="hidden" name="from" value="copy" /><input type="hidden" name="id" value={weekAgo.id} /><button class="btn-tinted btn-sm">{t('Copy')}</button></form>
      </div>
    {/if}
  </div>

  <div>
    <div class="card">
      <div class="h2row">
        <span class="h2">{thisWeek ? t('This week') : t('That week')}</span>
        <span class="weeknav">
          {#if !thisWeek}<a class="btn-plain btn-sm" href="?w={data.today}" data-sveltekit-noscroll>{t('Today')}</a>{/if}
          <a class="btn btn-icon btn-sm" href="?w={addDays(data.monday, -7)}" data-sveltekit-noscroll aria-label={t('Previous week')}><Icon name="back" size={18} /></a>
          <a class="btn btn-icon btn-sm" href="?w={addDays(data.monday, 7)}" data-sveltekit-noscroll aria-label={t('Next week')}><Icon name="forward" size={18} /></a>
        </span>
      </div>
      {#if data.active}<div class="small muted">{t('Plan')}: <a class="link" href="/training/plans/{data.active.id}">{data.active.name}</a></div>{/if}
      {#each data.sessions as s (s.id)}
        <div class="plan">
          <a class="pi" href="/training/session/{s.id}">
            <Stack items={s.items} />
            <span class="ptx"><span class="pn">{s.title}</span><span class="pm">{cap(shortDay(s.day))}{s.time_local ? ` ${s.time_local}` : ''} · {statusOf(s)}{s.items.length ? ` · ${itemsLine(s.items, t, 3)}` : ''}</span></span>
          </a>
          {#if s.status === 'done'}<a class="btn btn-icon btn-sm done" href="/training/session/{s.id}" aria-label={t('Done')}><Icon name="check" size={18} /></a>{:else}<a class="btn-tinted btn-sm" href="/training/session/{s.id}">{s.day === data.today ? t('Start') : t('Open')}</a>{/if}
        </div>
      {:else}
        <div class="muted small" style:padding-top="6px">{data.active ? t('Nothing planned this week.') : t('No plan yet. Ask Claude for one, e.g. "Plan me 8 weeks to a 10 km under 50 minutes." Or start a workout above.')}</div>
      {/each}
    </div>

    <div class="card">
      <div class="h2row"><span class="h2">{t('Templates')}</span>{#if last}<button type="button" class="btn-plain btn-sm" onclick={() => (naming = true)}>+ {t('From the last one')}</button>{/if}</div>
      {#each data.templates as p (p.id)}
        <div class="plan">
          <form method="POST" action="?/start" class="pi" style:display="contents"><input type="hidden" name="from" value="template" /><input type="hidden" name="id" value={p.id} />
            <button class="pi"><Stack items={p.items} /><span class="ptx"><span class="pn">{p.name}</span><span class="pm">{t('{n} items', { n: p.items.length })}</span></span></button>
          </form>
          {#if confirmDel === p.id}
            <form method="POST" action="?/untemplate" use:enhance={() => async ({ update }) => { confirmDel = null; await update(); }}><input type="hidden" name="id" value={p.id} /><button class="plan-del confirm">{t('Delete?')}</button></form>
          {:else}
            <button type="button" class="plan-del" aria-label={t('Delete the template')} onclick={() => (confirmDel = p.id)}>⋯</button>
          {/if}
          <form method="POST" action="?/start"><input type="hidden" name="from" value="template" /><input type="hidden" name="id" value={p.id} /><button class="btn-tinted btn-sm">{t('Start')}</button></form>
        </div>
      {:else}
        <div class="muted small">{t('After a workout, save it as a template, e.g. “Upper A”. Then you start it with one tap.')}</div>
      {/each}
    </div>

    {#if history.length}
      <div class="card">
        <div class="h2row"><span class="h2">{t('Recovery')}</span><span class="muted small">{t('days since training')}</span></div>
        <div class="map-wrap">
          <BodyMap scores={recScores} colors={recColors} />
          <div class="small">
            {#if tired.length}<div style:margin-bottom="8px"><b>{t('Recovering:')}</b> {tired.join(', ')}</div>{/if}
            {#if stale.length}<div><b>{t('Not trained for a while:')}</b> {stale.slice(0, 6).join(', ')}{stale.length > 6 ? t(' and more') : ''}</div>{:else}<div>{t('Every muscle trained in the last week.')}</div>{/if}
          </div>
        </div>
        <div class="rec-leg"><span><i style:background="var(--critical)"></i>{t('up to 2 days')}</span><span><i style:background="var(--warning)"></i>{t('2-3 days')}</span><span><i style:background="var(--good)"></i>{t('ready')}</span><span><i style:background="var(--body)"></i>{t('over 2 weeks')}</span></div>
      </div>
    {:else}
      <p class="empty">{t('The app will suggest weights from the last session, show the muscles that worked and draw your progress.')}</p>
    {/if}
  </div>
</div>

{#if naming && last}
  <Sheet title={t('Save as a template')} onclose={() => (naming = false)}>
    <p class="muted small" style:margin-top="0">{last.items.map((i) => (i.kind === 'exercise' ? t(i.name) : t(i.name ?? i.sport))).join(', ')}</p>
    <form method="POST" action="?/template" class="form" use:enhance={() => async ({ update, result }) => { await update(); if (result.type === 'success') naming = false; }}>
      <input type="hidden" name="id" value={last.id} />
      <label>{t('Template name')}<input name="name" maxlength="40" required placeholder={t('e.g. Full body A')} /></label>
      <button class="btn-primary btn-lg btn-block">{t('Save the template')}</button>
    </form>
  </Sheet>
{/if}
