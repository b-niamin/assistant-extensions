<script lang="ts">
  import { useT } from '$shell/ui';
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  /** A bottom sheet (a centred window on a computer): title, Close, an optional head, a scrolling body. */
  let { title = '', full = false, onclose, head, children }: { title?: string; full?: boolean; onclose: () => void; head?: Snippet; children: Snippet } =
    $props();
  const t = useT();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 960px)').matches;
  let body = $state<HTMLDivElement>();
  export function scrollTop() {
    body?.scrollTo(0, 0);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<div class="gym-layer">
  <div class="sheet-bg" role="presentation" onclick={onclose} transition:fade={{ duration: reduced ? 0 : 200 }}></div>
  <div class="sheet" class:full role="dialog" aria-modal="true" aria-label={title || t('Details')} transition:fly={{ y: wide ? 20 : 600, duration: reduced ? 0 : 300, opacity: wide ? 0 : 1 }}>
    <div class="grab"></div>
    <div class="sh-top"><span class="h2" style:margin="0">{title}</span><button class="gbtn line sm" type="button" onclick={onclose}>{t('Close')}</button></div>
    {#if head}<div class="sh-head">{@render head()}</div>{/if}
    <div class="sh-body" bind:this={body}>{@render children()}</div>
  </div>
</div>
