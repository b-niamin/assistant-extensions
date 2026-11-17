<script lang="ts">
  import { useT } from '$shell/ui';
  import { photoUrl } from '../gym';

  /**
   * The photo of an own exercise, from the same source as the built-in ones (Free Exercise DB): the start
   * position and the end of the movement. Search it by name (in English, as the source names them), tap one.
   * The form gets it as `photo` (empty = none).
   */
  let { photo = $bindable(''), name = '' }: { photo?: string; name?: string } = $props();
  const t = useT();
  type Choice = { photo: string; name: string; equipment: string; muscle: string };

  let open = $state(false);
  let q = $state('');
  let hits = $state<Choice[]>([]);
  let busy = $state(false);
  let chosen = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  function find(text: string) {
    clearTimeout(timer);
    if (!text.trim()) return void (hits = []);
    timer = setTimeout(async () => {
      busy = true;
      try {
        const res = await fetch(`/training/photos?q=${encodeURIComponent(text)}`);
        if (res.ok && q === text) hits = await res.json();
      } finally {
        busy = false;
      }
    }, 250);
  }
  function pick(c: Choice) {
    photo = c.photo;
    chosen = c.name;
    open = false;
  }
</script>

<input type="hidden" name="photo" value={photo} />
<div class="ppick">
  <div class="small muted">{t('Photo: start position and end of the movement')}</div>
  {#if photo}
    <div class="pair">
      <img src={photoUrl(photo, 0)} alt={t('{name}: start position', { name: name || chosen })} />
      <img src={photoUrl(photo, 1)} alt={t('{name}: end of the movement', { name: name || chosen })} />
    </div>
    <div class="row">
      <button type="button" class="btn btn-sm" onclick={() => (open = !open)}>{t('Change')}</button>
      <button type="button" class="btn btn-sm" onclick={() => ((photo = ''), (open = false))}>{t('Remove the photo')}</button>
    </div>
  {:else if !open}
    <button type="button" class="btn btn-block" onclick={() => (open = true)}>+ {t('Add a photo')}</button>
  {/if}
  {#if open}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="search"
      type="search"
      autofocus
      placeholder={t('Search in English, e.g. leg curl')}
      aria-label={t('Search a photo')}
      bind:value={q}
      oninput={() => find(q)}
      autocomplete="off"
    />
    <div class="list-group">
      {#each hits as c (c.photo)}
        <button type="button" class="list-row" aria-pressed={photo === c.photo} onclick={() => pick(c)}>
          <img class="thumb sm" src={photoUrl(c.photo, 0)} alt="" loading="lazy" decoding="async" />
          <span class="list-text"><span class="list-title">{c.name}</span><span class="list-sub">{[c.equipment, c.muscle].filter(Boolean).join(' · ')}</span></span>
        </button>
      {:else}
        <div class="empty">{busy ? t('Searching…') : q.trim() ? t('No photo with that name. Try another word.') : t('Photos: Free Exercise DB (public domain), named in English.')}</div>
      {/each}
    </div>
  {/if}
</div>
