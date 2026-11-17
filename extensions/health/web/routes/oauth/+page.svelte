<script lang="ts">
  import { EmptyState, useT, mascotName } from '$shell/ui';
  import type { DataOf } from '$shell';
  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();
</script>

<svelte:head><title>{t('Connect an account')}</title></svelte:head>

<section class="wrap rise">
  {#if data.result === 'ok'}
    <EmptyState title={t('{name} allowed', { name: data.provider ?? '' })} level={1} mood="charged" mascotLabel={t('{name} is happy', { name: mascotName() })}>
      <p class="muted">{t('Go back to the terminal: it finishes the sign-in within a few seconds. You can close this page.')}</p>
      <a class="btn" href="/settings/extensions/health">{t('Open settings')}</a>
    </EmptyState>
  {:else if data.result === 'refused'}
    <EmptyState title={t('Access was not allowed')} level={1} mood="tired" mascotLabel={t('{name} is sorry', { name: mascotName() })}>
      <p class="muted">{t('Nothing was saved. Run the sign-in again in the terminal if you want to connect {name}.', { name: data.provider ?? '' })}</p>
    </EmptyState>
  {:else}
    <EmptyState title={t('This sign-in is not waiting')} level={1} mood="idle" mascotLabel={t('{name} is puzzled', { name: mascotName() })}>
      <p class="muted">{t('It may be older than 15 minutes, already used, or started for another profile. Run the sign-in again in the terminal.')}</p>
    </EmptyState>
  {/if}
</section>

<style>
  .wrap {
    max-width: 720px;
    margin: var(--space-7) auto;
    padding: 0 var(--space-4);
  }
</style>
