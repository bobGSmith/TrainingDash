import { describe, expect, it } from 'vitest';
import type { SheetTab } from '../../config/athletes';
import { resolveTabTitles } from './sheetsClient';

describe('spreadsheet tab discovery', () => {
  it('prefers an exact title match', () => {
    const result = resolveTabTitles(['Data'], [' data ', 'Data']);
    expect(result.get('Data')).toBe('Data');
  });

  it('matches harmless case, whitespace, and punctuation differences', () => {
    const requested: SheetTab[] = ['Data', 'Lifting top sets', 'Full Session tracking'];
    const result = resolveTabTitles(requested, ['DATA ', 'Lifting Top Sets', 'Full-session tracking']);
    expect(Object.fromEntries(result)).toEqual({
      Data: 'DATA ',
      'Lifting top sets': 'Lifting Top Sets',
      'Full Session tracking': 'Full-session tracking',
    });
  });

  it('leaves genuinely absent tabs unresolved', () => {
    expect(resolveTabTitles(['Daily Status'], ['Data']).has('Daily Status')).toBe(false);
  });
});
