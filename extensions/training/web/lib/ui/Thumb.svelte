<script lang="ts">
  import { imageOf } from '../gym';
  import { SPORT_HUES, type Sport } from '../model';
  import SportIcon from './SportIcon.svelte';

  /** The picture of an exercise, an icon for cardio, else the first letter of the name. */
  let { ref, name = '', sport, cls = '' }: { ref?: string; name?: string; sport?: Sport; cls?: string } = $props();
  const src = $derived(sport ? undefined : imageOf(ref));
</script>

{#if src}
  <img class="thumb {cls}" {src} alt="" loading="lazy" decoding="async" />
{:else if sport}
  <span class="thumb ph cardio {cls}" style="--hue: var(--hue-{SPORT_HUES[sport]})" aria-hidden="true"><SportIcon {sport} /></span>
{:else}
  <span class="thumb ph {cls}" aria-hidden="true">{(name.trim() || '?').charAt(0).toUpperCase()}</span>
{/if}
