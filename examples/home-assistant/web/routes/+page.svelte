<svelte:head><title>Home · Assistant</title></svelte:head>

<div class="head">
  <p class="eyebrow">Coming soon</p>
  <h1>Home</h1>
</div>

<div class="card intro">
  <p>This extension will show a Home Assistant dashboard: temperatures, lights, energy use. It needs the Home Assistant URL and a long-lived access token, kept in System settings (never in this repo).</p>
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
