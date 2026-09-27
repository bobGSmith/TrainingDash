import { describe, expect, it } from 'vitest';
import type { JumpPerformance, SprintPerformance, StrengthPerformance } from '../data/normalized/types';
import { chronologicalPBProgression, groupByComparison, jumpPBs, liftingPBFrontier, sprintComparisonKey, sprintPBs } from './pb';

const sprint = (timeSeconds: number, rowNumber: number, extra: Partial<SprintPerformance> = {}): SprintPerformance => ({
  kind: 'sprint', tab: 'Data', test: '10 m', timeSeconds, rowNumber, date: `2026-01-${String(rowNumber).padStart(2, '0')}`, ...extra,
});
const jump = (result: number, rowNumber: number): JumpPerformance => ({ kind: 'jump', tab: 'Data', test: 'CMJ', result, rowNumber });
const lift = (loadKg: number, reps: number, rowNumber: number): StrengthPerformance => ({ kind: 'strength', tab: 'Lifting top sets', exercise: 'Back squat', sourceExercise: 'Back squat', loadKg, reps, rowNumber });

describe('performance PBs', () => {
  it('uses lower for sprinting and returns all tied PB performances', () => {
    const values = [sprint(1.8, 1), sprint(1.7, 2), sprint(1.7, 3)];
    expect(sprintPBs(values).map((item) => item.rowNumber)).toEqual([2, 3]);
  });

  it('uses higher for jumps', () => {
    expect(jumpPBs([jump(35, 1), jump(38, 2), jump(37, 3)])[0]?.result).toBe(38);
  });

  it('builds strict chronological PB progression and reports improvement', () => {
    const values = [sprint(1.7, 3), sprint(1.8, 1), sprint(1.75, 2), sprint(1.75, 4)];
    const progression = chronologicalPBProgression(values, (item) => item.timeSeconds, 'lower');
    expect(progression.map((point) => point.performance.timeSeconds)).toEqual([1.8, 1.75, 1.7]);
    expect(progression[1]?.improvement).toBeCloseTo(0.05);
  });

  it('keeps different surface, footwear, and protocols in separate groups', () => {
    const values = [
      sprint(1.8, 1, { surface: 'Track', footwear: 'Spikes', startType: '3-point' }),
      sprint(1.7, 2, { surface: 'Grass', footwear: 'Trainers', startType: '2-point' }),
    ];
    expect(groupByComparison(values, sprintComparisonKey)).toHaveLength(2);
  });
});

describe('lifting PB frontier', () => {
  it('removes dominated load-rep combinations', () => {
    const frontier = liftingPBFrontier([lift(5, 10, 1), lift(8, 15, 2)]);
    expect(frontier.map(({ loadKg, reps }) => [loadKg, reps])).toEqual([[8, 15]]);
  });

  it('keeps non-dominated trade-offs', () => {
    const frontier = liftingPBFrontier([lift(5, 20, 1), lift(8, 15, 2), lift(7, 10, 3)]);
    expect(frontier.map(({ loadKg, reps }) => [loadKg, reps])).toEqual([[5, 20], [8, 15]]);
  });
});
