import { describe, expect, it } from 'vitest';
import type { NormalizedWorkbook, TrainingSession } from '../data/normalized/types';
import { buildAnalysisVariables } from './analysisVariables';

const base = (overrides: Partial<TrainingSession>): TrainingSession => ({ kind: 'training', tab: 'Full Session tracking', rowNumber: 2, date: '2026-01-01', exercise: 'Test', ...overrides });
const workbook = (training: TrainingSession[]): NormalizedWorkbook => ({ training, sprints: [], jumps: [], strength: [], dailyStatus: [] });

describe('numeric series registry', () => {
  it('marks timed sprint intensity as lower-is-better', () => {
    const registry = buildAnalysisVariables(workbook([base({ category: 'Max velocity', exercise: '10 m fly', amount: 10, amountUnit: 'm', intensity: 1.2, intensityUnit: 's' })]));
    const time = registry.find((item) => item.metric === 'intensity');
    expect(time?.higherIsBetter).toBe(false);
    expect(time?.metadata.category).toBe('Sprint');
  });

  it('keeps explicitly incompatible measurement protocols in separate series', () => {
    const registry = buildAnalysisVariables(workbook([
      base({ rowNumber: 2, category: 'Max velocity', exercise: '10 m fly', amount: 10, amountUnit: 'm', intensity: 1.2, intensityUnit: 's', leadInMetres: 10 }),
      base({ rowNumber: 3, category: 'Max velocity', exercise: '10 m fly', amount: 10, amountUnit: 'm', intensity: 1.1, intensityUnit: 's', leadInMetres: 20 }),
    ]));
    const times = registry.filter((item) => item.metric === 'intensity');
    expect(times).toHaveLength(2);
    expect(times.map((item) => item.metadata.protocol)).toEqual(['Max velocity · 10m lead-in', 'Max velocity · 20m lead-in']);
  });

  it('extracts repeated numeric Extra values without turning missing Extra into zero', () => {
    const registry = buildAnalysisVariables(workbook([
      base({ rowNumber: 2, extra: { bodyweight_kg: 80 } }),
      base({ rowNumber: 3, date: '2026-01-02' }),
      base({ rowNumber: 4, date: '2026-01-03', extra: { bodyweight_kg: 81 } }),
    ]));
    const bodyweight = registry.find((item) => item.id === 'body-metric::bodyweight_kg');
    expect(bodyweight?.observations.map((item) => item.value)).toEqual([80, 81]);
    expect(bodyweight?.observations).toHaveLength(2);
  });

  it('preserves Daily Status morning semantics and creates longitudinal body metrics', () => {
    const data = workbook([base({ rowNumber: 2, date: '2026-01-01', extra: { bodyweight_kg: 80 } }), base({ rowNumber: 3, date: '2026-01-10', extra: { bodyweight_kg: 81 } })]);
    data.dailyStatus = [
      { kind: 'daily-status', tab: 'Daily Status', rowNumber: 2, date: '2026-01-02', timepoint: 'Morning', extra: { tendon_pain: 2 } },
      { kind: 'daily-status', tab: 'Daily Status', rowNumber: 3, date: '2026-01-03', timepoint: 'Morning', extra: { tendon_pain: 3 } },
    ];
    const registry = buildAnalysisVariables(data);
    expect(registry.find((item) => item.id === 'daily-status::tendon_pain::Morning')?.metadata.timepoint).toBe('Morning');
    expect(registry.find((item) => item.id === 'body-metric::bodyweight_kg')?.observations.map((item) => item.value)).toEqual([80, 81]);
  });
});
