import type { TrainingSession } from '../data/normalized/types';
import { normaliseExerciseName } from '../data/normalized/aliases';

export type CurveDirection = 'higher' | 'lower';
export type CurveKind = 'strength-frontier' | 'best-by-amount';

export interface PerformanceCurvePoint {
  amount: number;
  intensity: number;
  amountUnit: string;
  intensityUnit: string;
  observation: TrainingSession;
}

export interface PerformanceCurveData {
  exercise: string;
  amountUnit: string;
  intensityUnit: string;
  direction: CurveDirection;
  kind: CurveKind;
  observations: PerformanceCurvePoint[];
  frontier: PerformanceCurvePoint[];
}

export function performanceCurveCompatibility(row: TrainingSession): { direction: CurveDirection; kind: CurveKind } | undefined {
  const amountUnit = row.amountUnit?.toLowerCase();
  const intensityUnit = row.intensityUnit?.toLowerCase();
  if (amountUnit === 'reps' && intensityUnit === 'kg' && row.intensity != null && row.intensity > 0) {
    return { direction: 'higher', kind: 'strength-frontier' };
  }
  if (['acceleration', 'max velocity', 'speed endurance'].includes(row.category?.toLowerCase() ?? '') && ['m', 'yd'].includes(amountUnit ?? '') && intensityUnit === 's') {
    return { direction: 'lower', kind: 'best-by-amount' };
  }
  return undefined;
}

function canonicalAmount(row: TrainingSession): number | undefined {
  if (row.amount == null) return undefined;
  return row.amountUnit?.toLowerCase() === 'yd' ? row.amount * 0.9144 : row.amount;
}

export function buildPerformanceCurve(rows: readonly TrainingSession[], exercise: string): PerformanceCurveData | undefined {
  const compatible = rows.filter((row) => row.exercise && normaliseExerciseName(row.exercise) === exercise && row.amount != null && row.intensity != null && performanceCurveCompatibility(row));
  const first = compatible[0];
  if (!first || !first.amountUnit || !first.intensityUnit) return undefined;
  const rule = performanceCurveCompatibility(first)!;
  const observations = compatible.flatMap((row) => {
    const amount = canonicalAmount(row);
    return amount == null || row.intensity == null ? [] : [{ amount, intensity: row.intensity, amountUnit: row.amountUnit!, intensityUnit: row.intensityUnit!, observation: row }];
  });
  const frontier = rule.kind === 'strength-frontier'
    ? observations.filter((candidate) => !observations.some((other) => other !== candidate && other.amount >= candidate.amount && other.intensity >= candidate.intensity && (other.amount > candidate.amount || other.intensity > candidate.intensity)))
    : [...new Map(observations.sort((a, b) => rule.direction === 'lower' ? b.intensity - a.intensity : a.intensity - b.intensity).map((point) => [point.amount, point])).values()];
  frontier.sort((a, b) => a.amount - b.amount);
  return { exercise, amountUnit: first.amountUnit.toLowerCase() === 'yd' ? 'm' : first.amountUnit, intensityUnit: first.intensityUnit, ...rule, observations, frontier };
}

export function compatibleCurveExercises(rows: readonly TrainingSession[]): string[] {
  return [...new Set(rows.filter((row) => row.exercise && performanceCurveCompatibility(row)).map((row) => normaliseExerciseName(row.exercise!)))].sort();
}
