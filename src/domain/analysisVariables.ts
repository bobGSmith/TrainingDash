import type { NormalizedWorkbook, TrainingSession } from '../data/normalized/types';
import type { SeriesObservation } from './analysis';

export interface NumericSeries {
  id: string;
  exercise: string;
  metric: string;
  variable: string;
  label: string;
  source: 'Full Session tracking' | 'Daily Status';
  unit?: string;
  direction: 'higher' | 'lower' | 'neutral';
  higherIsBetter?: boolean;
  observations: SeriesObservation[];
  series: SeriesObservation[];
  derived?: boolean;
  discoveryEligible?: boolean;
  metricFamily: MetricFamily;
  derivedFrom: string[];
  sourceObservationIds: string[];
  conceptId: string;
  metadata: { category: 'Sprint' | 'Jump' | 'Strength' | 'Recovery' | 'Training'; protocol?: string; amountUnit?: string; intensityUnit?: string; exerciseConcept: string };
}
export type AnalysisVariable = NumericSeries;
export type MetricFamily = 'PERFORMANCE' | 'EFFORT' | 'SYMPTOM' | 'VOLUME' | 'RECOVERY' | 'BODY_METRIC' | 'CONTEXT';

function context(row: TrainingSession): string {
  return [row.category, row.surface, row.footwear, row.leadInMetres != null ? `${row.leadInMetres}m lead-in` : undefined, row.rawExtra, row.symptoms, row.notes].filter(Boolean).join(' · ');
}

function point(row: TrainingSession, value: number, label: string, unit?: string, direction: NumericSeries['direction'] = 'neutral'): SeriesObservation | undefined {
  if (!row.date || !Number.isFinite(value)) return undefined;
  return { id: `${row.tab}:${row.rowNumber}:${label}`, date: row.date, value, label: row.exercise ?? label, unit, direction, context: context(row), sourceReference: { tab: row.tab, rowNumber: row.rowNumber }, metadata: { surface: row.surface, footwear: row.footwear, leadInMetres: row.leadInMetres, timingStart: row.timingStart, stance: row.stance, symptoms: row.symptoms, notes: row.notes, extra: row.extra } };
}

function legacyNumber(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text ? pattern.exec(text) : undefined;
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function numericValues(value: unknown): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function legacyProtocolMetadata(text: string | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(/(?:measurement method|protocol)\s*:\s*([^;]+)/gi)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));
}

function categoryFor(rows: readonly TrainingSession[]): NumericSeries['metadata']['category'] {
  const category = rows[0]?.category?.toLowerCase();
  if (category && ['acceleration', 'max velocity', 'speed endurance'].includes(category)) return 'Sprint';
  if (category && ['plyometric', 'testing'].includes(category)) return 'Jump';
  if (category === 'strength') return 'Strength';
  return 'Training';
}

function seriesId(exercise: string, metric: string, unit: string | undefined, protocol?: string): string {
  return ['full-session', exercise, metric, unit ?? 'unit-unknown', protocol ?? 'protocol-unknown'].join('::');
}

function familyForExtra(key: string): MetricFamily {
  const value = key.toLowerCase();
  if (/pain|symptom|soreness|ache/.test(value)) return 'SYMPTOM';
  if (/rpe|effort|exertion/.test(value)) return 'EFFORT';
  if (/body.?weight|body.?mass/.test(value)) return 'BODY_METRIC';
  if (/volume|tonnage|distance|duration|reps|sets/.test(value)) return 'VOLUME';
  if (/sleep|hrv|resting|readiness|fatigue|recovery/.test(value)) return 'RECOVERY';
  if (/velocity|speed|height|time|load|power|force/.test(value)) return 'PERFORMANCE';
  return 'CONTEXT';
}

function intensityFamily(unit: string | undefined): MetricFamily {
  const normalized = unit?.trim().toLowerCase();
  return normalized === '%' || normalized === 'rpe' ? 'EFFORT' : 'PERFORMANCE';
}

function variable(exercise: string, metric: string, label: string, unit: string | undefined, direction: NumericSeries['direction'], series: Array<SeriesObservation | undefined>, rows: readonly TrainingSession[], metricFamily: MetricFamily, derived = false, discoveryEligible = true, protocol?: string, derivedFrom: string[] = []): NumericSeries | undefined {
  const valid = series.filter((item): item is SeriesObservation => Boolean(item));
  if (!valid.length) return undefined;
  const id = seriesId(exercise, metric, unit, protocol);
  const exerciseConcept = rows[0]?.exercise ?? exercise;
  return { id, exercise, metric, variable: metric, label, source: 'Full Session tracking', unit, direction, higherIsBetter: direction === 'neutral' ? undefined : direction === 'higher', observations: valid, series: valid, derived, discoveryEligible, metricFamily, derivedFrom, sourceObservationIds: valid.map((item) => item.sourceReference ? `${item.sourceReference.tab}:${item.sourceReference.rowNumber}` : item.id), conceptId: `${exerciseConcept}::${metricFamily}`, metadata: { category: categoryFor(rows), protocol, amountUnit: rows[0]?.amountUnit, intensityUnit: rows[0]?.intensityUnit, exerciseConcept } };
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
  const grouped = new Map<string, { exercise: string; protocol?: string; rows: TrainingSession[] }>();
  for (const row of data.training) {
    if (!row.exercise || !row.date) continue;
    const sprintCategory = row.category && ['acceleration', 'max velocity', 'speed endurance'].includes(row.category.toLowerCase()) ? row.category : undefined;
    const protocolParts = [sprintCategory, row.timingStart ? `timing ${row.timingStart}` : undefined, row.leadInMetres != null ? `${row.leadInMetres}m lead-in` : undefined, row.stance ? `stance ${row.stance}` : undefined].filter(Boolean);
    const metadataProtocol = [...['measurement_method', 'device', 'protocol'].flatMap((key) => typeof row.extra?.[key] === 'string' ? [`${key.replace('_', ' ')} ${String(row.extra[key])}`] : []), ...legacyProtocolMetadata(row.rawExtra)];
    const protocol = [...protocolParts, ...metadataProtocol].join(' · ') || undefined;
    const key = [row.exercise, row.amountUnit?.toLowerCase() ?? '', row.intensityUnit?.toLowerCase() ?? '', protocol ?? 'unknown'].join('::');
    const entry = grouped.get(key) ?? { exercise: row.exercise, protocol, rows: [] };
    entry.rows.push(row);
    grouped.set(key, entry);
  }

  for (const { exercise: sourceExercise, protocol, rows } of [...grouped.values()].sort((a, b) => a.exercise.localeCompare(b.exercise))) {
    const exercise = protocol ? `${sourceExercise} — ${protocol}` : sourceExercise;
    const direction = intensityDirection(rows);
    const amountUnit = rows.find((row) => row.amountUnit)?.amountUnit;
    const intensityUnit = rows.find((row) => row.intensityUnit)?.intensityUnit;
    const amountId = seriesId(exercise, 'amount', amountUnit, protocol);
    const intensityId = seriesId(exercise, 'intensity', intensityUnit, protocol);
    const candidates: Array<AnalysisVariable | undefined> = [
      variable(exercise, 'amount', 'Amount', amountUnit, 'neutral', rows.map((row) => row.amount == null ? undefined : point(row, row.amount, 'Amount', row.amountUnit)), rows, 'VOLUME', false, true, protocol),
      variable(exercise, 'intensity', 'Intensity', intensityUnit, direction, rows.map((row) => row.intensity == null ? undefined : point(row, row.intensity, 'Intensity', row.intensityUnit, direction)), rows, intensityFamily(intensityUnit), false, true, protocol),
      variable(exercise, 'sets', 'Sets', 'sets', 'neutral', rows.map((row) => row.sets == null ? undefined : point(row, row.sets, 'Sets', 'sets')), rows, 'VOLUME', false, true, protocol),
    ];

    const measured = rows.filter((row) => row.intensity != null);
    if (measured.length) candidates.push(variable(exercise, 'pb', 'PB / best intensity', measured[0]?.intensityUnit, direction, pbSeries(measured, direction), rows, 'PERFORMANCE', true, false, protocol, [intensityId]));

    const strengthRows = rows.filter((row) => row.amountUnit?.toLowerCase() === 'reps' && row.intensityUnit?.toLowerCase() === 'kg' && row.amount != null && row.intensity != null);
    for (const reps of [...new Set(strengthRows.map((row) => row.amount!))].sort((a, b) => a - b)) {
      candidates.push(variable(exercise, `load-${reps}-reps`, `${reps}-rep load`, 'kg', 'higher', strengthRows.filter((row) => row.amount === reps).map((row) => point(row, row.intensity!, `${reps}-rep load`, 'kg', 'higher')), rows, 'PERFORMANCE', false, true, protocol, [intensityId, amountId]));
    }
    candidates.push(variable(exercise, 'estimated-1rm', 'Estimated 1RM (Epley)', 'kg', 'higher', strengthRows.map((row) => point(row, row.intensity! * (1 + row.amount! / 30), 'Estimated 1RM', 'kg', 'higher')), rows, 'PERFORMANCE', true, true, protocol, [intensityId, amountId]));
    candidates.push(variable(exercise, 'session-volume', 'Session volume', 'kg·reps', 'higher', strengthRows.map((row) => row.sets == null ? undefined : point(row, row.sets * row.amount! * row.intensity!, 'Session volume', 'kg·reps', 'higher')), rows, 'VOLUME', true, true, protocol, [intensityId, amountId, seriesId(exercise, 'sets', 'sets', protocol)]));

    const rpe = rows.map((row) => {
      const value = typeof row.extra?.rpe === 'number' ? row.extra.rpe : legacyNumber(row.rawExtra, /\bRPE\s*([0-9]+(?:\.[0-9]+)?)/i);
      return value == null ? undefined : point(row, value, 'RPE', 'RPE');
    });
    candidates.push(variable(exercise, 'rpe', 'RPE', 'RPE', 'neutral', rpe, rows, 'EFFORT', false, true, protocol));

    const bestVelocity = rows.map((row) => {
      const explicit = numericValues(row.extra?.best_velocity_ms)[0];
      const reps = numericValues(row.extra?.rep_velocity_ms);
      const value = explicit ?? (reps.length ? Math.max(...reps) : undefined) ?? legacyNumber(row.rawExtra, /\bVelocity\s*([0-9]+(?:\.[0-9]+)?)\s*m\/s/i);
      return value == null ? undefined : point(row, value, 'Best velocity', 'm/s', 'higher');
    });
    candidates.push(variable(exercise, 'best-velocity', 'Best velocity', 'm/s', 'higher', bestVelocity, rows, 'PERFORMANCE', false, true, protocol));
    const averageVelocity = rows.map((row) => {
      const explicit = numericValues(row.extra?.average_velocity_ms)[0];
      const reps = numericValues(row.extra?.rep_velocity_ms);
      const value = explicit ?? (reps.length ? reps.reduce((sum, item) => sum + item, 0) / reps.length : undefined);
      return value == null ? undefined : point(row, value, 'Average velocity', 'm/s', 'higher');
    });
    candidates.push(variable(exercise, 'average-velocity', 'Average velocity', 'm/s', 'higher', averageVelocity, rows, 'PERFORMANCE', false, true, protocol, [seriesId(exercise, 'best-velocity', 'm/s', protocol)]));

    const numericKeys = [...new Set(rows.flatMap((row) => Object.entries(row.extra ?? {}).filter(([, value]) => typeof value === 'number').map(([key]) => key)))];
    for (const key of numericKeys) {
      if (['rpe', 'best_velocity_ms', 'average_velocity_ms', 'rep_velocity_ms'].includes(key)) continue;
      const points = rows.map((row) => typeof row.extra?.[key] === 'number' ? point(row, row.extra[key] as number, key) : undefined);
      if (points.filter(Boolean).length >= 2) candidates.push(variable(exercise, `extra-${key}`, key.replaceAll('_', ' '), undefined, 'neutral', points, rows, familyForExtra(key), false, true, protocol));
    }
    result.push(...candidates.filter((item): item is AnalysisVariable => Boolean(item)));
  }

  const dailyKeys = [...new Set(data.dailyStatus.flatMap((row) => Object.entries(row.extra ?? {}).filter(([, value]) => typeof value === 'number').map(([key]) => key)))];
  for (const key of dailyKeys) {
    const series = data.dailyStatus.flatMap((row) => {
      const value = row.extra?.[key];
      return typeof value === 'number' && row.date ? [{ id: `${row.tab}:${row.rowNumber}:${key}`, date: row.date, value, label: row.context ?? 'Daily Status', direction: 'neutral' as const, context: [row.timepoint, row.context, row.notes].filter(Boolean).join(' · '), sourceReference: { tab: row.tab, rowNumber: row.rowNumber }, metadata: { timepoint: row.timepoint, context: row.context, notes: row.notes, extra: row.extra } }] : [];
    });
    if (series.length >= 2) {
      const metricFamily = familyForExtra(key);
      result.push({ id: `daily-status::${key}`, exercise: 'Daily Status', metric: key, variable: key, label: key.replaceAll('_', ' '), source: 'Daily Status', direction: 'neutral', observations: series, series, discoveryEligible: true, metricFamily, derivedFrom: [], sourceObservationIds: series.map((item) => item.sourceReference ? `${item.sourceReference.tab}:${item.sourceReference.rowNumber}` : item.id), conceptId: `Daily Status:${key}::${metricFamily}`, metadata: { category: 'Recovery', exerciseConcept: `Daily Status:${key}` } });
    }
  }
  return result;
}
