import { describe, expect, it } from 'vitest';
import type { StrengthPerformance } from '../data/normalized/types';
import { representativeStrengthPerformance } from './overview';

const set = (loadKg: number, reps: number, date: string, rowNumber: number): StrengthPerformance => ({
  kind: 'strength', tab: 'Full Session tracking', exercise: 'Back squat', sourceExercise: 'Back squat', loadKg, reps, date, rowNumber,
});

describe('overview strength cards', () => {
  it('uses the latest observation when the best load and reps are tied', () => {
    const best = representativeStrengthPerformance([
      set(90, 5, '2026-08-28', 1),
      set(90, 5, '2026-09-11', 2),
      set(90, 5, '2026-09-25', 3),
      set(80, 8, '2026-09-26', 4),
    ]);
    expect(best?.date).toBe('2026-09-25');
    expect(best).toMatchObject({ loadKg: 90, reps: 5 });
  });
});
