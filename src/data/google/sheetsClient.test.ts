import { describe, expect, it } from 'vitest';
import type { SheetTab } from '../../config/athletes';
import { resolveTabTitles } from './sheetsClient';

describe('spreadsheet tab discovery', () => {
  it('prefers an exact title match', () => {
    const result = resolveTabTitles(['Daily Status'], [' daily status ', 'Daily Status']);
    expect(result.get('Daily Status')).toBe('Daily Status');
  });

  it('matches harmless case, whitespace, and punctuation differences', () => {
    const requested: SheetTab[] = ['Daily Status', 'Lifting PBs', 'Full Session tracking'];
    const result = resolveTabTitles(requested, ['DAILY STATUS ', 'Lifting-PBs', 'Full-session tracking']);
    expect(Object.fromEntries(result)).toEqual({
      'Daily Status': 'DAILY STATUS ',
      'Lifting PBs': 'Lifting-PBs',
      'Full Session tracking': 'Full-session tracking',
    });
  });

  it('leaves genuinely absent tabs unresolved', () => {
    expect(resolveTabTitles(['Daily Status'], ['Program']).has('Daily Status')).toBe(false);
  });
});
