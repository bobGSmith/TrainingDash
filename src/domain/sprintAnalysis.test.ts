import { describe, expect, it } from 'vitest';
import type { SprintPerformance } from '../data/normalized/types';
import { accelerationEnvelope, averageSpeedMS, compatiblePredictionModels, isExplicitSprintWarmup, metresPerSecondToKmh, protocolAwarePBs, selectPredictionInputs, speedRetention, sprintProtocolFamily, sprintProtocolKey, sprintSessionSummaries, sprintSpeedMetric, yardsToMetres, type SprintPredictionModel } from './sprintAnalysis';

const sprint = (rowNumber: number, test: string, distanceMetres: number, timeSeconds: number, overrides: Partial<SprintPerformance> = {}): SprintPerformance => ({ kind: 'sprint', tab: 'Full Session tracking', rowNumber, date: `2026-01-${String(rowNumber).padStart(2, '0')}`, test, distanceMetres, timeSeconds, protocol: 'Acceleration', ...overrides });

describe('sprint derived metrics', () => {
  it('calculates m/s and km/h from distance and time', () => {
    expect(averageSpeedMS(10, 1.162)).toBeCloseTo(8.6059, 4);
    expect(metresPerSecondToKmh(averageSpeedMS(10, 1.162))).toBeCloseTo(30.981, 3);
  });

  it('converts yards to metres', () => {
    expect(yardsToMetres(40)).toBeCloseTo(36.576, 3);
  });

  it('retains derived-variable lineage and higher-speed direction', () => {
    const metric = sprintSpeedMetric(sprint(1, '10 m fly', 10, 1.162, { protocol: 'Max velocity' }));
    expect(metric).toMatchObject({ derived: true });
    expect(metric?.derivedFrom).toHaveLength(2);
    expect(metric?.averageSpeedMS).toBeGreaterThan(sprintSpeedMetric(sprint(2, '10 m fly', 10, 1.2, { protocol: 'Max velocity' }))!.averageSpeedMS);
  });

  it('keeps protocol-aware PBs and unknown metadata separate', () => {
    const observations = [
      sprint(1, '10 m fly', 10, 1.2, { protocol: 'Max velocity', leadInMetres: 10 }),
      sprint(2, '10 m fly', 10, 1.16, { protocol: 'Max velocity', leadInMetres: 20 }),
      sprint(3, '10 m fly', 10, 1.18, { protocol: 'Max velocity' }),
    ];
    expect(protocolAwarePBs(observations)).toHaveLength(3);
    expect(new Set(observations.map((item) => sprintProtocolKey(item))).size).toBe(3);
    expect(observations[2]?.leadInMetres).toBeUndefined();
  });

  it('constructs an acceleration envelope without flying performances', () => {
    const observations = [sprint(1, '10 m start', 10, 1.7), sprint(2, '10 m start', 10, 1.6), sprint(3, '20 m start', 20, 2.9), sprint(4, '10 m fly', 10, 1.1, { protocol: 'Max velocity' })];
    const envelope = accelerationEnvelope(observations);
    expect(envelope.map((item) => [item.distanceMetres, item.timeSeconds])).toEqual([[10, 1.6], [20, 2.9]]);
    expect(sprintProtocolFamily(observations[3]!)).toBe('FLYING');
  });

  it('calculates descriptive average-speed retention with lineage', () => {
    const fly = sprint(1, '10 m fly', 10, 1.162, { protocol: 'Max velocity' });
    const race = sprint(2, '100 m', 100, 12.796, { protocol: 'Speed endurance' });
    const retention = speedRetention(race, fly);
    expect(retention?.retentionPercent).toBeCloseTo((100 / 12.796) / (10 / 1.162) * 100, 5);
    expect(retention?.derivedFrom).toHaveLength(4);
  });

  it('summarises the fastest rep, mean and sample variability for each session', () => {
    const observations = [
      sprint(1, '10 m fly', 10, 1.2, { date: '2026-09-21', session: 'Sprint' }),
      sprint(2, '10 m fly', 10, 1.1, { date: '2026-09-21', session: 'Sprint' }),
      sprint(3, '10 m fly', 10, 1.3, { date: '2026-09-21', session: 'Sprint' }),
    ];
    const summary = sprintSessionSummaries(observations)[0]!;
    expect(summary.fastestTimeSeconds).toBe(1.1);
    expect(summary.meanTimeSeconds).toBeCloseTo(1.2);
    expect(summary.timeStandardDeviation).toBeCloseTo(0.1);
    expect(summary.observations).toHaveLength(3);
  });

  it('excludes only explicitly identifiable warm-up or low-effort reps', () => {
    const observations = [
      sprint(1, '10 m fly', 10, 1.4, { date: '2026-09-21', session: 'Sprint', effortPercent: 80 }),
      sprint(2, '10 m fly', 10, 1.35, { date: '2026-09-21', session: 'Sprint', notes: 'Warm-up rep' }),
      sprint(3, '10 m fly', 10, 1.2, { date: '2026-09-21', session: 'Sprint' }),
      sprint(4, '10 m fly', 10, 1.1, { date: '2026-09-21', session: 'Sprint' }),
    ];
    expect(isExplicitSprintWarmup(observations[0]!)).toBe(true);
    expect(isExplicitSprintWarmup(observations[1]!)).toBe(true);
    expect(isExplicitSprintWarmup(observations[2]!)).toBe(false);
    const summary = sprintSessionSummaries(observations)[0]!;
    expect(summary.excludedWarmupCount).toBe(2);
    expect(summary.observations).toHaveLength(2);
    expect(summary.meanTimeSeconds).toBeCloseTo(1.15);
  });
});

describe('sprint prediction architecture', () => {
  const model: SprintPredictionModel = {
    id: 'documented-test-model', name: 'Documented test model', version: '1', description: 'Synthetic test only', source: 'Unit-test equation', limitations: 'Not for production', maximumInputAgeDays: 30,
    requiredInputs: [{ id: 'start20', family: 'ACCELERATION_START', distanceMetres: 20 }, { id: 'fly10', family: 'FLYING', distanceMetres: 10 }], compatibleProtocols: ['*'],
    predict: (inputs) => ({ estimated100mSeconds: 12, inputsUsed: inputs, modelId: 'documented-test-model', estimated: true, derivedFrom: inputs.map((input) => `${input.observation.tab}:${input.observation.rowNumber}`) }),
  };

  it('selects temporally recent required inputs and rejects incompatible sets', () => {
    const observations = [sprint(1, '20 m start', 20, 2.9, { date: '2026-01-10' }), sprint(2, '10 m fly', 10, 1.16, { date: '2026-01-11', protocol: 'Max velocity' })];
    expect(selectPredictionInputs(model, observations, '2026-01-12')).toHaveLength(2);
    expect(selectPredictionInputs(model, observations, '2026-03-01')).toBeUndefined();
    expect(compatiblePredictionModels(observations, '2026-01-12', [model])).toHaveLength(1);
    expect(selectPredictionInputs({ ...model, compatibleProtocols: ['Blocks'] }, observations, '2026-01-12')).toBeUndefined();
  });

  it('marks predictions as estimated and never includes them in actual PB input types', () => {
    const inputs = selectPredictionInputs(model, [sprint(1, '20 m start', 20, 2.9), sprint(2, '10 m fly', 10, 1.16, { protocol: 'Max velocity' })], '2026-01-10')!;
    const prediction = model.predict(inputs);
    expect(prediction.estimated).toBe(true);
    expect(prediction.modelId).toBe(model.id);
  });
});
