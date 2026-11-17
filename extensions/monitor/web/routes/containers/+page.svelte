<script lang="ts">
  import type { DataOf } from '$shell';
  import MonitorPage from '../../lib/MonitorPage.svelte';
  import type { load } from '../+page.server';

  let { data }: { data: DataOf<typeof load> } = $props();
</script>

<MonitorPage {data} show="containers" />
