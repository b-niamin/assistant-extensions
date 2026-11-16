<script lang="ts">
  import { useT } from '$shell/ui';
  import { fade, fly } from 'svelte/transition';

  /**
   * The rest timer of the gym log: a round button with the time; tap it for -15 / +5 / +15 / Start, and a
   * running countdown opens big (three quarters of the screen). The last length is remembered.
   */
  const t = useT();
  const KEY = 'training.rest';
  let def = $state(90);
  try {
    const v = parseInt(localStorage.getItem(KEY) ?? '', 10);
    if (v >= 5) def = v;
  } catch {
    /* no storage */
  }
  let on = $state(false);
  let open = $state(false);
  let big = $state(false);
  let end = $state(0);
  let total = $state(90000);
  let now = $state(Date.now());
  let buzzed = false;
  let iv: ReturnType<typeof setInterval> | undefined;
  const buzz = (p: number | number[]) => {
    try {
      navigator.vibrate?.(p);
    } catch {
      /* none */
    }
  };
  const remember = (s: number) => {
    try {
      localStorage.setItem(KEY, String(s));
    } catch {
      /* none */
    }
  };
  const ms = $derived(end - now);
  const left = $derived(on ? Math.max(0, Math.ceil(ms / 1000)) : def);
  const done = $derived(on && left === 0);
  const frac = $derived(on ? 1 - Math.min(1, Math.max(0, ms) / total) : 0);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  export function start(sec = def) {
    def = sec;
    remember(sec);
    total = sec * 1000;
    end = Date.now() + total;
    now = Date.now();
    buzzed = false;
    on = true;
    clearInterval(iv);
    iv = setInterval(() => {
      now = Date.now();
      if (end - now <= 0 && !buzzed) {
        buzzed = true;
        buzz([120, 80, 120]);
      }
      if (end - now < -20000) stop();
    }, 250);
  }
  export function stop() {
    clearInterval(iv);
    on = false;
    big = false;
  }
  /** A length to offer next (a timed set's seconds), when nothing runs. */
  export function suggest(sec: number) {
    if (!on && sec >= 5 && sec !== def) {
      def = sec;
      remember(sec);
    }
  }
  function adj(d: number) {
    if (on) {
      end += d * 1000;
      total = Math.max(1000, total + d * 1000);
      if (end > Date.now()) buzzed = false;
    } else def = Math.max(5, def + d);
    buzz(8);
  }
  function toggle() {
    if (on) stop();
    else {
      start(def);
      open = false;
      big = true;
    }
    buzz(12);
  }
  $effect(() => () => clearInterval(iv));
  const RC = 182.2;
  const RBC = 628.3;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (big = false)} />
<div class="rest" class:run={on} class:end={done} aria-live="polite">
  <button
    type="button"
    class="fab"
    aria-label={t('Rest timer: show or hide its settings')}
    onclick={() => {
      if (on) big = true;
      else open = !open;
      buzz(8);
    }}
  >
    <svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bgc" cx="32" cy="32" r="29" />{#if on}<circle class="fg" cx="32" cy="32" r="29" stroke-dasharray={RC} stroke-dashoffset={(RC * frac).toFixed(1)} />{/if}</svg>
    <b>{mmss(left)}</b>
  </button>
  {#if open && !on}
    <div class="rest-panel" role="group" aria-label={t('Rest timer')} transition:fly={{ x: 18, duration: 200 }}>
      <button type="button" class="r" aria-label={t('15 seconds shorter')} onclick={() => adj(-15)}>−15</button>
      <button type="button" class="r" aria-label={t('5 seconds longer')} onclick={() => adj(5)}>+5 s</button>
      <button type="button" class="r" aria-label={t('15 seconds longer')} onclick={() => adj(15)}>+15</button>
      <button type="button" class="r go" onclick={toggle}>{t('Start')}</button>
    </div>
  {/if}
</div>
{#if big}
  <div class="gym-layer">
    <div class="sheet-bg" role="presentation" style:z-index="44" onclick={() => (big = false)} transition:fade={{ duration: 200 }}></div>
    <div class="rbig" class:end={done} role="dialog" aria-label={t('Rest timer')} transition:fly={{ y: 500, duration: 300, opacity: 1 }}>
      <div class="grab"></div>
      <div class="rbig-top"><span class="h2" style:margin="0">{t('Rest')}</span><button type="button" class="gbtn sm" onclick={() => (big = false)}>{t('Hide')}</button></div>
      <div class="rbig-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true"><circle class="bgc" cx="110" cy="110" r="100" /><circle class="fg" cx="110" cy="110" r="100" stroke-dasharray={RBC} stroke-dashoffset={(RBC * frac).toFixed(1)} /></svg>
        <div class="rbig-t"><b>{mmss(left)}</b><span>{done ? t('Time is up!') : t('left')}</span></div>
      </div>
      <div class="rbig-btns">
        <button type="button" class="r" aria-label={t('15 seconds shorter')} onclick={() => adj(-15)}>−15</button>
        <button type="button" class="r" aria-label={t('5 seconds longer')} onclick={() => adj(5)}>+5 s</button>
        <button type="button" class="r" aria-label={t('15 seconds longer')} onclick={() => adj(15)}>+15</button>
      </div>
      <button type="button" class="go2" onclick={toggle}>{done ? t('Done') : t('Skip')}</button>
    </div>
  </div>
{/if}
