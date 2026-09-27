export type LookbackWindow = 30 | 90 | 'all';

export function latestRecordedDate(items: readonly { date?: string }[]): string | undefined {
  return items.map((item) => item.date).filter((date): date is string => Boolean(date)).sort().at(-1);
}

export function withinLookback<T extends { date?: string }>(
  items: readonly T[],
  window: LookbackWindow,
  anchorDate?: string,
): T[] {
  if (window === 'all') return [...items];
  const anchor = anchorDate ?? latestRecordedDate(items);
  if (!anchor) return [];
  const cutoff = new Date(`${anchor}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (window - 1));
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return items.filter((item) => item.date != null && item.date >= cutoffDate && item.date <= anchor);
}

