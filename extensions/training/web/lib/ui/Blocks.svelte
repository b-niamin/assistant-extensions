<script lang="ts">
  import { useT } from '$shell/ui';
  import { parseTarget, targetInput, type Step } from '../model';

  /**
   * Blocks for the watch: warm-up, work, recovery, cool-down, and repeats of them (intervals), each by
   * time, distance or until the lap button, with a pace or heart rate target. Garmin's step format.
   */
  let { steps = $bindable(), onchange }: { steps: Step[] | undefined; onchange: () => void } = $props();
  const t = useT();
  const KINDS = ['warmup', 'work', 'recovery', 'rest', 'cooldown'] as const;
  const KIND_LABELS: Record<string, string> = { warmup: 'Warm-up', work: 'Work', recovery: 'Recovery', rest: 'Rest', cooldown: 'Cool-down' };
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const newStep = (kind: string): Step => ({ kind, durationType: 'time', durationValue: kind === 'work' ? 300 : 600 });
  function lengthInput(st: Step): string {
    const v = Number(st.durationValue);
    if (st.durationType === 'time' && v > 0) return mmss(v);
    if (st.durationType === 'distance' && v > 0) return String(v);
    return '';
  }
  function setLength(st: Step, v: string) {
    if (st.durationType === 'time') {
      const m = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(v.trim());
      st.durationValue = m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : undefined;
    } else if (st.durationType === 'distance') {
      const n = Number(v.replace(',', '.'));
      st.durationValue = Number.isFinite(n) && n > 0 ? n : undefined;
    }
    onchange();
  }
  function setTarget(st: Step, v: string) {
    const target = parseTarget(v);
    if (target) st.target = target;
    else delete st.target;
    onchange();
  }
  const add = (s: Step) => {
    (steps ??= []).push(s);
    onchange();
  };
</script>

{#snippet row(st: Step, list: Step[], k: number)}
  <div class="step">
    <select aria-label={t('Part')} bind:value={st.kind} onchange={onchange}>
      {#each KINDS as kd (kd)}<option value={kd}>{t(KIND_LABELS[kd])}</option>{/each}
    </select>
    <select aria-label={t('Length')} bind:value={st.durationType} onchange={() => ((st.durationValue = undefined), onchange())}>
      <option value="time">{t('Time')}</option>
      <option value="distance">{t('Distance')}</option>
      <option value="lap">{t('Until lap')}</option>
    </select>
    <button type="button" class="x" aria-label={t('Remove')} onclick={() => (list.splice(k, 1), onchange())}>×</button>
    {#if st.durationType !== 'lap'}
      <input inputmode={st.durationType === 'time' ? 'text' : 'numeric'} aria-label={st.durationType === 'time' ? t('Time, mm:ss') : t('Metres')} placeholder={st.durationType === 'time' ? 'mm:ss' : t('metres')} value={lengthInput(st)} onchange={(ev) => setLength(st, ev.currentTarget.value)} />
    {:else}<span class="muted small">{t('until you press lap')}</span>{/if}
    <input aria-label={t('Target: pace 4:50-5:10 or heart rate 140-150')} placeholder={t('pace 4:50-5:10 / HR 140-150')} value={targetInput(st.target)} onchange={(ev) => setTarget(st, ev.currentTarget.value)} />
  </div>
{/snippet}

<details class="blocks" open={!!steps?.length}>
  <summary>{t('Blocks for the watch')}{steps?.length ? ` (${steps.length})` : ''}</summary>
  {#each steps ?? [] as st, k (k)}
    {#if st.kind === 'repeat'}
      {@const inner = st.steps as Step[]}
      <div class="repeat">
        <div class="repeat-h">
          <span>{t('Repeat')}</span>
          <input inputmode="numeric" aria-label={t('Times')} value={st.repeats ?? 2} onchange={(ev) => ((st.repeats = Math.max(1, Math.min(50, Number(ev.currentTarget.value) || 1))), onchange())} />
          <span>×</span>
          <button type="button" class="x" aria-label={t('Remove')} onclick={() => (steps!.splice(k, 1), onchange())}>×</button>
        </div>
        {#each inner as s2, k2 (k2)}{@render row(s2, inner, k2)}{/each}
        <button type="button" class="link" onclick={() => (inner.push(newStep('work')), onchange())}>+ {t('Step')}</button>
      </div>
    {:else}
      {@render row(st, steps!, k)}
    {/if}
  {/each}
  <div class="row">
    <button type="button" class="gbtn line sm" onclick={() => add(newStep(steps?.length ? 'work' : 'warmup'))}>+ {t('Step')}</button>
    <button type="button" class="gbtn line sm" onclick={() => add({ kind: 'repeat', repeats: 4, steps: [{ kind: 'work', durationType: 'distance', durationValue: 400 }, { kind: 'recovery', durationType: 'time', durationValue: 90 }] })}>+ {t('Intervals')}</button>
  </div>
</details>
