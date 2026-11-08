<svelte:head><title>Learning · Assistant</title></svelte:head>

<div class="head">
  <p class="eyebrow">Coming soon</p>
  <h1>Learning</h1>
</div>

<div class="card intro">
  <p>This extension will hold your own decks (per profile) with spaced repetition: cards due today, a streak and minutes studied per day.</p>
</div>

<style>
  .head {
    display: grid;
    gap: var(--space-1);
    margin-bottom: var(--space-5);
  }
  .head p,
  .head h1,
  .intro p {
    margin: 0;
  }
  .intro {
    max-width: 60ch;
    color: var(--ink-2);
  }
</style>
