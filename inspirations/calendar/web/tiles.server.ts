/** Placeholder tile until the extension is built: an honest empty state with the next step. */
import type { ExtTile } from '$shell';

export const tiles: ExtTile[] = [
  {
    id: 'main',
    title: "Up next",
    size: 'sm',
    load: () => ({
      empty: {
        message: "No calendar connected yet. Add a CalDAV or iCal link in System settings.",
        action: { label: "Connect", href: "/settings" }
      }
    })
  }
];
