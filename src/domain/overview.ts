import type { StrengthPerformance } from '../data/normalized/types';

export function representativeStrengthPerformance(
  performances: readonly StrengthPerformance[],
): StrengthPerformance | undefined {
  return [...performances].sort((a, b) =>
    b.loadKg - a.loadKg ||
    b.reps - a.reps ||
    (b.date ?? '').localeCompare(a.date ?? '') ||
    b.rowNumber - a.rowNumber,
  )[0];
}

