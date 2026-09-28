import { describe, expect, it } from 'vitest';
import { analyseSeries, pairSeries, pearson, pearsonPValue, spearman, type SeriesObservation } from './analysis';

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

  it('respects ±3, ±7 and ±14 day nearest windows', () => {
    const x = [point('x', '2026-01-01', 1)], y = [point('y', '2026-01-08', 2)];
    expect(pairSeries(x, y, 'nearest', 3)).toHaveLength(0);
    expect(pairSeries(x, y, 'nearest', 7)).toHaveLength(1);
    expect(pairSeries(x, y, 'nearest', 14)).toHaveLength(1);
  });

  it('supports forward-only symptom/recovery lags without using earlier outcomes', () => {
    const training = [point('training', '2026-01-10', 1)];
    const symptoms = [point('earlier', '2026-01-09', 9), point('plus2', '2026-01-12', 2)];
    const pairs = pairSeries(training, symptoms, 'forward-lag', 3);
    expect(pairs.map((pair) => [pair.y.id, pair.dayDifference])).toEqual([['plus2', 2]]);
  });

  it('deterministically pairs duplicate-date observations one-to-one', () => {
    const pairs = pairSeries(
      [point('x2', '2026-01-01', 2), point('x1', '2026-01-01', 1)],
      [point('y2', '2026-01-01', 20), point('y1', '2026-01-01', 10)],
      'same-day',
    );
    expect(pairs.map((pair) => [pair.x.id, pair.y.id])).toEqual([['x1', 'y1'], ['x2', 'y2']]);
    expect(new Set(pairs.map((pair) => pair.y.id)).size).toBe(2);
  });
});

describe('statistics', () => {
  it('calculates Pearson and Spearman correlations', () => {
    const values: [number, number][] = [[1, 2], [2, 4], [3, 6]];
    expect(pearson(values)).toBeCloseTo(1);
    expect(spearman(values)).toBeCloseTo(1);
    expect(pearsonPValue(1, 3)).toBe(0);
    expect(pearsonPValue(.5, 10)).toBeCloseTo(.141, 3);
    expect(analyseSeries(values.map(([x], i) => point(`x${i}`, `2026-01-0${i + 1}`, x)), values.map(([, y], i) => point(`y${i}`, `2026-01-0${i + 1}`, y)), 'same-day').n).toBe(3);
  });

  it('returns no correlation for insufficient or constant data', () => {
    expect(pearson([[1, 2]])).toBeUndefined();
    expect(spearman([[1, 2], [1, 3]])).toBeUndefined();
  });

  it('preserves a time trend for future residual-based adjustment instead of silently changing it', () => {
    const x = [1, 2, 3, 4, 5, 6].map((value, index) => point(`x${index}`, `2026-01-0${index + 1}`, value));
    const y = [10, 20, 30, 40, 50, 60].map((value, index) => point(`y${index}`, `2026-01-0${index + 1}`, value));
    const result = analyseSeries(x, y, 'same-day');
    expect(result.pearsonR).toBeCloseTo(1);
    expect(result.pairs.map((pair) => pair.xDate)).toEqual(x.map((item) => item.date));
  });
});
