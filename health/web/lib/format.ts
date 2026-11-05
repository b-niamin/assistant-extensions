export function km(m: number | null): string {
  return m == null ? '–' : `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km`;
}

export function hms(s: number | null): string {
  if (s == null) return '–';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** min/km for runs and walks; null for anything without both inputs. */
export function pace(distanceM: number | null, durationS: number | null): string | null {
  if (!distanceM || !durationS) return null;
  const secPerKm = durationS / (distanceM / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function sportLabel(sport: string): string {
  return sport.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
