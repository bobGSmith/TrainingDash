import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '../data/normalized/types';
import { bestActualPerformance, estimate1RM, estimatedOneRepMaxObservations, estimateCurrentStrength, MAX_E1RM_REPS, repSpecificProgression, strengthSetObservations, strengthStateProgression } from './strength';

const row = (rowNumber: number, date: string, load: number | undefined, reps: number | undefined, overrides: Partial<TrainingSession> = {}): TrainingSession => ({ kind: 'training', tab: 'Full Session tracking', rowNumber, date, session: 'Lift', category: 'Strength', exercise: 'Back squat', sets: 1, amount: reps, amountUnit: 'reps', intensity: load, intensityUnit: 'kg', ...overrides });

describe('strength modelling', () => {
  it('calculates Epley e1RM in one reusable function', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.6667, 4);
  });

  it('rejects invalid or missing load and reps', () => {
    expect(estimate1RM(undefined, 5)).toBeUndefined();
    expect(estimate1RM(100, undefined)).toBeUndefined();
    expect(estimate1RM(0, 5)).toBeUndefined();
    expect(estimate1RM(100, 0)).toBeUndefined();
    expect(strengthSetObservations([row(1, '2026-01-01', undefined, 5), row(2, '2026-01-02', 100, undefined)])).toEqual([]);
  });

  it('retains high-rep actual work but excludes it from e1RM', () => {
    const observations = strengthSetObservations([row(1, '2026-01-01', 70, MAX_E1RM_REPS + 1)]);
    expect(observations).toHaveLength(1);
    expect(estimatedOneRepMaxObservations(observations)).toEqual([]);
  });

  it('keeps lower submaximal sets from collapsing the rolling upper estimate', () => {
    const observations = estimatedOneRepMaxObservations(strengthSetObservations([
      row(1, '2026-01-01', 100, 5), row(2, '2026-01-15', 105, 5), row(3, '2026-02-01', 90, 5), row(4, '2026-02-15', 110, 5),
    ]));
    const progression = strengthStateProgression(observations, { windowDays: 45 });
    expect(progression.find((item) => item.date === '2026-02-01')?.estimatedStrengthKg).toBeCloseTo((116.6667 + 122.5) / 2, 3);
    expect(progression.at(-1)?.estimatedStrengthKg).toBeCloseTo((128.3333 + 122.5) / 2, 3);
  });

  it('includes the rolling-window boundary and supports sparse observations', () => {
    const observations = estimatedOneRepMaxObservations(strengthSetObservations([row(1, '2026-01-01', 100, 5)]));
    expect(estimateCurrentStrength(observations, '2026-02-15', { windowDays: 45 })?.estimatedStrengthKg).toBeCloseTo(116.6667, 3);
    expect(estimateCurrentStrength(observations, '2026-02-16', { windowDays: 45 })).toBeUndefined();
  });

  it('handles multiple observations on one date and different rep counts', () => {
    const observations = estimatedOneRepMaxObservations(strengthSetObservations([row(1, '2026-01-01', 120, 1), row(2, '2026-01-01', 100, 5)]));
    expect(observations).toHaveLength(2);
    expect(estimateCurrentStrength(observations, '2026-01-01')?.contributingObservationIds).toHaveLength(2);
  });

  it('selects a best actual recorded performance without manufacturing values', () => {
    const observations = strengthSetObservations([row(1, '2026-01-01', 100, 5), row(2, '2026-02-01', 110, 3), row(3, '2026-03-01', 90, 10)]);
    expect(bestActualPerformance(observations)).toMatchObject({ loadKg: 110, reps: 3 });
  });

  it('builds chronological rep-specific load PBs without interpolation', () => {
    const observations = strengthSetObservations([row(1, '2026-01-01', 100, 5), row(2, '2026-01-15', 105, 5), row(3, '2026-02-01', 90, 5), row(4, '2026-02-15', 110, 5), row(5, '2026-02-20', 120, 3)]);
    expect(repSpecificProgression(observations, 5).map((item) => item.loadKg)).toEqual([100, 105, 110]);
  });

  it('preserves missing RPE and historical dates', () => {
    const [observation] = strengthSetObservations([row(1, '2025-02-14', 100, 5)]);
    expect(observation?.rpe).toBeUndefined();
    expect(observation?.date).toBe('2025-02-14');
  });
});
