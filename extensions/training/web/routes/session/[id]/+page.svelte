<script lang="ts">
  import { deserialize } from '$app/forms';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import type { DataOf } from '$shell';
  import { Mascot, PageHead, Sheet, useT, mascotName } from '$shell/ui';
  import { onMount, tick as settle } from 'svelte';
  import {
    amount,
    bestBefore,
    BAR,
    clock,
    confetti,
    counted,
    e1rm,
    factFor,
    fmtN,
    fmtShort,
    isRecord,
    keyOf,
    lastPerf,
    muscleLoad,
    PAIR,
    quickOptions,
    restFor,
    setsText,
    type Logged,
    type Perf
  } from '../../../lib/gym';
  import { itemFrom, libraryById, MUSCLES, type LibraryEntry } from '../../../lib/library';
  import { autoTitle, SPORT_LABELS, stepsLine, type CardioItem, type ExerciseItem, type Item, type SetSpec } from '../../../lib/model';
  import Blocks from '../../../lib/ui/Blocks.svelte';
  import ExerciseInfo from '../../../lib/ui/ExerciseInfo.svelte';
  import LoadBlock from '../../../lib/ui/LoadBlock.svelte';
  import Picker from '../../../lib/ui/Picker.svelte';
  import Plates from '../../../lib/ui/Plates.svelte';
  import RestTimer from '../../../lib/ui/RestTimer.svelte';
  import Thumb from '../../../lib/ui/Thumb.svelte';
  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();
  const lib = $derived(data.library as LibraryEntry[]);
  const history = $derived(data.history as Logged[]);

  // The page works on its own copy and saves it a moment after every change.
  // svelte-ignore state_referenced_locally
  const s0 = data.session;
  let sid = $state(s0.id);
  let items = $state<Item[]>(structuredClone($state.snapshot(s0.items)) as Item[]);
  let status = $state(s0.status);
  let day = $state(s0.day);
  // A title made from the items is made again as they change; one typed or planned stays.
  const autoNamed = !s0.title || s0.title === autoTitle(s0.items) || s0.title === 'Workout';
  let title = $state(autoNamed ? '' : s0.title);
  let time = $state(s0.time_local ?? '');
  let planId = $state(s0.plan_id ?? '');
  let description = $state(s0.description ?? '');
  let startedAt = $state(s0.result?.started_at ?? '');
  let finishedAt = $state(s0.result?.finished_at ?? '');
  let rpe = $state(s0.result?.rpe != null ? String(s0.result.rpe) : '');
  let note = $state(s0.result?.note ?? '');

  let sync = $state<'saved' | 'saving' | 'error' | ''>('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<unknown> | null = null;
  let again = false;

  function fields(): FormData {
    const f = new FormData();
    f.set('items', JSON.stringify(items));
    f.set('day', day);
    f.set('title', title.trim());
    f.set('time', time);
    f.set('plan', planId);
    f.set('description', description);
    f.set('started_at', startedAt);
    f.set('rpe', rpe);
    f.set('note', note);
    if (data.template) f.set('template', data.template);
    return f;
  }
  async function post(action: string, f = fields()) {
    const res = await fetch(`/training/session/${sid}?/${action}`, { method: 'POST', body: f, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
    const r = deserialize(await res.text());
    if (r.type === 'success' && r.data && typeof r.data.id === 'string' && r.data.id !== sid) {
      const was = sid;
      sid = r.data.id;
      if (was === 'new') replaceState(`/training/session/${sid}`, {});
    }
    return r;
  }
  async function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (inflight) {
      again = true;
      return inflight;
    }
    sync = 'saving';
    inflight = post('autosave')
      .then((r) => (sync = r.type === 'success' ? 'saved' : 'error'))
      .catch(() => (sync = 'error'))
      .finally(() => {
        inflight = null;
        if (again) {
          again = false;
          flush();
        }
      });
    return inflight;
  }
  function queue() {
    sync = 'saving';
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  }
  onMount(() => {
    const save = () => timer && flush();
    addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    if (page.url.searchParams.get('pick') === '1') sheet = { mode: 'pick' };
    return () => {
      removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
      if (timer) flush();
    };
  });

  // The clock of a workout under way.
  let now = $state(Date.now());
  $effect(() => {
    const iv = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(iv);
  });
  const live = $derived(!!startedAt && status === 'planned' && day === data.today);
  const total = $derived(items.reduce((a, i) => a + (i.kind === 'cardio' ? 1 : i.sets.length), 0));
  const ticked = $derived(items.reduce((a, i) => a + (i.kind === 'cardio' ? (i.done ? 1 : 0) : i.sets.filter((x) => x.done).length), 0));

  type SheetState =
    | { mode: 'pick' }
    | { mode: 'info'; key: string; ref?: string; name: string }
    | { mode: 'plates'; ex: number | null; kg: number }
    | { mode: 'summary' }
    | { mode: 'details' };
  let sheet = $state<SheetState | null>(null);
  let query = $state('');
  let confirm = $state<string | null>(null);
  let mapMode = $state<'done' | 'plan'>('done');
  let fresh = $state<number | null>(null);
  let pop = $state('');
  let qo = $state<Record<number, string>>({});
  let noteOpen = $state<Record<number, boolean>>({});
  let toast = $state<{ text: string; gold?: boolean } | null>(null);
  let toastT: ReturnType<typeof setTimeout> | undefined;
  let fx = $state<HTMLCanvasElement>();
  let rest = $state<ReturnType<typeof RestTimer>>();
  function say(text: string, gold = false) {
    toast = { text, gold };
    clearTimeout(toastT);
    toastT = setTimeout(() => (toast = null), 2600);
  }
  const buzz = (p: number | number[]) => {
    try {
      navigator.vibrate?.(p);
    } catch {
      /* none */
    }
  };

  const entryOf = (i: Item) => (i.ref ? libraryById(i.ref, lib) : undefined);
  const perfs = $derived(items.map((i) => (i.kind === 'exercise' ? lastPerf(history, keyOf(i), sid) : null)));
  const bests = $derived(items.map((i) => (i.kind === 'exercise' ? bestBefore(history, keyOf(i), sid) : { e1rm: 0, amount: 0 })));
  const inWorkout = $derived(new Set(items.map((i) => i.ref ?? '')));
  const longDay = $derived(new Date(`${day}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const shownTitle = $derived(title.trim() || (items.length ? autoTitle(items, t) : t('New workout')));
  const plan = $derived(data.plans.find((p) => p.id === planId) ?? null);

  // -- adding --------------------------------------------------------------------------------------------
  async function addPicked(e: LibraryEntry | string) {
    let it: Item;
    if (typeof e === 'string') {
      const found = lib.find((x) => t(x.name).toLowerCase() === e.toLowerCase() || x.name.toLowerCase() === e.toLowerCase());
      if (found) return addPicked(found);
      it = { kind: 'exercise', name: e, unit: 'reps', sets: [] };
    } else it = itemFrom(e);
    if (it.kind === 'exercise') {
      const prev = lastPerf(history, keyOf(it), sid);
      const n = prev ? Math.max(1, prev.sets.length) : it.sets.length || 3;
      if (prev?.unit && prev.unit !== it.unit && !it.ref) it.unit = prev.unit;
      it.sets = prev ? Array.from({ length: n }, () => ({})) : it.unit === 'minutes' ? it.sets : Array.from({ length: n }, () => ({}));
    }
    items.push(it);
    fresh = items.length - 1;
    query = '';
    sheet = null;
    queue();
    await settle();
    const els = document.querySelectorAll('.gym .ex');
    els[els.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // -- sets ----------------------------------------------------------------------------------------------
  const ph = (prev: Perf | null, j: number): SetSpec | null => (prev ? (prev.sets[j] ?? prev.sets[prev.sets.length - 1]) : null);
  const parse = (v: string) => {
    const n = Number(v.trim().replace(',', '.'));
    return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
  };
  function setValue(e: ExerciseItem, j: number, f: 'kg' | 'reps' | 'seconds' | 'minutes', v: string) {
    const n = parse(v);
    const s = e.sets[j];
    if (f === 'minutes') s.seconds = n === undefined ? undefined : Math.round(n * 60);
    else if (f === 'reps') s.reps = n === undefined ? undefined : Math.round(n);
    else if (f === 'seconds') {
      s.seconds = n === undefined ? undefined : Math.round(n);
      if (n) rest?.suggest(Math.round(n));
    } else s.kg = n;
    queue();
  }
  function tickSet(i: number, j: number) {
    const e = items[i] as ExerciseItem;
    const s = e.sets[j];
    if (!s.done) {
      const p = ph(perfs[i], j);
      if (p && p.kg != null && s.kg == null && e.unit === 'reps') s.kg = p.kg;
      if (p && e.unit === 'reps' && s.reps == null && p.reps) s.reps = p.reps;
      if (p && e.unit !== 'reps' && s.seconds == null && p.seconds) s.seconds = p.seconds;
      if (!amount(s, e.unit)) {
        say(e.unit === 'reps' ? t('Type the number of reps.') : t('Type the time.'));
        (document.querySelector(`[data-set="${i}-${j}"] input[data-f="amount"]`) as HTMLInputElement | null)?.focus();
        return;
      }
    }
    s.done = !s.done || undefined;
    if (!startedAt && status === 'planned') startedAt = new Date().toISOString();
    let xi = i;
    if (s.done && e.sets.filter((x) => x.done).length === 1) {
      // The first ticked set: the exercise moves after the ones already under way.
      const others = items.filter((_, k) => k !== i);
      let p = 0;
      others.forEach((o, k) => {
        if (o.kind === 'exercise' ? o.sets.some((x) => x.done) : o.done) p = k + 1;
      });
      if (p !== i) {
        others.splice(p, 0, e);
        items = others;
        xi = p;
        qo = {};
        noteOpen = {};
      }
    }
    queue();
    if (s.done) {
      pop = `${xi}-${j}`;
      buzz(15);
      rest?.suggest(restFor(e.ref));
      const others = e.sets.filter((x, k) => k !== j && x.done);
      const rec =
        isRecord(e, j, bests[i]) &&
        others.every((x) => (e.unit !== 'reps' || !s.kg ? amount(x, e.unit) < amount(s, e.unit) : e1rm(x.kg ?? 0, x.reps ?? 0) < e1rm(s.kg ?? 0, s.reps ?? 0)));
      if (rec) {
        say(t('New record: {name}, {set}', { name: t(e.name), set: setsText([s], e.unit, t.locale) }), true);
        if (fx) confetti(fx);
      } else if (items.every((it) => (it.kind === 'cardio' ? it.done : it.sets.every((x) => x.done)))) say(t('Every set done. You can finish the workout.'));
      if (xi !== i) settle().then(() => document.querySelectorAll('.gym .ex')[xi]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }
  function addSet(e: ExerciseItem, i: number) {
    const l = e.sets[e.sets.length - 1];
    e.sets.push(l ? { kg: l.kg, reps: l.reps, seconds: l.seconds } : {});
    pop = `new-${i}-${e.sets.length - 1}`;
    queue();
  }
  function quick(e: ExerciseItem, i: number, id: string) {
    const prev = perfs[i];
    if (!prev) return;
    const o = quickOptions(e, prev).find((x) => x.id === id);
    if (!o) return;
    const dn = e.sets.filter((x) => x.done);
    e.sets = [...dn, ...o.sets.slice(dn.length).map((x) => ({ ...x }))];
    if (e.sets.length === dn.length) e.sets.push({ ...o.sets[o.sets.length - 1] });
    qo[i] = id;
    buzz(10);
    queue();
  }
  const qoLabel = (e: ExerciseItem, o: { id: string; by?: number }, prev: Perf): [string, string] => {
    if (o.id === 'same') return [t('The same'), t('as {day}', { day: fmtShort(prev.day, t.locale) })];
    if (o.id === 'kg') return [`+${fmtN(o.by ?? 0, t.locale)} kg`, t('same reps')];
    if (o.id === 'reps') return [t('+1 rep'), t('same weight')];
    return [e.unit === 'minutes' ? `+${(o.by ?? 0) / 5} min` : `+${o.by} s`, t('each set')];
  };
  function removeItem(i: number) {
    if (confirm !== `ex${i}`) {
      confirm = `ex${i}`;
      return;
    }
    items.splice(i, 1);
    confirm = null;
    qo = {};
    noteOpen = {};
    queue();
  }
  function switchUnit(e: ExerciseItem) {
    e.unit = e.unit === 'reps' ? 'seconds' : 'reps';
    e.sets = e.sets.map((x) => ({ done: x.done }));
    queue();
  }
  function tickCardio(c: CardioItem, i: number) {
    c.done = !c.done || undefined;
    if (!startedAt && status === 'planned') startedAt = new Date().toISOString();
    if (c.done) {
      pop = `c${i}`;
      buzz(15);
    }
    queue();
  }

  // -- finishing -----------------------------------------------------------------------------------------
  async function finish() {
    const kept = items
      .map((i) => (i.kind === 'cardio' ? i : { ...i, sets: i.sets.filter((x) => amount(x, i.unit) > 0) }))
      .filter((i) => i.kind === 'cardio' || i.sets.length);
    if (!kept.length) {
      say(t('Type the reps of at least one set.'));
      return;
    }
    items = kept;
    clearTimeout(timer);
    timer = undefined;
    if (inflight) await inflight;
    sync = 'saving';
    const r = await post('finish');
    if (r.type !== 'success') {
      sync = 'error';
      say(r.type === 'failure' && typeof r.data?.error === 'string' ? r.data.error : t('Not saved. Try again.'));
      return;
    }
    sync = 'saved';
    status = 'done';
    if (!finishedAt) finishedAt = new Date().toISOString();
    rest?.stop();
    sheet = { mode: 'summary' };
    if (records.length) setTimeout(() => fx && confetti(fx), 250);
  }
  async function setStatus(action: 'skip' | 'reopen') {
    if (timer) await flush();
    const r = await post(action);
    if (r.type === 'success') {
      status = action === 'skip' ? 'skipped' : 'planned';
      if (action === 'reopen') finishedAt = '';
      sheet = null;
    }
  }
  let tplName = $state('');
  let tplSaved = $state(false);
  async function saveTemplate() {
    if (!tplName.trim()) return;
    const f = fields();
    f.set('template_name', tplName.trim());
    const r = await post('template', f);
    if (r.type === 'success') {
      tplSaved = true;
      say(t('Saved the template “{name}”', { name: tplName.trim() }));
    }
  }
  async function discard() {
    if (confirm !== 'discard') {
      confirm = 'discard';
      return;
    }
    clearTimeout(timer);
    timer = undefined;
    rest?.stop();
    if (sid !== 'new') await fetch(`/training/session/${sid}?/remove`, { method: 'POST', body: new FormData(), headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
    goto(`/training?w=${day}`);
  }

  // The summary: time, volume, sets, records, muscles.
  const minutes = $derived(startedAt && finishedAt ? Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 60000) : 0);
  const volume = $derived(items.reduce((a, i) => (i.kind === 'exercise' && i.unit === 'reps' ? a + counted(i).reduce((b, x) => b + (x.kg ?? 0) * (x.reps ?? 0), 0) : a), 0));
  const setCount = $derived(items.reduce((a, i) => a + (i.kind === 'exercise' ? counted(i).length : 0), 0));
  const km = $derived(items.reduce((a, i) => a + (i.kind === 'cardio' ? (i.distance_m ?? 0) : 0), 0) / 1000);
  const records = $derived(
    items.flatMap((i, k) => {
      if (i.kind !== 'exercise') return [];
      const sets = counted(i).map((x) => ({ ...x, done: true }));
      const ex = { ...i, sets };
      const top = sets.map((_, j) => j).filter((j) => isRecord(ex, j, bests[k]));
      if (!top.length) return [];
      const score = (x: SetSpec) => (i.unit === 'reps' && x.kg ? e1rm(x.kg, x.reps ?? 0) : amount(x, i.unit));
      const best = top.reduce((a, j) => (score(sets[j]) > score(sets[a]) ? j : a), top[0]);
      return [{ name: t(i.name), text: setsText([sets[best]], i.unit, t.locale) }];
    })
  );
  const fact = $derived(factFor(volume));
  const platesFor = (e: ExerciseItem, prev: Perf | null) => {
    const sv = e.sets.find((x) => !x.done && x.kg) ?? e.sets.find((x) => x.kg);
    return sv?.kg ?? (prev ? Math.max(...prev.sets.map((x) => x.kg ?? 0)) : 60) ?? 60;
  };
</script>

<svelte:head><title>{shownTitle} · {t('Training')}</title></svelte:head>

{#if total || live}
  <div class="bar-live">
    <div class="clock">{live ? clock(now - Date.parse(startedAt)) : '—'}</div>
    <div class="prog">
      <div class="t"><span>{live ? t('workout time') : status === 'done' ? t('saved') : t('plan')}</span><span>{t('{done} of {all}', { done: ticked, all: total })}</span></div>
      <div class="pb"><i style:width="{total ? Math.round((ticked / total) * 100) : 0}%"></i></div>
    </div>
    {#if status === 'done'}<button type="button" class="btn-primary btn-sm" onclick={() => (sheet = { mode: 'summary' })}>{t('Summary')}</button>{:else}<button type="button" class="btn-primary btn-sm" onclick={finish}>{t('Finish')}</button>{/if}
  </div>
{/if}

<PageHead
  title={shownTitle}
  sub={`${cap(longDay)}${time ? ` · ${time}` : ''}${status === 'done' ? ` · ${t('done')}` : status === 'skipped' ? ` · ${t('skipped')}` : ''}`}
  back={plan ? { href: `/training/plans/${plan.id}`, label: plan.name } : { href: `/training?w=${day}`, label: t('Training') }}
  focus={status === 'planned'}>
  {#snippet actions()}<span class="sync muted small" role="status">{sync === 'saving' ? t('Saving…') : sync === 'saved' ? t('Saved') : sync === 'error' ? t('Not saved') : ''}</span>{/snippet}
</PageHead>

<div class="wk-meta">
  <label>{t('Date')} <input type="date" bind:value={day} onchange={queue} /></label>
  <span class="wk-acts">
    <button type="button" class="btn btn-sm" onclick={() => (sheet = { mode: 'details' })}>{t('Details')}</button>
    <button type="button" class="btn-danger btn-sm" onclick={discard}>{confirm === 'discard' ? t('Sure?') : t('Discard')}</button>
  </span>
</div>

{#if description}<p class="card small desc">{description}</p>{/if}

{#if items.some((i) => i.kind === 'exercise')}
  <details class="card fold" open>
    <summary><span class="h2" style:margin="0">{t('Muscles at work')}</span><svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></summary>
    <div class="segmented full">
      <button type="button" aria-pressed={mapMode === 'done'} onclick={() => (mapMode = 'done')}>{t('Done ({n})', { n: ticked })}</button>
      <button type="button" aria-pressed={mapMode === 'plan'} onclick={() => (mapMode = 'plan')}>{t('The whole plan ({n})', { n: total })}</button>
    </div>
    <LoadBlock load={muscleLoad(items, mapMode, lib)} empty={mapMode === 'done' ? t('Tick the first set and the muscles that worked show up here.') : t('Add exercises to see the muscles.')} />
  </details>
{/if}

<div class="exs">
  {#each items as it, i (it)}
    {#if it.kind === 'cardio'}
      {@const c = it}
      <div class="ex" class:complete={c.done} class:new={fresh === i}>
        <div class="ex-h">
          <span class="ex-thb"><Thumb sport={c.sport} cls="exth" /></span>
          <div class="ex-title">
            <span class="ex-name">{c.name ? t(c.name) : t(SPORT_LABELS[c.sport])}</span>
            <span class="ex-tags cardio">{t(SPORT_LABELS[c.sport])}{c.steps?.length ? ` · ${t('{n} blocks', { n: c.steps.length })}` : ''}</span>
          </div>
          <div class="ex-act">
            <button type="button" class="ic" class:confirm={confirm === `ex${i}`} aria-label={t('Remove')} onclick={() => removeItem(i)}>
              {#if confirm === `ex${i}`}{t('Remove?')}{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>{/if}
            </button>
          </div>
          {#if c.steps?.length}<div class="ex-prev">{stepsLine(c.steps, t)}</div>{/if}
        </div>
        <div class="cardio-f">
          <label>{t('time, min')}<input inputmode="numeric" placeholder="0" value={c.duration_min ?? ''} oninput={(ev) => { const n = parse(ev.currentTarget.value); c.duration_min = n ? Math.round(n) : undefined; queue(); }} /></label>
          <label>{t('distance, km')}<input inputmode="decimal" placeholder="0" value={c.distance_m ? c.distance_m / 1000 : ''} oninput={(ev) => { const n = parse(ev.currentTarget.value); c.distance_m = n ? Math.round(n * 1000) : undefined; queue(); }} /></label>
          <button type="button" class="chk" class:on={c.done} class:pop={pop === `c${i}`} aria-pressed={!!c.done} aria-label={t('Mark as done')} onclick={() => tickCardio(c, i)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
          </button>
        </div>
        <Blocks bind:steps={c.steps} onchange={queue} />
        {#if noteOpen[i] || c.note}<textarea class="note" placeholder={t('A note, e.g. how it felt')} value={c.note ?? ''} oninput={(ev) => ((c.note = ev.currentTarget.value || undefined), queue())}></textarea>{/if}
        <div class="ex-foot">{#if !noteOpen[i] && !c.note}<button type="button" class="tool first" onclick={() => (noteOpen[i] = true)}>{t('Note')}</button>{/if}</div>
      </div>
    {:else}
      {@const e = it}
      {@const entry = entryOf(e)}
      {@const prev = perfs[i]}
      {@const pair = !!e.ref && PAIR.has(e.ref) && e.unit === 'reps'}
      {@const open = e.sets.some((x) => !x.done)}
      {@const anyPR = e.sets.some((_, j) => isRecord(e, j, bests[i]))}
      {@const bar = !!e.ref && BAR.has(e.ref) && e.unit === 'reps'}
      <div class="ex" class:complete={e.sets.length > 0 && !open} class:new={fresh === i}>
        <div class="ex-h">
          <button type="button" class="ex-thb" aria-label={t('Details and progress')} onclick={() => (sheet = { mode: 'info', key: keyOf(e), ref: e.ref, name: e.name })}><Thumb ref={e.ref} name={t(e.name)} cls="exth" /></button>
          <button type="button" class="ex-title" onclick={() => (sheet = { mode: 'info', key: keyOf(e), ref: e.ref, name: e.name })}>
            <span class="ex-name">{t(e.name)}</span>
            <span class="ex-tags">{entry?.muscles?.map((m) => t(MUSCLES[m])).join(', ') ?? ''}{#if pair}<span class="pairtag">{t('2 dumbbells, type both')}</span>{/if}{#if anyPR}<span class="pr">{t('Record')}</span>{/if}</span>
          </button>
          <div class="ex-act">
            <button type="button" class="ic" aria-label={t('Details and progress')} onclick={() => (sheet = { mode: 'info', key: keyOf(e), ref: e.ref, name: e.name })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg></button>
            <button type="button" class="ic" class:confirm={confirm === `ex${i}`} aria-label={t('Remove the exercise')} onclick={() => removeItem(i)}>
              {#if confirm === `ex${i}`}{t('Remove?')}{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>{/if}
            </button>
          </div>
          <div class="ex-prev">{prev ? t('Last time {day}: {sets}', { day: fmtShort(prev.day, t.locale), sets: setsText(prev.sets, prev.unit, t.locale) }) : t('First time')}</div>
        </div>
        {#if prev && open}
          <div class="qo" role="group" aria-label={t('Fill the sets from last time')}>
            {#each quickOptions(e, prev) as o (o.id)}
              {@const lab = qoLabel(e, o, prev)}
              <button type="button" class="qo-b" class:on={qo[i] === o.id} onclick={() => quick(e, i, o.id)}><b>{lab[0]}</b><span>{lab[1]}</span></button>
            {/each}
          </div>
        {/if}
        <div class="sets" class:one={e.unit !== 'reps'}>
          <div class="sets-head"><div>#</div>{#if e.unit === 'reps'}<div>{pair ? t('kg together') : 'kg'}</div><div>{t('reps')}</div>{:else}<div>{e.unit === 'minutes' ? t('time in minutes') : t('time in seconds')}</div>{/if}<div></div><div></div></div>
          {#each e.sets as set, j (j)}
            {@const p = ph(prev, j)}
            <div class="set" class:done={set.done} class:pop={pop === `${i}-${j}`} class:new={pop === `new-${i}-${j}`} class:isPR={isRecord(e, j, bests[i])} data-set="{i}-{j}">
              <div class="n">{j + 1}</div>
              {#if e.unit === 'reps'}
                <label class="kgw" class:p={pair}>
                  <input
                    inputmode="decimal"
                    enterkeyhint="next"
                    data-f="kg"
                    aria-label={pair ? t('Both dumbbells together, kg') : t('Weight, kg')}
                    value={set.kg ?? ''}
                    placeholder={p?.kg ? fmtN(p.kg, t.locale) : entry?.bodyweight ? '—' : '0'}
                    oninput={(ev) => setValue(e, j, 'kg', ev.currentTarget.value)}
                    onkeydown={(ev) => {
                      if (ev.key === 'Enter') {
                        ev.preventDefault();
                        (ev.currentTarget.closest('.set')?.querySelector('[data-f="amount"]') as HTMLInputElement | null)?.focus();
                      }
                    }}
                  />
                  {#if pair}<small class="ph">{(set.kg ?? p?.kg) ? `2 × ${fmtN((set.kg ?? p?.kg ?? 0) / 2, t.locale)} kg` : ''}</small>{/if}
                </label>
                <input inputmode="numeric" enterkeyhint="done" data-f="amount" aria-label={t('Reps')} value={set.reps ?? ''} placeholder={p?.reps ? String(p.reps) : '0'} oninput={(ev) => setValue(e, j, 'reps', ev.currentTarget.value)} />
              {:else if e.unit === 'minutes'}
                <input inputmode="decimal" enterkeyhint="done" data-f="amount" aria-label={t('Minutes')} value={set.seconds ? set.seconds / 60 : ''} placeholder={p?.seconds ? fmtN(p.seconds / 60, t.locale) : '0'} oninput={(ev) => setValue(e, j, 'minutes', ev.currentTarget.value)} />
              {:else}
                <input inputmode="numeric" enterkeyhint="done" data-f="amount" aria-label={t('Seconds')} value={set.seconds ?? ''} placeholder={p?.seconds ? String(p.seconds) : '0'} oninput={(ev) => setValue(e, j, 'seconds', ev.currentTarget.value)} />
              {/if}
              <button type="button" class="chk" aria-pressed={!!set.done} aria-label={t('Mark the set as done')} onclick={() => tickSet(i, j)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </button>
              <button type="button" class="x" aria-label={t('Remove the set')} onclick={() => (e.sets.splice(j, 1), queue())}>×</button>
            </div>
          {/each}
        </div>
        {#if noteOpen[i] || e.note}<textarea class="note" placeholder={t('A note, e.g. the seat setting, how it felt')} value={e.note ?? ''} oninput={(ev) => ((e.note = ev.currentTarget.value || undefined), queue())}></textarea>{/if}
        {#if prev?.note && !e.note}<div class="muted small lastnote">{t('Note from last time:')} <i>{prev.note}</i></div>{/if}
        <div class="ex-foot">
          <button type="button" class="btn-plain btn-sm" onclick={() => addSet(e, i)}>+ {t('Add a set')}</button>
          <span class="tools">
            {#if !noteOpen[i] && !e.note}<button type="button" class="tool" onclick={() => (noteOpen[i] = true)}>{t('Note')}</button>{/if}
            {#if bar}<button type="button" class="tool" onclick={() => (sheet = { mode: 'plates', ex: i, kg: platesFor(e, prev) })}>{t('Plates')}</button>{/if}
            {#if e.unit !== 'minutes'}<button type="button" class="tool" onclick={() => switchUnit(e)}>{e.unit === 'reps' ? t('Count time') : t('Count weight')}</button>{/if}
          </span>
        </div>
      </div>
    {/if}
  {/each}
</div>

<button type="button" class="btn-tinted btn-block" style:margin="4px 0 10px" onclick={() => (sheet = { mode: 'pick' })}>+ {t('Add an exercise or a run')}</button>
{#if items.length}
  {#if status === 'done'}
    <button type="button" class="btn-primary btn-lg btn-block" onclick={() => (sheet = { mode: 'summary' })}>{t('Summary')}</button>
  {:else}
    <button type="button" class="btn-primary btn-lg btn-block" onclick={finish}>{t('Finish and save the workout')}</button>
  {/if}
{/if}

{#if status !== 'done' && items.some((i) => i.kind === 'exercise')}<RestTimer bind:this={rest} />{/if}
<canvas class="fx" bind:this={fx}></canvas>

{#if toast}<div class="toast" class:gold={toast.gold} role="status">{toast.text}</div>{/if}

{#if sheet?.mode === 'pick'}
  <Sheet title={t('Add to the workout')} onclose={() => (sheet = null)}>
    {#snippet head()}<input class="search" type="search" bind:value={query} placeholder={t('Search, or type your own exercise')} autocomplete="off" onkeydown={(ev) => ev.key === 'Enter' && query.trim() && addPicked(query.trim())} />{/snippet}
    <Picker library={lib} {history} {inWorkout} bind:query onpick={addPicked} />
  </Sheet>
{:else if sheet?.mode === 'info'}
  {@const sh = sheet}
  <Sheet onclose={() => (sheet = null)}>
    <ExerciseInfo entry={sh.ref ? libraryById(sh.ref, lib) : undefined} name={sh.name} keyId={sh.key} {history} action={null} />
  </Sheet>
{:else if sheet?.mode === 'plates'}
  {@const sh = sheet}
  <Sheet title={t('Plate calculator')} onclose={() => (sheet = null)}>
    <Plates
      kg={sh.kg}
      onuse={sh.ex == null
        ? undefined
        : (kg) => {
            const e = items[sh.ex!] as ExerciseItem;
            for (const x of e.sets) if (!x.done && x.kg == null) x.kg = kg;
            queue();
            sheet = null;
          }}
    />
  </Sheet>
{:else if sheet?.mode === 'details'}
  <Sheet title={t('Details')} onclose={() => (sheet = null)}>
    <div class="form">
      <label>{t('Title')}<input maxlength="120" bind:value={title} oninput={queue} placeholder={items.length ? autoTitle(items, t) : t('e.g. Intervals 5 x 1 km')} /></label>
      <div class="two">
        <label>{t('Time (optional)')}<input type="time" bind:value={time} onchange={queue} /></label>
        <label
          >{t('Plan')}
          <select bind:value={planId} onchange={queue}>
            <option value="">{t('No plan')}</option>
            {#each data.plans as pl (pl.id)}<option value={pl.id}>{pl.name}{pl.active ? ` (${t('active')})` : ''}</option>{/each}
          </select>
        </label>
      </div>
      <label>{t('Description')}<textarea rows="3" maxlength="4000" bind:value={description} oninput={queue}></textarea></label>
      <p class="muted small" style:margin="0">
        {#if data.session.sent_at}{t('On the Garmin watch.')}{:else if data.watchable && status === 'planned'}{t('Not on the watch yet. Ask Claude: "Send this workout to my watch."')}{/if}
        {#if data.session.activity_ref}{t('Linked to the activity {id}.', { id: data.session.activity_ref })}{/if}
      </p>
      <label>{t('Save as a template')}<input maxlength="120" bind:value={tplName} placeholder={t('e.g. Full body A')} /></label>
      <button type="button" class="btn btn-block" disabled={!tplName.trim() || !items.length} onclick={saveTemplate}>{tplSaved ? t('Saved') : t('Save the template')}</button>
      {#if status === 'planned' && sid !== 'new'}<button type="button" class="btn btn-block" onclick={() => setStatus('skip')}>{t('Skip this workout')}</button>{/if}
      {#if status !== 'planned'}<button type="button" class="btn btn-block" onclick={() => setStatus('reopen')}>{t('Back to planned')}</button>{/if}
    </div>
  </Sheet>
{:else if sheet?.mode === 'summary'}
  <Sheet full onclose={() => (sheet = null)}>
    <div class="sum-hero">
      <Mascot mood="charged" size={56} label={t('{name} in a sweatband', { name: mascotName() })} />
      <div><h2>{records.length ? t('New records!') : t('Well done')}</h2><p>{cap(longDay)}{plan ? `, ${plan.name}` : ''}</p></div>
    </div>
    <div class="sum-kpis">
      <div><b>{minutes || '—'}</b><span>{minutes ? t('minutes') : t('time unknown')}</span></div>
      {#if volume || !km}<div><b>{Math.round(volume).toLocaleString(t.locale)}</b><span>{t('kg lifted')}</span></div>{:else}<div><b>{fmtN(km, t.locale)}</b><span>km</span></div>{/if}
      <div><b>{setCount || items.filter((i) => i.kind === 'cardio' && i.done).length}</b><span>{setCount ? t('sets') : t('done')}</span></div>
    </div>
    {#if fact}<div class="fact">{fact.times >= 1.95 ? t('That is about {n} × {what}.', { n: fmtN(fact.times, t.locale), what: t(fact.what) }) : t('That is about as much as {what}.', { what: t(fact.what) })}</div>{/if}
    {#if records.length}
      <div class="card prlist"><div class="h2">{t('Records')}</div>{#each records as r (r.name)}<div class="r"><span>{r.name}</span><b>{r.text}</b></div>{/each}</div>
    {/if}
    <div class="card">
      <div class="h2">{t('How hard was it?')}</div>
      <div class="rpe" role="radiogroup" aria-label={t('Effort (RPE 1-10)')}>
        {#each Array.from({ length: 10 }, (_, k) => String(k + 1)) as n (n)}
          <button type="button" role="radio" aria-checked={rpe === n} onclick={() => ((rpe = rpe === n ? '' : n), queue())}>{n}</button>
        {/each}
      </div>
      <textarea rows="2" maxlength="2000" bind:value={note} oninput={queue} placeholder={t('How did it feel?')}></textarea>
    </div>
    {#if items.some((i) => i.kind === 'exercise')}
      <div class="card"><div class="h2">{t('Muscles at work')}</div><LoadBlock load={muscleLoad(items, 'logged', lib)} empty="" /></div>
    {/if}
    {#if !tplSaved}
      <div class="form" style:margin-bottom="10px">
        <input maxlength="120" bind:value={tplName} placeholder={t('Template name, e.g. Full body A')} aria-label={t('Template name')} />
        <button type="button" class="btn btn-block" disabled={!tplName.trim()} onclick={saveTemplate}>{t('Save as a template')}</button>
      </div>
    {/if}
    <button type="button" class="btn-primary btn-lg btn-block" onclick={() => goto(`/training?w=${day}`)}>{t('Done')}</button>
  </Sheet>
{/if}
