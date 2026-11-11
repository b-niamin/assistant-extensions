/** The snapshot the server hands the board, the tile and Claude. Shared by server and browser code. */
import type { CalendarEvent } from './calendar';
import type { HomeState, WeatherWarning } from './home';
import type { Weather } from './weather';

export interface Snapshot {
  /** When this snapshot was taken (ISO). */
  at: string;
  /** How often the board asks for a new one. */
  refreshSeconds: number;
  /** The house's time zone (Home Assistant's, else the forecast's). */
  timezone: string;
  ha: { configured: boolean; error?: string; home?: HomeState };
  weather: { configured: boolean; error?: string; data?: Weather; stale?: boolean; warnings: WeatherWarning[] };
  calendar: { configured: boolean; error?: string; events: CalendarEvent[] };
}
