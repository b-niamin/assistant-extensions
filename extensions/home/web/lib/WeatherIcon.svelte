<script lang="ts">
  import type { Sky } from './weather';

  /**
   * Weather glyphs, pure SVG. Clouds wear ink, the sun its yellow, rain the blue hue and lightning the
   * yellow: colour on marks, never on text (specs/001-design.md).
   */
  let { sky, night = false, size = 32, label }: { sky: Sky; night?: boolean; size?: number; label?: string } = $props();

  const CLOUD = 'M19 46h27a10 10 0 0 0 1.6-19.9A15 15 0 0 0 19 27.5 9.3 9.3 0 0 0 19 46z';
  const behind = $derived(sky === 'partly');
  const precip = $derived(['drizzle', 'rain', 'sleet', 'snow', 'storm'].includes(sky));
</script>

<svg
  class="wx"
  width={size}
  height={size}
  viewBox="0 0 64 64"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  {#if sky === 'clear' || behind}
    <g transform={behind ? 'translate(-8 -9) scale(.8)' : ''}>
      {#if night}
        <path class="moon" d="M40 12a20 20 0 1 0 14 30A17 17 0 0 1 40 12z" />
      {:else}
        <circle class="sun" cx="32" cy="32" r="11" />
        {#each [0, 45, 90, 135, 180, 225, 270, 315] as a}
          <line class="ray" x1="32" y1="13" x2="32" y2="7" transform="rotate({a} 32 32)" />
        {/each}
      {/if}
    </g>
  {/if}

  {#if sky !== 'clear' && sky !== 'fog'}
    <g transform={precip ? 'translate(0 -8)' : behind ? 'translate(4 4)' : ''}>
      {#if behind}<path class="gap" d={CLOUD} />{/if}
      <path class="cloud" d={CLOUD} />
    </g>
  {/if}

  {#if sky === 'fog'}
    {#each [22, 32, 42] as y, i}
      <line class="fog" x1={12 + i * 4} y1={y} x2={52 - (i % 2) * 6} y2={y} />
    {/each}
  {:else if sky === 'drizzle'}
    {#each [24, 36] as x}<line class="drop" x1={x} y1="44" x2={x - 2} y2="50" />{/each}
  {:else if sky === 'rain'}
    {#each [21, 31, 41] as x}<line class="drop" x1={x} y1="44" x2={x - 3} y2="55" />{/each}
  {:else if sky === 'sleet'}
    <line class="drop" x1="24" y1="44" x2="21" y2="54" />
    <circle class="flake" cx="38" cy="50" r="2.6" />
  {:else if sky === 'snow'}
    {#each [[22, 48], [32, 54], [42, 48]] as [x, y]}<circle class="flake" cx={x} cy={y} r="2.6" />{/each}
  {:else if sky === 'storm'}
    <path class="bolt" d="M34 40l-8 12h7l-3 10 10-14h-7l3-8z" />
  {/if}
</svg>

<style>
  .wx {
    display: block;
    flex: none;
    overflow: visible;
  }
  .cloud {
    fill: var(--ink);
  }
  .gap {
    fill: none;
    stroke: var(--surface);
    stroke-width: 6;
  }
  .sun {
    fill: var(--hue-yellow);
  }
  .ray {
    stroke: var(--hue-yellow);
    stroke-width: 4;
    stroke-linecap: round;
  }
  .moon {
    fill: var(--ink-2);
  }
  .drop {
    stroke: var(--hue-blue);
    stroke-width: 4;
    stroke-linecap: round;
  }
  .flake {
    fill: var(--ink-2);
  }
  .bolt {
    fill: var(--hue-yellow);
  }
  .fog {
    stroke: var(--ink-2);
    stroke-width: 4;
    stroke-linecap: round;
  }
</style>
