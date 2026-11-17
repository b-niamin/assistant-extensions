<script lang="ts">
  import { getContext } from 'svelte';
  import { imageOf, OWN_PHOTOS } from '../gym';
  import { SPORT_HUES, type Sport } from '../model';
  import SportIcon from './SportIcon.svelte';

  /** The picture of an exercise, an icon for cardio, else the first letter of the name. */
  let { ref, name = '', sport, cls = '' }: { ref?: string; name?: string; sport?: Sport; cls?: string } = $props();
  const own = getContext<(() => Record<string, string>) | undefined>(OWN_PHOTOS);
  let broken = $state(false);
  const src = $derived(sport || broken ? undefined : imageOf(ref, 0, own?.()));
</script>

{#if src}
  <img class="thumb {cls}" {src} alt="" loading="lazy" decoding="async" onerror={() => (broken = true)} />
{:else if sport}
  <span class="thumb ph cardio {cls}" style="--hue: var(--hue-{SPORT_HUES[sport]})" aria-hidden="true"><SportIcon {sport} /></span>
{:else}
  <span class="thumb ph {cls}" aria-hidden="true">{(name.trim() || '?').charAt(0).toUpperCase()}</span>
{/if}
