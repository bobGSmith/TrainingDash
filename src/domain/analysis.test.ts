import { describe, expect, it } from 'vitest';
import { analyseSeries, pairSeries, pearson, spearman, type SeriesObservation } from './analysis';

const point = (id: string, date: string, value: number): SeriesObservation => ({ id, date, value, label: id });

describe('temporal pairing', () => {
  it('pairs only same-day observations and never reuses a Y observation', () => {
    const pairs = pairSeries([point('x1', '2026-01-01', 1), point('x2', '2026-01-01', 2)], [point('y1', '2026-01-01', 3)], 'same-day');
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.dayDifference).toBe(0);
  });

  it('selects nearest unused observations inside the configured window', () => {
    const pairs = pairSeries(
      [point('x1', '2026-01-10', 1), point('x2', '2026-01-20', 2)],
      [point('y1', '2026-01-08', 3), point('y2', '2026-01-24', 4)],
      'nearest', 5,
    );
    expect(pairs.map((pair) => [pair.x.id, pair.y.id, pair.dayDifference])).toEqual([['x1', 'y1', -2], ['x2', 'y2', 4]]);
  });

  it('does not pair observations outside the maximum separation', () => {
    expect(pairSeries([point('x', '2026-01-01', 1)], [point('y', '2026-01-20', 2)], 'nearest', 14)).toEqual([]);
  });
});

describe('statistics', () => {
  it('calculates Pearson and Spearman correlations', () => {
    const values: [number, number][] = [[1, 2], [2, 4], [3, 6]];
    expect(pearson(values)).toBeCloseTo(1);
    expect(spearman(values)).toBeCloseTo(1);
    expect(analyseSeries(values.map(([x], i) => point(`x${i}`, `2026-01-0${i + 1}`, x)), values.map(([, y], i) => point(`y${i}`, `2026-01-0${i + 1}`, y)), 'same-day').n).toBe(3);
  });

  it('returns no correlation for insufficient or constant data', () => {
    expect(pearson([[1, 2]])).toBeUndefined();
    expect(spearman([[1, 2], [1, 3]])).toBeUndefined();
  });
});
