<script lang="ts">
  import type { DataOf } from '$shell';
  import { Icon, PageHead, useT } from '$shell/ui';
  import Board from '../../lib/Board.svelte';
  import type { load } from './+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
  const t = useT();
  let board = $state<ReturnType<typeof Board>>();
</script>

<svelte:head><title>{t('E-ink')} · {t('Home')}</title></svelte:head>

<PageHead title={t('E-ink')} sub={t('Black and white, for a wall tablet or an e-ink display.')}>
  {#snippet actions()}
    <button type="button" class="btn-primary btn-icon" onclick={() => board?.toggleFull()} aria-label={t('Full screen')} title={t('Full screen')}><Icon name="monitor" size={20} /></button>
  {/snippet}
</PageHead>

<Board {data} bind:this={board} />
