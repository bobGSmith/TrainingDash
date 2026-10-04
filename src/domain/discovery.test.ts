import { describe, expect, it } from 'vitest';
import type { DiscoveryDomain, NumericSeries } from './analysisVariables';
import { analyseSeries } from './analysis';
import { benjaminiHochberg, classifyEvidence, discoverRelationshipsDetailed, discoveryScore, evaluateDiscoveryEligibility } from './discovery';

const values = (n = 15) => Array.from({ length: n }, (_, index) => index + 1);

function series(id: string, sample = values(), dayOffset = 0): NumericSeries {
  const observations = sample.map((value, index) => ({ id: `${id}-${index}`, date: `2026-01-${String(index + 1 + dayOffset).padStart(2, '0')}`, value, label: id }));
  return { id, exercise: id, metric: 'value', variable: 'value', label: 'Value', source: 'Full Session tracking', direction: 'higher', observations, series: observations, discoveryEligible: true, metricFamily: 'PERFORMANCE', derivedFrom: [], sourceObservationIds: observations.map((item) => item.id), conceptId: `${id}:PERFORMANCE`, metadata: { category: 'Training', exerciseConcept: id, exerciseId: id, domain: 'PERFORMANCE', discoveryConcept: id, role: 'OUTCOME', quality: 'RAW' } };
}

function semanticSeries(id: string, exercise: string, options: {
  family?: NumericSeries['metricFamily']; domain?: DiscoveryDomain; concept?: string; metric?: string;
  derivedFrom?: string[]; derived?: boolean; sourceIds?: string[]; protocol?: string; structural?: boolean;
  prescription?: boolean; effortScope?: 'EXERCISE' | 'SESSION'; sessionIds?: string[]; direction?: NumericSeries['direction'];
  sample?: number[]; dayOffset?: number; timepoint?: string;
} = {}): NumericSeries {
  const result = series(id, options.sample ?? values(), options.dayOffset ?? 0);
  result.exercise = exercise;
  result.metric = options.metric ?? 'value';
  result.variable = result.metric;
  result.metricFamily = options.family ?? 'PERFORMANCE';
  result.derivedFrom = options.derivedFrom ?? [];
  result.derived = options.derived;
  result.sourceObservationIds = options.sourceIds ?? result.sourceObservationIds;
  result.direction = options.direction ?? 'higher';
  result.metadata = {
    ...result.metadata,
    exerciseConcept: exercise,
    exerciseId: exercise.toLowerCase(),
    protocol: options.protocol,
    measurementProtocol: options.protocol,
    structuralVariable: options.structural,
    trainingPrescription: options.prescription,
    effortScope: options.effortScope,
    sourceSessionIds: options.sessionIds,
    domain: options.domain ?? (result.metricFamily === 'TRAINING_LOAD' || result.metricFamily === 'EFFORT' ? 'TRAINING_EXPOSURE' : result.metricFamily),
    discoveryConcept: options.concept ?? id,
    timepoint: options.timepoint,
  };
  result.conceptId = `${exercise}:${result.metadata.discoveryConcept}`;
  return result;
}

describe('discovery utility screening', () => {
  it('applies monotonic Benjamini-Hochberg correction in original order', () => {
    expect(benjaminiHochberg([.01, .04, .03, .2])).toEqual([.04, .05333333333333334, .05333333333333334, .2]);
  });

  it('uses explicit evidence tiers and keeps n below 8 out of statistical testing', () => {
    const tooSmall = discoverRelationshipsDetailed([series('strength', values(7)), series('jump', values(7))]);
    expect(tooSmall.allResults).toEqual([]);
    expect(tooSmall.rejectedCounts.INSUFFICIENT_N).toBe(1);
    expect(classifyEvidence({ n: 8, pearsonR: .9, spearmanRho: .9, qValue: .01 })).toBe('EXPLORATORY');
    expect(classifyEvidence({ n: 12, pearsonR: .5, spearmanRho: .5, qValue: .15 })).toBe('SUPPORTED');
    expect(classifyEvidence({ n: 15, pearsonR: .6, spearmanRho: .55, qValue: .05 })).toBe('STRONG');
  });

  it('makes semantic value the strongest ranking component while retaining evidence penalties', () => {
    const useful = discoveryScore({ n: 15, pearsonR: .55, spearmanRho: .52, qValue: .08, semanticInterest: 2, evidenceTier: 'STRONG' });
    const lowValue = discoveryScore({ n: 20, pearsonR: .8, spearmanRho: .78, qValue: .01, semanticInterest: .5, evidenceTier: 'STRONG' });
    const weak = discoveryScore({ n: 8, pearsonR: .95, spearmanRho: .95, qValue: .5, semanticInterest: 2, evidenceTier: 'EXPLORATORY' });
    expect(useful).toBeGreaterThan(lowValue);
    expect(useful).toBeGreaterThan(weak);
  });

  it('excludes the known same-exercise effort couplings', () => {
    for (const exercise of ['Front squat', 'Clean pull']) {
      const performance = semanticSeries(`${exercise}-performance`, exercise, { concept: 'STRENGTH' });
      const rpe = semanticSeries(`${exercise}-rpe`, exercise, { family: 'EFFORT', concept: 'EXERCISE_RPE', metric: 'rpe', effortScope: 'EXERCISE' });
      expect(evaluateDiscoveryEligibility(performance, rpe).reason).toBe('SAME_EXERCISE_EFFORT_COUPLING');
    }
  });

  it('excludes cross-exercise RPE relationships by default', () => {
    const bss = semanticSeries('bss-intensity', 'Bulgarian split squat', { concept: 'STRENGTH', prescription: true });
    const frontRpe = semanticSeries('front-rpe', 'Front squat', { family: 'EFFORT', concept: 'EXERCISE_RPE', metric: 'rpe', effortScope: 'EXERCISE' });
    const backRpe = semanticSeries('back-rpe', 'Back squat', { family: 'EFFORT', concept: 'EXERCISE_RPE', metric: 'rpe', effortScope: 'EXERCISE' });
    const frontStrength = semanticSeries('front-e1rm', 'Front squat', { concept: 'STRENGTH', derived: true });
    expect(evaluateDiscoveryEligibility(bss, frontRpe).reason).toBe('LOW_VALUE_RPE_RELATIONSHIP');
    expect(evaluateDiscoveryEligibility(backRpe, frontStrength).reason).toBe('LOW_VALUE_RPE_RELATIONSHIP');
  });

  it('excludes training prescription and same-session training coupling', () => {
    const setsA = semanticSeries('sets-a', 'Exercise A', { family: 'TRAINING_LOAD', concept: 'TRAINING_VOLUME', prescription: true });
    const setsB = semanticSeries('sets-b', 'Exercise B', { family: 'TRAINING_LOAD', concept: 'TRAINING_VOLUME', prescription: true });
    expect(evaluateDiscoveryEligibility(setsA, setsB).reason).toBe('TRAINING_PRESCRIPTION_COUPLING');
    const sessionRpe = semanticSeries('session-rpe', 'Session', { family: 'EFFORT', concept: 'SESSION_RPE', effortScope: 'SESSION', sessionIds: ['s1', 's2'] });
    const fatigue = semanticSeries('session-fatigue', 'Session state', { family: 'EFFORT', concept: 'SESSION_FATIGUE', sessionIds: ['s1', 's2'] });
    expect(evaluateDiscoveryEligibility(sessionRpe, fatigue).reason).toBe('SAME_SESSION_TRAINING_COUPLING');
  });

  it('uses lineage for direct, shared and invertible transformations', () => {
    const time = semanticSeries('fly-time', '10 m fly', { concept: 'MAX_VELOCITY', direction: 'lower' });
    const speed = semanticSeries('fly-speed', '10 m fly', { concept: 'MAX_VELOCITY', derived: true, derivedFrom: [time.id] });
    expect(evaluateDiscoveryEligibility(time, speed).reason).toBe('DIRECT_DERIVATION');
    const load = semanticSeries('load', 'Back squat', { concept: 'STRENGTH' });
    const reps = semanticSeries('reps', 'Back squat', { family: 'TRAINING_LOAD', concept: 'TRAINING_VOLUME' });
    const e1rm = semanticSeries('e1rm', 'Back squat', { concept: 'STRENGTH', derived: true, derivedFrom: [load.id, reps.id] });
    const relative = semanticSeries('relative', 'Back squat', { concept: 'STRENGTH', derived: true, derivedFrom: [load.id, 'bodyweight'] });
    expect(evaluateDiscoveryEligibility(e1rm, relative).reason).toBe('SHARED_DERIVATION');
  });

  it('keeps high-value cross-domain hypotheses eligible in principle', () => {
    const strength = semanticSeries('squat', 'Back squat', { concept: 'STRENGTH' });
    const jump = semanticSeries('jump', 'Vertical jump', { concept: 'JUMP', direction: 'higher' });
    const fly = semanticSeries('fly', '10 m fly', { concept: 'MAX_VELOCITY', direction: 'lower' });
    const bodyweight = semanticSeries('bodyweight', 'Body metrics', { family: 'BODY_METRIC', domain: 'BODY_METRIC', concept: 'BODYWEIGHT' });
    const sprintExposure = semanticSeries('sprint-volume', 'Sprint exposure', { family: 'TRAINING_LOAD', concept: 'TRAINING_VOLUME' });
    const achilles = semanticSeries('achilles', 'Achilles morning pain', { family: 'SYMPTOM', domain: 'SYMPTOM', concept: 'ACHILLES_SYMPTOM' });
    expect(evaluateDiscoveryEligibility(strength, jump).eligible).toBe(true);
    expect(evaluateDiscoveryEligibility(jump, fly).eligible).toBe(true);
    expect(evaluateDiscoveryEligibility(bodyweight, fly).eligible).toBe(true);
    expect(evaluateDiscoveryEligibility(bodyweight, jump).eligible).toBe(true);
    expect(evaluateDiscoveryEligibility(sprintExposure, achilles).eligible).toBe(true);
  });

  it('pairs exposure to symptoms from +1 day and never calls day 0 delayed', () => {
    const exposure = semanticSeries('sprint-volume', 'Sprint exposure', { family: 'TRAINING_LOAD', concept: 'TRAINING_VOLUME', sample: values(12) });
    const symptoms = semanticSeries('achilles', 'Achilles morning pain', { family: 'SYMPTOM', domain: 'SYMPTOM', concept: 'ACHILLES_SYMPTOM', sample: values(12), dayOffset: 1, timepoint: 'Morning' });
    const result = discoverRelationshipsDetailed([exposure, symptoms]).allResults[0];
    expect(result).toMatchObject({ pairingStrategy: 'forward-lag-delayed', minimumLagDays: 1, lagLabel: '+1–3 days' });
    expect(result?.meanAbsoluteDateDifference).toBeGreaterThanOrEqual(1);
  });

  it('does not put n=7 with poor FDR into Interesting', () => {
    const strength = semanticSeries('front-5rep', 'Front squat', { concept: 'STRENGTH', sample: values(7) });
    const symptom = semanticSeries('symptom', 'Front squat symptom', { family: 'SYMPTOM', domain: 'SYMPTOM', concept: 'PATELLAR_SYMPTOM', sample: [1, 3, 2, 5, 4, 7, 6] });
    expect(discoverRelationshipsDetailed([strength, symptom]).interestingResults).toEqual([]);
  });

  it('collapses alternate metrics into one conceptual hypothesis', () => {
    const squat = semanticSeries('squat-e1rm', 'Back squat', { concept: 'STRENGTH', sample: values(15) });
    const squatFive = semanticSeries('squat-5rep', 'Back squat', { concept: 'STRENGTH', sample: values(15).map((x) => x + .1) });
    const jump = semanticSeries('jump', 'Vertical jump', { concept: 'JUMP', sample: values(15) });
    const report = discoverRelationshipsDetailed([squat, squatFive, jump]);
    expect(report.allResults).toHaveLength(2);
    expect(report.interestingResults).toHaveLength(1);
    expect(report.interestingResults[0]?.relatedAnalysisCount).toBe(2);
  });

  it('keeps excluded relationships manually selectable in Explore', () => {
    const performance = semanticSeries('front-e1rm', 'Front squat', { concept: 'STRENGTH' });
    const rpe = semanticSeries('front-rpe', 'Front squat', { family: 'EFFORT', concept: 'EXERCISE_RPE', metric: 'rpe', effortScope: 'EXERCISE' });
    expect(evaluateDiscoveryEligibility(performance, rpe).eligible).toBe(false);
    expect(analyseSeries(performance.observations, rpe.observations, 'same-day').n).toBe(15);
  });

  it('excludes static longitudinal profile series', () => {
    const height = semanticSeries('height', 'Body metrics', { family: 'BODY_METRIC', domain: 'BODY_METRIC', concept: 'HEIGHT', sample: Array(15).fill(180) });
    const jump = semanticSeries('jump', 'Vertical jump', { concept: 'JUMP' });
    expect(evaluateDiscoveryEligibility(height, jump).reason).toBe('STATIC_SERIES');
  });
});
