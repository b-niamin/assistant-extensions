/**
 * The API sources beside Garmin (Strava, Withings) and the writes back to the sources, pure parts: the
 * settings cards, what a write looks like, checks of the arguments the tools take. No DB, no network:
 * the connectors service (services/garmin-sync, `python -m sync connectors`) does the talking.
 */
import { EN, type SourceStatus, type TileData, type Translate } from '$shell';
import { longDay } from './sync';

export type Provider = 'strava' | 'withings';
export const PROVIDERS: Record<Provider, { name: string; what: string; apps: string }> = {
  strava: { name: 'Strava', what: 'activities, their titles and descriptions', apps: 'https://www.strava.com/settings/api' },
  withings: { name: 'Withings', what: 'weight and body composition from the scale', apps: 'https://developer.withings.com/dashboard/' }
};

/** Run by the card's button in the app's terminal (ext-run reaches the worker). */
export const connectCommand = (provider: Provider, profile: string) => `ext-run health connectors python -m sync connect ${provider} --profile ${profile}`;

export interface ProviderInfo {
  status: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  /** Activities (Strava) or weigh-ins (Withings) stored. */
  count: number;
  first: string | null;
  /** Strava: how many are linked to a Garmin activity. */
  linked?: number;
  pending: boolean;
  /** Withings: new weigh-ins are copied to Garmin. */
  toGarmin?: boolean;
}

export function providerSource(provider: Provider, info: ProviderInfo, profile: string, t: Translate = EN): SourceStatus {
  const p = PROVIDERS[provider];
  const state = info.status === 'connected' ? 'connected' : info.status === 'reconnect' ? 'reconnect' : 'not_connected';
  const src: SourceStatus = { id: provider, name: p.name, state };
  const day = (d: string) => longDay(d, t.locale);
  if (state !== 'connected') {
    src.help =
      state === 'reconnect'
        ? t('{name} no longer accepts the saved login. Sign in again: the button runs it in the terminal at the bottom.', { name: p.name })
        : t(
            'Uses your own {name} API app (free, at {apps}): the button runs the sign-in in the terminal at the bottom, which asks for its client ID and secret and gives you a link to allow access. Brings in {what}.',
            { name: p.name, apps: p.apps, what: t(p.what) }
          );
    src.command = connectCommand(provider, profile);
    if (state === 'not_connected') return src;
  }
  if (info.connectedAt) src.account = t('Connected on {day}', { day: day(info.connectedAt) });
  src.facts = [
    { label: provider === 'strava' ? t('Activities') : t('Weigh-ins'), value: info.count.toLocaleString(t.locale) },
    { label: t('Data since'), value: info.first ? day(info.first) : t('nothing yet') }
  ];
  if (provider === 'strava' && info.count) src.facts.push({ label: t('Matched with Garmin'), value: (info.linked ?? 0).toLocaleString(t.locale) });
  if (provider === 'withings') src.facts.push({ label: t('Copied to Garmin'), value: info.toGarmin ? t('new weigh-ins') : t('off') });
  src.sync = {
    state: info.pending ? 'queued' : 'idle',
    lastAt: info.lastSyncAt,
    label: info.pending ? t('Waiting for the service: it starts within a few seconds.') : undefined
  };
  src.actions = [{ id: 'sync-now', label: t('Sync now'), disabled: info.pending || state !== 'connected' }];
  if (provider === 'withings')
    src.actions.push(
      info.toGarmin
        ? { id: 'garmin-off', label: t('Stop copying to Garmin') }
        : { id: 'garmin-on', label: t('Copy new weigh-ins to Garmin'), help: t('Each new Withings weigh-in is added to Garmin Connect, so the watch knows your weight.') }
    );
  return src;
}

// -- writes ------------------------------------------------------------------------------------------

export const WRITE_TARGETS = ['garmin', 'strava'] as const;
export type WriteTarget = (typeof WRITE_TARGETS)[number];

export interface Write {
  id: string;
  target: string;
  op: string;
  state: string;
  error: string | null;
  result: unknown;
  requestedBy: string | null;
  requestedAt: string;
  finishedAt: string | null;
}

/** Sports that become a Garmin workout (garmin_core/workouts.py, sport families). */
export const WORKOUT_SPORTS = ['running', 'cycling', 'swimming', 'strength_training', 'walking', 'other'];

const STEP_KINDS = new Set(['warmup', 'cooldown', 'work', 'recovery', 'rest', 'repeat']);
const DURATIONS = new Set(['lap', 'time', 'distance', 'calories']);
const TARGETS = new Set(['none', 'pace', 'speed', 'hr', 'power', 'cadence']);

/**
 * A workout's steps as Garmin takes them, checked here so the caller hears about a mistake at once
 * (the service checks again before Garmin). Returns the problems, empty when fine.
 */
export function stepProblems(steps: unknown, depth = 0, where = 'steps'): string[] {
  if (!Array.isArray(steps) || !steps.length) return [`${where}: at least one step`];
  if (steps.length > 50) return [`${where}: at most 50 steps`];
  const out: string[] = [];
  steps.forEach((s, i) => {
    const at = `${where}[${i}]`;
    if (!s || typeof s !== 'object') return out.push(`${at}: an object`);
    const st = s as Record<string, unknown>;
    if (!STEP_KINDS.has(String(st.kind))) return out.push(`${at}.kind: one of ${[...STEP_KINDS].join(', ')}`);
    if (st.kind === 'repeat') {
      if (depth > 0) return out.push(`${at}: repeats cannot be nested`);
      if (!Number.isInteger(st.repeats) || (st.repeats as number) < 1 || (st.repeats as number) > 99) out.push(`${at}.repeats: 1-99`);
      out.push(...stepProblems(st.steps, 1, `${at}.steps`));
      return;
    }
    const d = String(st.durationType ?? 'lap');
    if (!DURATIONS.has(d)) out.push(`${at}.durationType: one of ${[...DURATIONS].join(', ')}`);
    else if (d !== 'lap' && !(typeof st.durationValue === 'number' && st.durationValue > 0)) out.push(`${at}.durationValue: a positive number (seconds, metres or kcal)`);
    if (st.target !== undefined && st.target !== null) {
      const tg = st.target as Record<string, unknown>;
      if (typeof tg !== 'object' || !TARGETS.has(String(tg.type ?? 'none'))) out.push(`${at}.target.type: one of ${[...TARGETS].join(', ')}`);
    }
  });
  return out;
}

/** What one write did, in a line for the owner. */
export function writeLine(w: Pick<Write, 'target' | 'op' | 'state' | 'error'>, t: Translate = EN): string {
  const what: Record<string, string> = {
    'garmin.send_workout': 'Workout to Garmin',
    'garmin.remove_workout': 'Workout removed from Garmin',
    'garmin.add_weight': 'Weight to Garmin',
    'garmin.edit_activity': 'Garmin activity edited',
    'strava.edit_activity': 'Strava activity edited'
  };
  const state: Record<string, string> = { queued: 'waiting', running: 'running', done: 'done', failed: 'failed', unsupported: 'not supported' };
  const line = `${t(what[`${w.target}.${w.op}`] ?? `${w.target} ${w.op}`)}: ${t(state[w.state] ?? w.state)}`;
  return w.error ? `${line} (${w.error})` : line;
}

/** The weight on each day: Withings when it has one (the scale), else Garmin. */
export function mergedWeights(rows: { day: string; source: string; kg: number }[]): { day: string; kg: number; source: string }[] {
  const by = new Map<string, { day: string; kg: number; source: string }>();
  for (const r of rows) {
    const cur = by.get(r.day);
    if (!cur || (r.source === 'withings' && cur.source !== 'withings')) by.set(r.day, { day: r.day, kg: r.kg, source: r.source });
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** The weight tile: the latest weigh-in, its change over 30 days, and the line (Withings first, then Garmin). */
export function weightTile(points: { day: string; kg: number; source: string }[], t: Translate = EN): TileData {
  if (!points.length) return { empty: { message: t('No weigh-ins in the last 90 days. Connect Withings, or weigh in with Garmin.') } };
  const last = points[points.length - 1];
  const monthAgo = points.find((p) => Date.parse(p.day) >= Date.parse(last.day) - 30 * 86_400_000) ?? points[0];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    kpis: [
      { label: t('Latest'), value: r1(last.kg), unit: 'kg', digits: 1, delta: monthAgo === last ? null : r1(last.kg - monthAgo.kg) }
    ],
    series: { kind: 'line', unit: 'kg', hue: 'aqua', caption: t('last 90 days · {source}', { source: last.source === 'withings' ? 'Withings' : 'Garmin' }), points: points.map((p) => ({ label: p.day.slice(5), value: r1(p.kg) })) }
  };
}
