<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../lib/gym.css';

  /** Every Training page wears the shell's look plus Training's own parts (gym.css); the shell draws the page navigation. */
  let { children }: { children: Snippet } = $props();
</script>

<div class="gym">
  {@render children()}
</div>
