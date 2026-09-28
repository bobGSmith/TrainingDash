import { describe, expect, it } from 'vitest';
import type { NumericSeries } from './analysisVariables';
import { analyseSeries } from './analysis';
import { benjaminiHochberg, discoverRelationships, discoverRelationshipsDetailed, discoveryScore, evaluateDiscoveryEligibility } from './discovery';

function series(id: string, values: number[], dayOffset = 0): NumericSeries {
  const observations = values.map((value, index) => ({ id: `${id}-${index}`, date: `2026-01-${String(index + 1 + dayOffset).padStart(2, '0')}`, value, label: id }));
  return { id, exercise: id, metric: 'value', variable: 'value', label: 'Value', source: 'Full Session tracking', direction: 'neutral', observations, series: observations, discoveryEligible: true, metricFamily: 'PERFORMANCE', derivedFrom: [], sourceObservationIds: observations.map((item) => item.id), conceptId: `${id}:PERFORMANCE`, metadata: { category: 'Training', exerciseConcept: id } };
}

function semanticSeries(id: string, exercise: string, metricFamily: NumericSeries['metricFamily'], options: { derivedFrom?: string[]; sourceIds?: string[]; protocol?: string } = {}): NumericSeries {
  const result = series(id, [1, 2, 3, 4, 5, 6]);
  result.exercise = exercise;
  result.metricFamily = metricFamily;
  result.derivedFrom = options.derivedFrom ?? [];
  result.sourceObservationIds = options.sourceIds ?? result.sourceObservationIds;
  result.metadata.exerciseConcept = exercise;
  result.metadata.protocol = options.protocol;
  result.conceptId = `${exercise}:${metricFamily}`;
  return result;
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

  it('excludes direct derivation and same-exercise performance redundancy', () => {
    const intensity = semanticSeries('bss-intensity', 'Bulgarian split squat', 'PERFORMANCE');
    const eightRep = semanticSeries('bss-8rm', 'Bulgarian split squat', 'PERFORMANCE', { derivedFrom: [intensity.id] });
    const e1rm = semanticSeries('bss-e1rm', 'Bulgarian split squat', 'PERFORMANCE', { derivedFrom: [intensity.id, 'bss-reps'] });
    expect(evaluateDiscoveryEligibility(intensity, e1rm).reason).toBe('DIRECT_DERIVATION');
    expect(evaluateDiscoveryEligibility(eightRep, e1rm).reason).toBe('SAME_EXERCISE_PERFORMANCE_REDUNDANCY');
  });

  it('excludes back-squat performance variants while allowing cross-exercise performance', () => {
    const intensity = semanticSeries('squat-intensity', 'Back squat', 'PERFORMANCE');
    const fiveRep = semanticSeries('squat-5rm', 'Back squat', 'PERFORMANCE', { derivedFrom: [intensity.id] });
    const e1rm = semanticSeries('squat-e1rm', 'Back squat', 'PERFORMANCE', { derivedFrom: [intensity.id, 'squat-reps'] });
    const jump = semanticSeries('jump', 'Vertical jump', 'PERFORMANCE');
    const fly = semanticSeries('fly', '10 m fly', 'PERFORMANCE');
    expect(evaluateDiscoveryEligibility(fiveRep, e1rm).eligible).toBe(false);
    expect(evaluateDiscoveryEligibility(intensity, fiveRep).eligible).toBe(false);
    expect(evaluateDiscoveryEligibility(e1rm, jump).eligible).toBe(true);
    expect(evaluateDiscoveryEligibility(e1rm, fly).eligible).toBe(true);
  });

  it('allows useful same-exercise and symptom relationships across semantic families', () => {
    const performance = semanticSeries('squat-performance', 'Back squat', 'PERFORMANCE');
    const rpe = semanticSeries('squat-rpe', 'Back squat', 'EFFORT', { sourceIds: performance.sourceObservationIds });
    const sprintVolume = semanticSeries('sprint-volume', 'Sprint exposure', 'VOLUME');
    const achillesPain = semanticSeries('achilles', 'Achilles morning pain', 'SYMPTOM');
    expect(evaluateDiscoveryEligibility(performance, rpe).eligible).toBe(true);
    expect(evaluateDiscoveryEligibility(sprintVolume, achillesPain).eligible).toBe(true);
  });

  it('keeps semantically excluded relationships available to manual Explore analysis', () => {
    const intensity = semanticSeries('squat-intensity', 'Back squat', 'PERFORMANCE');
    const e1rm = semanticSeries('squat-e1rm', 'Back squat', 'PERFORMANCE', { derivedFrom: [intensity.id] });
    expect(evaluateDiscoveryEligibility(intensity, e1rm).eligible).toBe(false);
    expect(analyseSeries(intensity.observations, e1rm.observations, 'same-day').n).toBe(6);
  });

  it('identifies same-observation leakage only within the same semantic family', () => {
    const sourceIds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const volumeA = semanticSeries('volume-a', 'Exercise A', 'VOLUME', { sourceIds });
    const volumeB = semanticSeries('volume-b', 'Exercise B', 'VOLUME', { sourceIds });
    volumeB.observations = volumeB.observations.map((item) => ({ ...item, value: item.value * 2 }));
    volumeB.series = volumeB.observations;
    expect(evaluateDiscoveryEligibility(volumeA, volumeB).reason).toBe('SAME_OBSERVATION_LEAKAGE');
  });

  it('collapses semantic duplicates in the shortlist but retains all analyses', () => {
    const squatLoad = semanticSeries('squat-load', 'Back squat', 'PERFORMANCE');
    const squatE1rm = semanticSeries('squat-e1rm', 'Back squat', 'PERFORMANCE');
    const jump = semanticSeries('jump', 'Vertical jump', 'PERFORMANCE');
    const report = discoverRelationshipsDetailed([squatLoad, squatE1rm, jump], { minimumN: 6 });
    expect(report.allResults).toHaveLength(2);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.relatedAnalysisCount).toBe(2);
  });
});
