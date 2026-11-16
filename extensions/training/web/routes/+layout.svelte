<script lang="ts">
  import { page } from '$app/state';
  import { useT } from '$shell/ui';
  import type { Snippet } from 'svelte';
  import '../lib/gym.css';

  /** Every Training page wears the gym log's look and its floating tab bar. */
  let { children }: { children: Snippet } = $props();
  const t = useT();
  const path = $derived(page.url.pathname);
  const tab = $derived(path.startsWith('/training/library') ? 'library' : path.startsWith('/training/plans') ? 'plans' : 'workout');
</script>

<div class="gym">
  {@render children()}
  <nav class="tabs" aria-label={t('Training')}>
    <a href="/training" aria-current={tab === 'workout' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></svg>{t('Workout')}
    </a>
    <a href="/training/plans" aria-current={tab === 'plans' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>{t('Plans')}
    </a>
    <a href="/training/library" aria-current={tab === 'library' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" /></svg>{t('Exercises')}
    </a>
  </nav>
</div>
