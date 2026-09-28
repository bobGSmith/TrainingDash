import type { NormalizedWorkbook, TrainingSession } from '../data/normalized/types';
import type { SeriesObservation } from './analysis';

export interface AnalysisVariable {
  id: string;
  exercise: string;
  metric: string;
  label: string;
  unit?: string;
  direction: 'higher' | 'lower' | 'neutral';
  series: SeriesObservation[];
  derived?: boolean;
}

function context(row: TrainingSession): string {
  return [row.category, row.surface, row.footwear, row.leadInMetres != null ? `${row.leadInMetres}m lead-in` : undefined, row.rawExtra, row.symptoms, row.notes].filter(Boolean).join(' · ');
}

function point(row: TrainingSession, value: number, label: string, unit?: string, direction: AnalysisVariable['direction'] = 'neutral'): SeriesObservation | undefined {
  if (!row.date || !Number.isFinite(value)) return undefined;
  return { id: `${row.tab}:${row.rowNumber}:${label}`, date: row.date, value, label: row.exercise ?? label, unit, direction, context: context(row) };
}

function legacyNumber(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text ? pattern.exec(text) : undefined;
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function variable(exercise: string, metric: string, label: string, unit: string | undefined, direction: AnalysisVariable['direction'], series: Array<SeriesObservation | undefined>, derived = false): AnalysisVariable | undefined {
  const valid = series.filter((item): item is SeriesObservation => Boolean(item));
  return valid.length ? { id: `${exercise}::${metric}`, exercise, metric, label, unit, direction, series: valid, derived } : undefined;
}

function intensityDirection(rows: readonly TrainingSession[]): 'higher' | 'lower' {
  return rows.some((row) => row.intensityUnit?.toLowerCase() === 's' && ['acceleration', 'max velocity', 'speed endurance'].includes(row.category?.toLowerCase() ?? '')) ? 'lower' : 'higher';
}

function pbSeries(rows: readonly TrainingSession[], direction: 'higher' | 'lower'): SeriesObservation[] {
  let best: number | undefined;
  return [...rows].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.rowNumber - b.rowNumber).flatMap((row) => {
    if (row.intensity == null) return [];
    const improved = best == null || (direction === 'higher' ? row.intensity > best : row.intensity < best);
    if (!improved) return [];
    best = row.intensity;
    const result = point(row, row.intensity, 'PB', row.intensityUnit, direction);
    return result ? [result] : [];
  });
}

export function buildAnalysisVariables(data: NormalizedWorkbook): AnalysisVariable[] {
  const result: AnalysisVariable[] = [];
  const exercises = [...new Set(data.training.map((row) => row.exercise).filter((name): name is string => Boolean(name)))].sort();

  for (const exercise of exercises) {
    const rows = data.training.filter((row) => row.exercise === exercise && row.date);
    const direction = intensityDirection(rows);
    const candidates: Array<AnalysisVariable | undefined> = [
      variable(exercise, 'amount', 'Amount', rows.find((row) => row.amountUnit)?.amountUnit, 'neutral', rows.map((row) => row.amount == null ? undefined : point(row, row.amount, 'Amount', row.amountUnit))),
      variable(exercise, 'intensity', 'Intensity', rows.find((row) => row.intensityUnit)?.intensityUnit, direction, rows.map((row) => row.intensity == null ? undefined : point(row, row.intensity, 'Intensity', row.intensityUnit, direction))),
      variable(exercise, 'sets', 'Sets', 'sets', 'neutral', rows.map((row) => row.sets == null ? undefined : point(row, row.sets, 'Sets', 'sets'))),
    ];

    const measured = rows.filter((row) => row.intensity != null);
    if (measured.length) candidates.push(variable(exercise, 'pb', 'PB / best intensity', measured[0]?.intensityUnit, direction, pbSeries(measured, direction), true));

    const strengthRows = rows.filter((row) => row.amountUnit?.toLowerCase() === 'reps' && row.intensityUnit?.toLowerCase() === 'kg' && row.amount != null && row.intensity != null);
    for (const reps of [...new Set(strengthRows.map((row) => row.amount!))].sort((a, b) => a - b)) {
      candidates.push(variable(exercise, `load-${reps}-reps`, `${reps}-rep load`, 'kg', 'higher', strengthRows.filter((row) => row.amount === reps).map((row) => point(row, row.intensity!, `${reps}-rep load`, 'kg', 'higher'))));
    }
    candidates.push(variable(exercise, 'estimated-1rm', 'Estimated 1RM (Epley)', 'kg', 'higher', strengthRows.map((row) => point(row, row.intensity! * (1 + row.amount! / 30), 'Estimated 1RM', 'kg', 'higher')), true));
    candidates.push(variable(exercise, 'session-volume', 'Session volume', 'kg·reps', 'higher', strengthRows.map((row) => row.sets == null ? undefined : point(row, row.sets * row.amount! * row.intensity!, 'Session volume', 'kg·reps', 'higher')), true));

    const rpe = rows.map((row) => {
      const value = typeof row.extra?.rpe === 'number' ? row.extra.rpe : legacyNumber(row.rawExtra, /\bRPE\s*([0-9]+(?:\.[0-9]+)?)/i);
      return value == null ? undefined : point(row, value, 'RPE', 'RPE');
    });
    candidates.push(variable(exercise, 'rpe', 'RPE', 'RPE', 'neutral', rpe));

    const bestVelocity = rows.map((row) => {
      const metadata = row.extra?.best_velocity_ms ?? row.extra?.rep_velocity_ms;
      const value = typeof metadata === 'number' ? metadata : legacyNumber(row.rawExtra, /\bVelocity\s*([0-9]+(?:\.[0-9]+)?)\s*m\/s/i);
      return value == null ? undefined : point(row, value, 'Best velocity', 'm/s', 'higher');
    });
    candidates.push(variable(exercise, 'best-velocity', 'Best velocity', 'm/s', 'higher', bestVelocity));

    const numericKeys = [...new Set(rows.flatMap((row) => Object.entries(row.extra ?? {}).filter(([, value]) => typeof value === 'number').map(([key]) => key)))];
    for (const key of numericKeys) {
      if (['rpe', 'best_velocity_ms', 'rep_velocity_ms'].includes(key)) continue;
      candidates.push(variable(exercise, `extra-${key}`, key.replaceAll('_', ' '), undefined, 'neutral', rows.map((row) => typeof row.extra?.[key] === 'number' ? point(row, row.extra[key] as number, key) : undefined)));
    }
    result.push(...candidates.filter((item): item is AnalysisVariable => Boolean(item)));
  }

  const dailyKeys = [...new Set(data.dailyStatus.flatMap((row) => Object.entries(row.extra ?? {}).filter(([, value]) => typeof value === 'number').map(([key]) => key)))];
  for (const key of dailyKeys) {
    const series = data.dailyStatus.flatMap((row) => {
      const value = row.extra?.[key];
      return typeof value === 'number' && row.date ? [{ id: `${row.tab}:${row.rowNumber}:${key}`, date: row.date, value, label: row.context ?? 'Daily Status', direction: 'neutral' as const, context: [row.timepoint, row.context, row.notes].filter(Boolean).join(' · ') }] : [];
    });
    result.push({ id: `Daily Status::${key}`, exercise: 'Daily Status', metric: key, label: key.replaceAll('_', ' '), direction: 'neutral', series });
  }
  return result;
}
