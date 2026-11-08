<script lang="ts">
  import { hueOf } from './look';

  /** A small tinted badge with a line glyph for a metric, in that metric's hue. */
  let { metric, size = 28 }: { metric: string; size?: number } = $props();
</script>

<span class="badge" style:--hue={hueOf(metric)} style:width="{size}px" style:height="{size}px" aria-hidden="true">
  <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>
    {#if metric === 'sleep'}
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    {:else if metric === 'hrv'}
      <path d="M2 12h4l2-5 4 10 2.5-7 1.5 2h6" />
    {:else if metric === 'body_battery'}
      <rect x="3" y="7" width="16" height="10" rx="2.5" /><path d="M22 10.5v3" /><path d="M11.5 8.8 9 12.5h4l-2.5 3.7" />
    {:else if metric === 'resting_heart_rate'}
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
    {:else if metric === 'stress'}
      <path d="M13 3 5.5 13.5H11L10 21l8-11h-5.5L13 3Z" />
    {:else if metric === 'steps'}
      <ellipse cx="8" cy="9" rx="3" ry="4.6" transform="rotate(-12 8 9)" /><path d="M6.4 16.6h3.6" />
      <ellipse cx="16" cy="12" rx="3" ry="4.6" transform="rotate(12 16 12)" /><path d="M14 19.6h3.6" />
    {:else}
      <circle cx="12" cy="12" r="7" /><path d="M12 8v4l2.5 2" />
    {/if}
  </svg>
</span>

<style>
  .badge {
    display: inline-grid;
    place-items: center;
    flex: none;
    border-radius: 8px;
    background: color-mix(in srgb, var(--hue) 14%, transparent);
  }
  svg {
    fill: none;
    stroke: var(--hue);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
