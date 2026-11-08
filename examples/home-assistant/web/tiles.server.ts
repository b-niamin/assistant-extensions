/** Placeholder tile until the extension is built: an honest empty state with the next step. */
import type { ExtTile } from '$shell';

export const tiles: ExtTile[] = [
  {
    id: 'main',
    title: "Home",
    size: 'sm',
    load: () => ({
      empty: {
        message: "Not connected yet. Add a Home Assistant URL and token in System settings.",
        action: { label: "Connect", href: "/settings" }
      }
    })
  }
];
