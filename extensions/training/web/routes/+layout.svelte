<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import '../lib/gym.css';
  import { OWN_PHOTOS } from '../lib/gym';

  /** Every Training page wears the shell's look plus Training's own parts (gym.css); the shell draws the page navigation. */
  let { data, children }: { data: { ownPhotos?: Record<string, string> }; children: Snippet } = $props();
  setContext(OWN_PHOTOS, () => data.ownPhotos ?? {});
</script>

<div class="gym">
  {@render children()}
</div>
