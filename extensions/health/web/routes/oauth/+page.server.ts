/**
 * Where Strava and Withings send the browser back after "Allow" (the redirect of the owner's own API app).
 * It only stores the code for the sign-in that `python -m sync connect` started (matched by its random
 * state, for this profile, within 15 minutes); the command in the terminal trades it for tokens. A code
 * is useless without the client secret, which never reaches the web app.
 */
import type { ExtLoad } from '$shell';

const STATE = /^[A-Za-z0-9_-]{16,80}$/;

export const load = (async ({ url }, ctx) => {
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const refused = url.searchParams.get('error');
  if (!STATE.test(state) || (!code && !refused)) return { result: 'invalid' as const, provider: null };
  const row = await ctx.db(async (sql) => {
    const [r] = await sql<{ provider: string }[]>`
      UPDATE health.oauth_pending
         SET code = ${code ? code.slice(0, 500) : null}, error = ${refused ? refused.slice(0, 120) : null}, received_at = now()
       WHERE state = ${state} AND profile_id = ${ctx.dataProfileId!} AND code IS NULL AND error IS NULL
         AND created_at > now() - interval '15 minutes'
       RETURNING provider`;
    return r ?? null;
  });
  if (!row) return { result: 'unknown' as const, provider: null };
  return { result: refused ? ('refused' as const) : ('ok' as const), provider: row.provider === 'withings' ? 'Withings' : 'Strava' };
}) satisfies ExtLoad;
