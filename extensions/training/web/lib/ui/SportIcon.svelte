<script lang="ts">
  import type { Sport } from '../model';

  /** A line icon for a cardio sport (or recovery). */
  let { sport }: { sport: Sport | 'recovery' } = $props();
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if sport === 'running'}
    <circle cx="14" cy="4.5" r="1.8" /><path d="M7 21l3-6 3 2v4M10 15l1.5-5L8 11l-2 3M11.5 10l3 2.5 3.5.5" />
  {:else if sport === 'cycling'}
    <circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-7h5l3 7M10 9l3 7h-7M14 6h2" />
  {:else if sport === 'swimming'}
    <path d="M3 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M3 13c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" /><circle cx="16" cy="6" r="1.8" /><path d="M6 10l4-3 3 3" />
  {:else if sport === 'walking' || sport === 'hiking'}
    <circle cx="12" cy="4.5" r="1.8" /><path d="M9 21l2-6 2 2v4M11 15l1-6-3 2-1 3M12 9l2 3 3 1" />
  {:else if sport === 'rowing'}
    <path d="M3 18h18M5 14l14-6M8 9l2 4" /><circle cx="9" cy="6" r="1.6" />
  {:else if sport === 'skiing'}
    <circle cx="15" cy="4.5" r="1.8" /><path d="M4 20l16-4M8 17l3-6 4 2 2-4M11 11l-2-2" />
  {:else if sport === 'recovery'}
    <path d="M12 3c3 4 5 6.5 5 10a5 5 0 0 1-10 0c0-3.5 2-6 5-10z" />
  {:else}
    <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
  {/if}
</svg>
