/** The month grid: weeks from Monday, days as YYYY-MM-DD. Pure, unit-tested. */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The month to show: ?m=2026-11, else the month of ?d, else today's. */
export function pickMonth(m: string | null, d: string | null, today: string): { month: string; selected: string } {
  const selected = d && DAY.test(d) && !Number.isNaN(Date.parse(d)) ? d : null;
  const month = m && MONTH.test(m) ? m : (selected ?? today).slice(0, 7);
  return { month, selected: selected && selected.startsWith(month) ? selected : today.startsWith(month) ? today : `${month}-01` };
}

/** The days on screen: whole weeks (Monday first) covering the month; 4 to 6 rows. */
export function monthGrid(month: string): { first: string; last: string; weeks: string[][] } {
  const start = `${month}-01`;
  const lead = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const first = addDays(start, -lead);
  const [y, mo] = month.split('-').map(Number);
  const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const weeks: string[][] = [];
  for (let d = first; d <= end; ) {
    const w: string[] = [];
    for (let i = 0; i < 7; i++, d = addDays(d, 1)) w.push(d);
    weeks.push(w);
  }
  return { first, last: weeks[weeks.length - 1][6], weeks };
}

export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export { addDays };
