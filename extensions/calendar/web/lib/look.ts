/** One colour per app on the calendar, the same everywhere: the shell's categorical hues. */
const FIXED: Record<string, string> = { calendar: 'blue', gym: 'orange', health: 'aqua', home: 'violet' };
const REST = ['magenta', 'yellow', 'green', 'red'];

export function hueOf(extension: string): string {
  if (FIXED[extension]) return FIXED[extension];
  let h = 0;
  for (const c of extension) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return REST[h % REST.length];
}
