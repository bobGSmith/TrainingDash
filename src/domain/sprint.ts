import type { SprintPerformance } from '../data/normalized/types';

export interface SprintFilters {
  test?: string;
  surface?: string;
  footwear?: string;
  leadInMetres?: number | 'unknown';
  startType?: string;
  timingMethod?: string;
}

export function filterSprintPerformances(
  performances: readonly SprintPerformance[],
  filters: SprintFilters,
): SprintPerformance[] {
  return performances.filter((performance) => {
    if (filters.test && performance.test !== filters.test) return false;
    if (filters.surface && filters.surface !== 'All' && performance.surface !== filters.surface) return false;
    if (filters.footwear && filters.footwear !== 'All' && performance.footwear !== filters.footwear) return false;
    if (filters.leadInMetres === 'unknown' && performance.leadInMetres != null) return false;
    if (typeof filters.leadInMetres === 'number' && performance.leadInMetres !== filters.leadInMetres) return false;
    if (filters.startType && filters.startType !== 'All' && (filters.startType === 'Unknown' ? performance.startType != null : performance.startType !== filters.startType)) return false;
    if (filters.timingMethod && filters.timingMethod !== 'All' && (filters.timingMethod === 'Unknown' ? performance.timingMethod != null : performance.timingMethod !== filters.timingMethod)) return false;
    return true;
  });
}
