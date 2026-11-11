/**
 * Translation for the pure helpers in lib/ (spec 007). Pages pass the shell's t (useT() or ctx.t);
 * without one (tests, scripts) the English text comes back, with its {placeholders} filled in.
 */
import type { Translate } from '$shell';

const fill = (text: string, params?: Record<string, unknown>) =>
  params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] == null ? m : String(params[k]))) : text;

export const EN: Translate = Object.assign((text: string, params?: Record<string, string | number | null | undefined>) => fill(text, params), {
  n: (count: number, one: string, other: string, params?: Record<string, string | number | null | undefined>) =>
    fill(count === 1 ? one : other, { n: count, ...params }),
  lang: 'en',
  locale: 'en-GB'
});
