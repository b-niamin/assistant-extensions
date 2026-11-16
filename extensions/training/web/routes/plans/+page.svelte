<script lang="ts">
  import type { DataOf } from '$shell';
  import { enhance, Mascot, useT } from '$shell/ui';
  import type { load } from './+page.server';

  let { data, form }: { data: DataOf<typeof load>; form: { error?: string; created?: string } | null } = $props();
  const t = useT();
  let adding = $state(false);

  const groups = $derived([
    { state: 'active', title: t('Active'), plans: data.plans.filter((p) => p.state === 'active') },
    { state: 'waiting', title: t('Waiting'), plans: data.plans.filter((p) => p.state === 'waiting') },
    { state: 'finished', title: t('Finished'), plans: data.plans.filter((p) => p.state === 'finished') }
  ]);
  const dates = (a: string | null, b: string | null) => (a || b ? `${a ?? '…'} – ${b ?? '…'}` : '');
</script>

<svelte:head><title>{t('Plans')} · {t('Training')}</title></svelte:head>

<nav class="crumbs"><a href="/training">{t('Training')}</a></nav>

<header class="head rise">
  <Mascot mood="steady" size={56} label={t('Pingo in a sweatband')} />
  <div>
    <h1>{t('Plans')}</h1>
    <p class="muted">{t('One plan is active: the week, the calendar and the dashboard show its workouts, and those of no plan.')}</p>
  </div>
</header>

{#if !data.plans.length}
  <p class="muted hint">{t('No plan yet. Ask Claude for one, or make one here and add workouts to it.')}</p>
{/if}

{#each groups as g (g.state)}
  {#if g.plans.length}
    <section class="rise" aria-labelledby="g-{g.state}">
      <h2 id="g-{g.state}">{g.title}</h2>
      <div class="list">
        {#each g.plans as pl (pl.id)}
          <article class="card plancard" class:active={pl.active}>
            <div class="ptop">
              <a href="/training/plans/{pl.id}"><strong>{pl.name}</strong></a>
              <span class="badge {pl.state}">{pl.state === 'active' ? t('Active') : pl.state === 'waiting' ? t('Waiting') : t('Finished')}</span>
            </div>
            {#if pl.goal}<p class="muted small">{pl.goal}</p>{/if}
            <p class="small">{[dates(pl.start_day, pl.end_day), t('{done} of {n} workouts done', { done: pl.done, n: pl.sessions })].filter(Boolean).join(' · ')}</p>
            <div class="progress" aria-hidden="true"><span style:width="{pl.sessions ? Math.round((pl.done / pl.sessions) * 100) : 0}%"></span></div>
            <form method="POST" action="?/activate" use:enhance class="row">
              {#if pl.active}
                <input type="hidden" name="plan" value="" />
                <button class="btn btn-ghost">{t('Set aside')}</button>
              {:else}
                <input type="hidden" name="plan" value={pl.id} />
                <button class="btn">{t('Make active')}</button>
              {/if}
              <a class="btn btn-ghost" href="/training/plans/{pl.id}">{t('Open')}</a>
            </form>
          </article>
        {/each}
      </div>
    </section>
  {/if}
{/each}

<section class="card rise newplan" aria-labelledby="new-title">
  <h2 id="new-title">{t('New plan')}</h2>
  {#if !adding}
    <button class="btn btn-primary" type="button" onclick={() => (adding = true)}>{t('New plan')}</button>
  {:else}
    <form
      method="POST"
      action="?/create"
      class="form"
      use:enhance={() => async ({ update, result }) => {
        await update();
        if (result.type === 'success') adding = false;
      }}
    >
      <label class="wide">{t('Name')}<input name="name" required maxlength="120" placeholder={t('e.g. 10 km under 50 minutes')} /></label>
      <label class="wide">{t('Goal (optional)')}<input name="goal" maxlength="1000" /></label>
      <label>{t('From')}<input name="start_day" type="date" /></label>
      <label>{t('Until')}<input name="end_day" type="date" /></label>
      <label class="wide check"><input type="checkbox" name="active" checked={!data.plans.some((p) => p.active)} /> {t('Make it the active plan')}</label>
      {#if form?.error}<p class="error wide" role="alert">{form.error}</p>{/if}
      <div class="row wide">
        <button class="btn btn-primary">{t('Create')}</button>
        <button class="btn btn-ghost" type="button" onclick={() => (adding = false)}>{t('Cancel')}</button>
      </div>
    </form>
  {/if}
  <p class="muted small">{t('Claude can build a whole plan with its workouts: just ask in the chat.')}</p>
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
  .hint {
    margin: 0 0 var(--space-4);
  }
  section {
    margin-bottom: var(--space-5);
  }
  h2 {
    margin: 0 0 var(--space-3);
  }
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-3);
  }
  .plancard {
    display: grid;
    gap: var(--space-2);
    align-content: start;
  }
  .plancard.active {
    outline: 2px solid var(--accent);
  }
  .plancard p {
    margin: 0;
  }
  .ptop {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    align-items: baseline;
  }
  .ptop a {
    color: var(--ink);
  }
  .badge {
    font-size: var(--text-sm);
    padding: 0 8px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--ink-2);
    white-space: nowrap;
  }
  .badge.active {
    background: var(--accent-fill);
    color: #fff;
  }
  .small {
    font-size: var(--text-sm);
  }
  .progress {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
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
  .form label.check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .form .wide {
    grid-column: 1 / -1;
  }
  .error {
    color: var(--critical-ink);
  }
</style>
