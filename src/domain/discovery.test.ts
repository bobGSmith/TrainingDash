import { describe, expect, it } from 'vitest';
import type { NumericSeries } from './analysisVariables';
import { benjaminiHochberg, discoverRelationships, discoveryScore } from './discovery';

function series(id: string, values: number[], dayOffset = 0): NumericSeries {
  const observations = values.map((value, index) => ({ id: `${id}-${index}`, date: `2026-01-${String(index + 1 + dayOffset).padStart(2, '0')}`, value, label: id }));
  return { id, exercise: id, metric: 'value', variable: 'value', label: 'Value', source: 'Full Session tracking', direction: 'neutral', observations, series: observations, discoveryEligible: true, metadata: { category: 'Training' } };
}

describe('discovery screening', () => {
  it('applies monotonic Benjamini-Hochberg correction in original order', () => {
    expect(benjaminiHochberg([.01, .04, .03, .2])).toEqual([.04, .05333333333333334, .05333333333333334, .2]);
  });

  it('filters relationships below the configured paired minimum n', () => {
    expect(discoverRelationships([series('x', [1, 2, 3, 4, 5]), series('y', [2, 4, 6, 8, 10])], { minimumN: 6 })).toEqual([]);
    const results = discoverRelationships([series('x', [1, 2, 3, 4, 5, 6]), series('y', [2, 4, 6, 8, 10, 12])], { minimumN: 6 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ n: 6, pearsonR: 1, spearmanRho: 1, rawP: 0, qValue: 0 });
  });

  it('requires usable paired dates, not just enough observations in each series', () => {
    expect(discoverRelationships([series('x', [1, 2, 3, 4, 5, 6]), series('y', [2, 4, 6, 8, 10, 12], 10)], { minimumN: 6 })).toEqual([]);
  });

  it('ranks supported, agreeing effects above tiny or disagreeing evidence', () => {
    const supported = discoveryScore({ n: 20, pearsonR: .7, spearmanRho: .68, qValue: .02 });
    const tiny = discoveryScore({ n: 6, pearsonR: .99, spearmanRho: .99, qValue: .4 });
    const disagreeing = discoveryScore({ n: 20, pearsonR: .7, spearmanRho: -.4, qValue: .02 });
    expect(supported).toBeGreaterThan(tiny);
    expect(supported).toBeGreaterThan(disagreeing);
  });
});
