<svelte:head><title>Calendar · Assistant</title></svelte:head>

<div class="head">
  <p class="eyebrow">Coming soon</p>
  <h1>Calendar</h1>
</div>

<div class="card intro">
  <p>This extension will show the next events from shared family calendars (CalDAV or a private iCal link, kept in System settings).</p>
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
