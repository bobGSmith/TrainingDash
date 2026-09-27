import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '../data/normalized/types';
import { buildPerformanceCurve, performanceCurveCompatibility } from './performanceCurve';

const row = (exercise: string, amount: number, intensity: number, overrides: Partial<TrainingSession> = {}): TrainingSession => ({
  kind: 'training', tab: 'Full Session tracking', rowNumber: 2, category: 'Strength', exercise, amount, amountUnit: 'reps', intensity, intensityUnit: 'kg', ...overrides,
});

describe('generic performance curves', () => {
  it('builds the demonstrated strength frontier independently of React', () => {
    const curve = buildPerformanceCurve([row('Back squat', 1, 120), row('Back squat', 5, 110), row('Back squat', 5, 80), row('Back squat', 8, 90), row('Back squat', 20, 70)], 'Back squat');
    expect(curve?.frontier.map((point) => [point.amount, point.intensity])).toEqual([[1, 120], [5, 110], [8, 90], [20, 70]]);
  });

  it('converts yards for running x-position while preserving source units', () => {
    const curve = buildPerformanceCurve([row('40 yd', 40, 4.8, { category: 'Acceleration', amountUnit: 'yd', intensityUnit: 's' })], '40 yd');
    expect(curve?.frontier[0]?.amount).toBeCloseTo(36.576);
    expect(curve?.frontier[0]?.amountUnit).toBe('yd');
  });

  it('rejects attempt-by-distance jump curves', () => {
    expect(performanceCurveCompatibility(row('Standing broad', 1, 2.86, { category: 'Plyometric', amountUnit: 'attempt', intensityUnit: 'm' }))).toBeUndefined();
  });
});
