import { describe, expect, it } from 'vitest';
import { weekRange } from './view';

describe('weekRange', () => {
  it('names a week of this month by its days, others with the month and, another year, the year', () => {
    expect(weekRange('2026-11-16', '2026-11-17')).toBe('Mon 16 – Sun 22');
    expect(weekRange('2026-11-02', '2026-11-17')).toBe('Mon 2 – Sun 8');
    expect(weekRange('2026-10-26', '2026-11-17')).toBe('Oct 26 – Nov 1');
    expect(weekRange('2026-11-30', '2026-11-17')).toBe('Nov 30 – Dec 6');
    expect(weekRange('2025-12-29', '2026-01-02')).toBe('Dec 29, 2025 – Jan 4');
    expect(weekRange('2026-11-16', '2026-11-17', 'pl')).toBe('pon. 16 – niedz. 22');
  });
});
