import { describe, expect, it } from 'vitest';
import { normaliseExerciseName } from './aliases';
import { optionalNumber, parseDate, parseExtra } from './parsers';
import { normalizeWorkbook } from './normalize';
import type { RawWorkbook } from '../raw/types';
import { SHEET_TABS } from '../../config/athletes';

function workbook(overrides: Partial<Record<(typeof SHEET_TABS)[number], string[][]>>): RawWorkbook {
  return Object.fromEntries(SHEET_TABS.map((tab) => [tab, {
    tab, range: tab, majorDimension: 'ROWS', rows: overrides[tab] ?? [], fetchedAt: '2026-01-01T00:00:00Z',
  }])) as RawWorkbook;
}

describe('primitive parsers', () => {
  it('keeps missing and invalid numbers missing instead of converting them to zero', () => {
    expect(optionalNumber('')).toBeUndefined();
    expect(optionalNumber('not recorded')).toBeUndefined();
    expect(optionalNumber('0')).toBe(0);
    expect(optionalNumber('1,250 kg')).toBe(1250);
  });

  it('parses supported dates without silently accepting impossible dates', () => {
    expect(parseDate('26/09/2026')).toBe('2026-09-26');
    expect(parseDate('2026-09-26')).toBe('2026-09-26');
    expect(parseDate('31/02/2026')).toBeUndefined();
  });

  it('accepts object JSON and safely ignores malformed or scalar Extra values', () => {
    expect(parseExtra('{"pain": 3}')).toEqual({ pain: 3 });
    expect(parseExtra('{legacy')).toBeUndefined();
    expect(parseExtra('4')).toBeUndefined();
  });
});

describe('normalisation', () => {
  it('normalises aliases non-destructively', () => {
    expect(normaliseExerciseName('Backsquat')).toBe('Back squat');
    expect(normaliseExerciseName('BSS')).toBe('Bulgarian split squat');
  });

  it('preserves raw malformed Extra while leaving parsed metadata missing', () => {
    const result = normalizeWorkbook(workbook({
      'Full Session tracking': [
        ['Date', 'Session', 'Category', 'Exercise', 'Sets', 'Amount', 'Amount Unit', 'Intensity', 'Intensity Unit', 'Surface', 'Footwear', 'Extra', 'Symptoms', 'Notes'],
        ['26/09/2026', 'PM', 'Sprint', 'Acceleration', '4', '10', 'm', '', '', '', '', '{legacy', '', ''],
      ],
    }));
    expect(result.training[0]).toMatchObject({ date: '2026-09-26', sets: 4, amount: 10, rawExtra: '{legacy' });
    expect(result.training[0]?.extra).toBeUndefined();
    expect(result.training[0]?.intensity).toBeUndefined();
  });

  it('does not treat Program rows as performed training', () => {
    const result = normalizeWorkbook(workbook({ Program: [['Date', 'Exercise'], ['26/09/2026', 'Squat']] }));
    expect(result.training).toEqual([]);
  });

  it('derives sprint, jump, and strength performances from canonical session rows', () => {
    const result = normalizeWorkbook(workbook({
      'Full Session tracking': [
        ['Date', 'Session', 'Category', 'Exercise', 'Sets', 'Amount', 'Amount Unit', 'Intensity', 'Intensity Unit', 'Surface', 'Footwear', 'Extra', 'Symptoms', 'Notes', 'Timing start', 'Lead-in (m)', 'Stance', 'Effort (%)'],
        ['01/09/2026', 'Sprint', 'Acceleration', '10 m start', '2', '10', 'm', '1.75', 's', 'Track', 'Spikes', '', '', '', 'Lead-in', '1', '3-point', '100'],
        ['02/09/2026', 'Sprint', 'Plyometric', 'Standing broad jump', '1', '1', 'attempt', '2.8', 'm', 'Gym', 'Trainers'],
        ['03/09/2026', 'A', 'Strength', 'Backsquat', '1', '5', 'reps', '120', 'kg', '', '', 'RPE 8; Velocity 1.2 m/s'],
      ],
    }));
    expect(result.sprints[0]).toMatchObject({ timeSeconds: 1.75, distanceMetres: 10, surface: 'Track', leadInMetres: 1, startType: '3-point' });
    expect(result.jumps[0]).toMatchObject({ result: 2.8, footwear: 'Trainers' });
    expect(result.strength[0]).toMatchObject({ exercise: 'Back squat', sourceExercise: 'Backsquat', loadKg: 120, reps: 5, rpe: 8, velocityMps: 1.2 });
  });
});
