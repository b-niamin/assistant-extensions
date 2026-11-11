/** Round axis ticks covering min..max, about `count` steps of 1, 2, 2.5 or 5 x 10^n. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** The same for bytes: round in the unit the top value is shown in (KB, MB, ...), so labels read 2 MB, 4 MB. */
export function byteTicks(min: number, max: number, count = 4): number[] {
  let unit = 1;
  while (Math.max(Math.abs(min), Math.abs(max)) / unit >= 1024 && unit < 1024 ** 5) unit *= 1024;
  return niceTicks(min / unit, max / unit, count).map((v) => v * unit);
}
