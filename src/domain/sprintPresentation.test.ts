import { describe, expect, it } from 'vitest';
import type { SprintPerformance } from '../data/normalized/types';
import { formatSprintConditions, formatSprintObservationSummary, sprintObservationDetails } from './sprintPresentation';

const fly = (overrides: Partial<SprintPerformance> = {}): SprintPerformance => ({
  kind: 'sprint', tab: 'Full Session tracking', rowNumber: 42, date: '2026-09-21', test: '10 m fly',
  distanceMetres: 10, timeSeconds: 1.162, protocol: 'Max velocity', leadInMetres: 20,
  surface: 'Track', footwear: 'Trainers', session: 'Sprint', notes: 'Best of the 20 m lead-in flies.',
  rawExtra: 'Lead-in', extra: { legacy_value: 'Lead-in' }, ...overrides,
});

describe('sprint presentation', () => {
  it('formats a concise fly summary without internal, unknown, session or note text', () => {
    const summary = formatSprintObservationSummary(fly());
    expect(summary).toBe('31.0 km/h · 1.162 s over 10 m · 20 m lead-in · Track · Trainers');
    expect(summary).not.toMatch(/start unknown|Sprint|Best of|Max velocity|Lead-in · Sprint/i);
  });

  it('omits missing lead-in and footwear instead of displaying unknown placeholders', () => {
    const summary = formatSprintObservationSummary(fly({ leadInMetres: undefined, footwear: undefined }));
    expect(summary).toBe('31.0 km/h · 1.162 s over 10 m · Track');
    expect(summary).not.toMatch(/unknown/i);
  });

  it('uses test-family-aware conditions', () => {
    const start = fly({ test: '10 m start', protocol: 'Acceleration', startType: '3-point', timingMethod: 'Gates' });
    expect(formatSprintConditions(start)).toBe('3-point · 20 m lead-in · Track · Trainers · Gates');
    expect(formatSprintConditions(fly({ startType: '3-point' }))).not.toContain('3-point');
  });

  it('retains notes, raw metadata and unknown fields in the rich detail representation', () => {
    const details = sprintObservationDetails(fly());
    expect(details.notes).toBe('Best of the 20 m lead-in flies.');
    expect(details.rawExtra).toBe('Lead-in');
    expect(details.extra).toEqual({ legacy_value: 'Lead-in' });
    expect(details.startType).toBeUndefined();
    expect(details.source).toEqual({ tab: 'Full Session tracking', rowNumber: 42 });
  });
});
