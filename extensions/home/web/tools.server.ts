/**
 * Tools for Claude (spec 005). Read-only: the extension only shows the house, it never switches anything.
 * The token never leaves the server; the overview carries names and states only.
 */
import type { ExtTool } from '$shell';
import { snapshot } from './lib/snapshot.server';
import { summary } from './lib/weather';

export const tools: ExtTool[] = [
  {
    name: 'overview',
    description:
      'The house right now, from Home Assistant: which lights are on, which doors and windows are open (with since ' +
      'when), active or recent alerts (cameras, doorbell), weather now and for the next 24 hours with warnings, ' +
      "and today's calendar events. Read-only.",
    input: { type: 'object', properties: {} },
    run: async (_args, ctx) => {
      const s = await snapshot(ctx);
      const w = s.weather.data;
      return {
        at: s.at,
        timezone: s.timezone,
        homeAssistant: s.ha.configured ? (s.ha.error ? { error: s.ha.error } : s.ha.home) : 'not connected',
        weather: w
          ? { place: w.place, now: w.current, next24h: summary(w), hours: w.hours, warnings: s.weather.warnings, stale: !!s.weather.stale }
          : (s.weather.error ?? 'no location set'),
        today: s.calendar.error ? { error: s.calendar.error } : s.calendar.events
      };
    }
  }
];
