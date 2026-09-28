import { describe, expect, it } from 'vitest';
import type { RawWorkbook } from '../data/raw/types';
import { SHEET_TABS } from '../config/athletes';
import { normalizeWorkbook } from '../data/normalized/normalize';
import { sprintPBs } from './pb';
import { filterSprintPerformances } from './sprint';

function workbook(rows: string[][]): RawWorkbook {
  return Object.fromEntries(SHEET_TABS.map((tab) => [tab, {
    tab, range: tab, majorDimension: 'ROWS', rows: tab === 'Full Session tracking' ? rows : [], fetchedAt: '2026-09-28T00:00:00Z',
  }])) as RawWorkbook;
}

const header = ['Date', 'Session', 'Category', 'Exercise', 'Sets', 'Amount', 'Amount Unit', 'Intensity', 'Intensity Unit', 'Surface', 'Footwear', 'Extra', 'Symptoms', 'Notes', 'Timing start', 'Lead-in (m)', 'Stance', 'Effort (%)'];
const fly = (date: string, time: string, footwear: string, leadIn = '') => [date, 'Sprint', 'Max velocity', '10 m fly', '1', '10', 'm', time, 's', 'Track', footwear, '', '', '', leadIn ? 'Lead-in' : '', leadIn];

describe('10 m fly regression', () => {
  const normalized = normalizeWorkbook(workbook([
    header,
    fly('2026-07-27', '1.171', 'Spikes', '20'),
    fly('2026-09-21', '1.248', 'Trainers', '10'),
    fly('2026-09-21', '1.182', 'Trainers', '20'),
    [...fly('2026-09-21', '1.162', 'Trainers', '20').slice(0, 13), 'Best of the 20 m lead-in flies.', 'Lead-in', '20'],
  ]));

  it('retains same-date, same-test, same-distance performances with different times', () => {
    expect(normalized.sprints).toHaveLength(4);
    expect(normalized.sprints.filter((item) => item.date === '2026-09-21').map((item) => item.timeSeconds)).toEqual([1.248, 1.182, 1.162]);
  });

  it('returns 1.162 as the unrestricted PB and keeps all points for the chart', () => {
    const filtered = filterSprintPerformances(normalized.sprints, { test: '10 m fly', surface: 'All', footwear: 'All' });
    expect(filtered).toHaveLength(4);
    expect(sprintPBs(filtered)[0]?.timeSeconds).toBe(1.162);
  });

  it('retains a valid performance with unknown lead-in in All but not in a known 20 m filter', () => {
    const unknown = normalizeWorkbook(workbook([header, fly('2026-09-22', '1.19', 'Trainers')]));
    expect(filterSprintPerformances(unknown.sprints, { test: '10 m fly' })).toHaveLength(1);
    expect(filterSprintPerformances(unknown.sprints, { test: '10 m fly', leadInMetres: 20 })).toHaveLength(0);
    expect(filterSprintPerformances(unknown.sprints, { test: '10 m fly', leadInMetres: 'unknown' })).toHaveLength(1);
  });

  it('filters surface, footwear, start and timing without treating unknown as a match', () => {
    const rows = normalizeWorkbook(workbook([header, [...fly('2026-09-22', '1.19', 'Trainers', '20').slice(0, 16), '3-point'], ['2026-09-23', 'Sprint', 'Acceleration', '10 m start', '1', '10', 'm', '1.6', 's', 'Grass', 'Spikes', '', '', '', 'Gates', '1', '3-point']]));
    expect(filterSprintPerformances(rows.sprints, { surface: 'Grass', footwear: 'Spikes', startType: '3-point', timingMethod: 'Gates' })).toHaveLength(1);
    expect(filterSprintPerformances(rows.sprints, { timingMethod: 'Unknown' }).every((item) => item.timingMethod == null)).toBe(true);
  });
});
