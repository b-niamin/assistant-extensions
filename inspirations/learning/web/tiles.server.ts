/** Placeholder tile until the extension is built: an honest empty state with the next step. */
import type { ExtTile } from '$shell';

export const tiles: ExtTile[] = [
  {
    id: 'main',
    title: "Study today",
    size: 'sm',
    load: () => ({
      empty: {
        message: "No decks yet. Create the first one to start a streak.",
        action: { label: "Create a deck", href: "/learning" }
      }
    })
  }
];
