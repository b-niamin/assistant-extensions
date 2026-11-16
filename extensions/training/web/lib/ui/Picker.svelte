<script lang="ts">
  import { useT } from '$shell/ui';
  import { usedOn, type Logged } from '../gym';
  import { MUSCLES, type LibraryEntry } from '../library';
  import Thumb from './Thumb.svelte';

  /**
   * Add to the workout, as the gym log did: a search over the library (cardio, exercises, recovery), what
   * was done lately first, and "Add «…»" for an exercise of your own.
   */
  let {
    library,
    history,
    inWorkout,
    query = $bindable(''),
    onpick
  }: { library: LibraryEntry[]; history: Logged[]; inWorkout: Set<string>; query?: string; onpick: (e: LibraryEntry | string) => void } = $props();
  const t = useT();
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const used = $derived(usedOn(history));
  const list = $derived.by(() => {
    const q = fold(query.trim());
    return library
      .filter((e) => !q || fold(`${t(e.name)} ${e.name}`).includes(q))
      .sort((a, b) => (used.get(b.id) ?? '').localeCompare(used.get(a.id) ?? '') || t(a.name).localeCompare(t(b.name), t.locale));
  });
  const exact = $derived(list.some((e) => fold(t(e.name)) === fold(query.trim())));
  const sub = (e: LibraryEntry) =>
    e.kind === 'cardio'
      ? t('Cardio: time, distance, blocks for the watch')
      : e.muscles?.length
        ? e.muscles.map((m) => t(MUSCLES[m])).join(', ')
        : e.unit === 'minutes'
          ? t('Recovery')
          : t('Your own');
</script>

{#if query.trim() && !exact}
  <button type="button" class="item new" onclick={() => onpick(query.trim())}>
    <div><div class="nm">{t('Add “{name}”', { name: query.trim() })}</div><div class="mu">{t('Your own exercise')}</div></div>
    <span class="add-dot">+</span>
  </button>
{/if}
{#each list as e (e.id)}
  <button type="button" class="item th" onclick={() => onpick(e)}>
    <Thumb ref={e.id} name={t(e.name)} sport={e.kind === 'cardio' ? (e.sport ?? 'other') : undefined} cls="sm" />
    <div class="tx"><div class="nm">{t(e.name)}</div><div class="mu">{sub(e)}{inWorkout.has(e.id) ? t(', already in the workout') : ''}</div></div>
    <span class="add-dot">+</span>
  </button>
{/each}
