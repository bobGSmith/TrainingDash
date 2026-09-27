import type { JumpPerformance, SprintPerformance, StrengthPerformance } from '../data/normalized/types';

export type BetterDirection = 'lower' | 'higher';

export interface ProgressionPoint<T> {
  performance: T;
  previousBest?: number;
  improvement?: number;
}

function chronological<T extends { date?: string; rowNumber: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || a.rowNumber - b.rowNumber;
    if (a.date) return -1;
    if (b.date) return 1;
    return a.rowNumber - b.rowNumber;
  });
}

export function bestPerformances<T>(
  performances: readonly T[],
  value: (performance: T) => number,
  direction: BetterDirection,
): T[] {
  if (performances.length === 0) return [];
  const best = Math[direction === 'lower' ? 'min' : 'max'](...performances.map(value));
  return performances.filter((performance) => value(performance) === best);
}

export function sprintPBs(performances: readonly SprintPerformance[]): SprintPerformance[] {
  return bestPerformances(performances, (performance) => performance.timeSeconds, 'lower');
}

export function jumpPBs(performances: readonly JumpPerformance[]): JumpPerformance[] {
  return bestPerformances(performances, (performance) => performance.result, 'higher');
}

export function chronologicalPBProgression<T extends { date?: string; rowNumber: number }>(
  performances: readonly T[],
  value: (performance: T) => number,
  direction: BetterDirection,
): ProgressionPoint<T>[] {
  let best: number | undefined;
  const progression: ProgressionPoint<T>[] = [];
  for (const performance of chronological(performances)) {
    const result = value(performance);
    const improves = best == null || (direction === 'lower' ? result < best : result > best);
    if (!improves) continue;
    progression.push({
      performance,
      previousBest: best,
      improvement: best == null ? undefined : direction === 'lower' ? best - result : result - best,
    });
    best = result;
  }
  return progression;
}

export function sprintComparisonKey(performance: SprintPerformance): string {
  return [
    performance.test,
    performance.distanceMetres,
    performance.startType,
    performance.leadInMetres,
    performance.surface,
    performance.footwear,
    performance.timingMethod,
    performance.protocol,
  ].map((value) => value ?? 'unknown').join('|').toLowerCase();
}

export function jumpComparisonKey(performance: JumpPerformance): string {
  return [performance.test, performance.unit, performance.surface, performance.footwear, performance.protocol]
    .map((value) => value ?? 'unknown')
    .join('|')
    .toLowerCase();
}

export function groupByComparison<T>(
  performances: readonly T[],
  key: (performance: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const performance of performances) {
    const id = key(performance);
    groups.set(id, [...(groups.get(id) ?? []), performance]);
  }
  return groups;
}

export function liftingPBFrontier(
  performances: readonly StrengthPerformance[],
): StrengthPerformance[] {
  return performances.filter((candidate) => !performances.some((other) =>
    other !== candidate &&
    other.loadKg >= candidate.loadKg &&
    other.reps >= candidate.reps &&
    (other.loadKg > candidate.loadKg || other.reps > candidate.reps),
  )).sort((a, b) => a.loadKg - b.loadKg || b.reps - a.reps);
}

