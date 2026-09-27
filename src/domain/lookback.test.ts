import { describe, expect, it } from 'vitest';
import { latestRecordedDate, withinLookback } from './lookback';

describe('overview lookback', () => {
  const rows = [{ date: '2026-08-20' }, { date: '2026-08-27' }, { date: '2026-09-25' }, { date: undefined }];

  it('anchors to the latest recorded performance rather than wall-clock time', () => {
    expect(latestRecordedDate(rows)).toBe('2026-09-25');
    expect(withinLookback(rows, 30).map((row) => row.date)).toEqual(['2026-08-27', '2026-09-25']);
  });

  it('supports an all-time view without manufacturing dates', () => {
    expect(withinLookback(rows, 'all')).toHaveLength(4);
  });
});
