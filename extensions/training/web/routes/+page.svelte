<script lang="ts">
  import type { DataOf } from '$shell';
  import { enhance, Mascot, useT, type Mood } from '$shell/ui';
  import { MUSCLE_IDS, recovery, type Logged } from '../lib/gym';
  import { MUSCLES, type LibraryEntry } from '../lib/library';
  import { addDays, itemsLine, type Session } from '../lib/model';
  import Sheet from '../lib/ui/Sheet.svelte';
  import BodyMap from '../lib/ui/BodyMap.svelte';
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
  const recColors = $derived(Object.fromEntries(MUSCLE_IDS.map((m) => [m, (rec[m] ?? 99) < 2 ? 'var(--g-red)' : (rec[m] ?? 99) < 3 ? 'var(--g-yellow)' : 'var(--g-green)'])));
  const tired = $derived(MUSCLE_IDS.filter((m) => rec[m] != null && rec[m]! < 2).map((m) => t(MUSCLES[m])));
  const stale = $derived(MUSCLE_IDS.filter((m) => rec[m] == null || rec[m]! > 7).map((m) => t(MUSCLES[m])));
  let confirmDel = $state<string | null>(null);
  let naming = $state(false);
  const statusOf = (s: Session) => (s.status === 'done' ? t('done') : s.status === 'skipped' ? t('skipped') : s.result?.started_at ? t('in progress') : t('planned'));
</script>

<svelte:head><title>{t('Training')} · {t('Assistant')}</title></svelte:head>

<header class="top">
  <Mascot {mood} size={56} label={t('Pingo in a sweatband')} />
  <div>
    <h1>{t('Training')}</h1>
    <div class="sub">{last ? t('Last workout: {day}', { day: longDay(last.day) }) : t('Log your first workout')}</div>
  </div>
</header>

{#if form?.error}<p class="panel small danger" role="alert">{form.error}</p>{/if}

<div class="cols">
  <div>
    {#if data.going}
      <div class="panel wa">
        <Stack items={data.going.items} />
        <div class="tx"><div class="h2 h2s" style:margin="0">{t('Workout in progress')}</div><div class="muted small">{data.going.title}</div></div>
        <a class="gbtn ink sm" href="/training/session/{data.going.id}">{t('Back to it')}</a>
      </div>
    {/if}
    <section class="hero" aria-label={t('This week')}>
      <div class="hero-top">
        <div>
          <div class="hero-lab">{thisWeek ? t('This week') : `${shortDay(data.monday)} – ${shortDay(addDays(data.monday, 6))}`}</div>
          <div class="hero-num">{count}<small> / {data.goal}</small></div>
          <div class="hero-sub">{count >= data.goal ? t('Goal done') : t('workouts to the goal')}</div>
        </div>
        <svg class="ring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" class="rb" /><circle cx="36" cy="36" r="30" class="rf" style="--c:{C.toFixed(1)};--o:{(C * (1 - pct)).toFixed(1)}" /></svg>
      </div>
      <div class="hweek">
        {#each days as d, i (d)}
          <div class="hd" class:has={doneDays.has(d)} class:plan={planDays.has(d)} class:today={d === data.today} class:future={d > data.today}>
            <span>{t(WD[i])}</span><b>{Number(d.slice(8))}</b>
          </div>
        {/each}
      </div>
      <div class="hero-goal">
        <span>{t('Weekly goal')}</span>
        <form method="POST" action="?/goal" use:enhance class="stepper">
          <button name="d" value="-1" aria-label={t('Fewer workouts')}>−</button><span>{data.goal}</span><button name="d" value="1" aria-label={t('More workouts')}>+</button>
        </form>
      </div>
    </section>

    <div class="qa">
      <form method="POST" action="?/start"><input type="hidden" name="from" value="empty" />
        <button class="qa-b pri"><span class="qa-i"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg></span><span class="qa-l">{t('Start')}</span></button>
      </form>
      <form method="POST" action="?/start"><input type="hidden" name="from" value="repeat" />
        <button class="qa-b" disabled={!last}><span class="qa-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" /></svg></span><span class="qa-l">{t('Repeat')}</span></button>
      </form>
      <form method="POST" action="?/start"><input type="hidden" name="from" value="entry" /><input type="hidden" name="id" value="run" />
        <button class="qa-b"><span class="qa-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4.5" r="1.8" /><path d="M7 21l3-6 3 2v4M10 15l1.5-5L8 11l-2 3M11.5 10l3 2.5 3.5.5" /></svg></span><span class="qa-l">{t('Run')}</span></button>
      </form>
      <a class="qa-b" href="/training/library"><span class="qa-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></svg></span><span class="qa-l">{t('Exercises')}</span></a>
    </div>

    {#if weekAgo}
      {@const ex = weekAgo.items.filter((i) => i.kind === 'exercise')}
      <div class="panel wa">
        <div class="tx">
          <div class="h2 h2s" style:margin="0">{t('A week ago')}</div>
          <div class="muted small">{cap(longDay(weekAgo.day))}, {ex.slice(0, 3).map((e) => t(e.kind === 'exercise' ? e.name : '')).join(', ')}{ex.length > 3 ? t(' and {n} more', { n: ex.length - 3 }) : ''}</div>
        </div>
        <form method="POST" action="?/start"><input type="hidden" name="from" value="copy" /><input type="hidden" name="id" value={weekAgo.id} /><button class="gbtn ink sm">{t('Copy')}</button></form>
      </div>
    {/if}
  </div>

  <div>
    <div class="panel">
      <div class="h2row">
        <span class="h2">{thisWeek ? t('This week') : t('That week')}</span>
        <span class="small">
          <a class="link" href="?w={addDays(data.monday, -7)}" data-sveltekit-noscroll aria-label={t('Previous week')}>‹</a>
          {#if !thisWeek}<a class="link" href="?w={data.today}" data-sveltekit-noscroll>{t('Today')}</a>{/if}
          <a class="link" href="?w={addDays(data.monday, 7)}" data-sveltekit-noscroll aria-label={t('Next week')}>›</a>
        </span>
      </div>
      {#if data.active}<div class="small muted">{t('Plan')}: <a class="link" href="/training/plans/{data.active.id}">{data.active.name}</a></div>{/if}
      {#each data.sessions as s (s.id)}
        <div class="plan">
          <a class="pi" href="/training/session/{s.id}">
            <Stack items={s.items} />
            <span class="ptx"><span class="pn">{s.title}</span><span class="pm">{cap(shortDay(s.day))}{s.time_local ? ` ${s.time_local}` : ''} · {statusOf(s)}{s.items.length ? ` · ${itemsLine(s.items, t, 3)}` : ''}</span></span>
          </a>
          {#if s.status === 'done'}<a class="go done" href="/training/session/{s.id}" aria-label={t('Done')}>✓</a>{:else}<a class="go" href="/training/session/{s.id}">{s.day === data.today ? t('Start') : t('Open')}</a>{/if}
        </div>
      {:else}
        <div class="muted small" style:padding-top="6px">{data.active ? t('Nothing planned this week.') : t('No plan yet. Ask Claude for one, e.g. "Plan me 8 weeks to a 10 km under 50 minutes." Or start a workout above.')}</div>
      {/each}
    </div>

    <div class="panel">
      <div class="h2row"><span class="h2">{t('Templates')}</span>{#if last}<button type="button" class="link" onclick={() => (naming = true)}>+ {t('From the last one')}</button>{/if}</div>
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
          <form method="POST" action="?/start"><input type="hidden" name="from" value="template" /><input type="hidden" name="id" value={p.id} /><button class="go">{t('Start')}</button></form>
        </div>
      {:else}
        <div class="muted small">{t('After a workout, save it as a template, e.g. “Upper A”. Then you start it with one tap.')}</div>
      {/each}
    </div>

    {#if history.length}
      <div class="panel">
        <div class="h2row"><span class="h2">{t('Recovery')}</span><span class="muted small">{t('days since training')}</span></div>
        <div class="map-wrap">
          <BodyMap scores={recScores} colors={recColors} />
          <div class="small">
            {#if tired.length}<div style:margin-bottom="8px"><b>{t('Recovering:')}</b> {tired.join(', ')}</div>{/if}
            {#if stale.length}<div><b>{t('Not trained for a while:')}</b> {stale.slice(0, 6).join(', ')}{stale.length > 6 ? t(' and more') : ''}</div>{:else}<div>{t('Every muscle trained in the last week.')}</div>{/if}
          </div>
        </div>
        <div class="rec-leg"><span><i style:background="var(--g-red)"></i>{t('up to 2 days')}</span><span><i style:background="var(--g-yellow)"></i>{t('2-3 days')}</span><span><i style:background="var(--g-green)"></i>{t('ready')}</span><span><i style:background="var(--g-body)"></i>{t('over 2 weeks')}</span></div>
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
      <label>{t('Template name')}<input class="fld" name="name" maxlength="40" required placeholder={t('e.g. Full body A')} /></label>
      <button class="gbtn ink block">{t('Save the template')}</button>
    </form>
  </Sheet>
{/if}
