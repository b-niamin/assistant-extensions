<script lang="ts">
  import type { Item } from '../model';
  import Thumb from './Thumb.svelte';

  /** Up to three round pictures of a workout's items. */
  let { items }: { items: Item[] } = $props();
</script>

<span class="stack">
  {#each items.slice(0, 3) as it, i (i)}
    <Thumb ref={it.ref} name={it.kind === 'cardio' ? it.name : it.name} sport={it.kind === 'cardio' ? it.sport : undefined} cls="av" />
  {/each}
</span>
