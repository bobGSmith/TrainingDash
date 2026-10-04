import type { NormalizedWorkbook, TrainingSession } from '../data/normalized/types';
import type { SeriesObservation } from './analysis';
import { estimate1RM, isBodyweightAugmentedExercise, MAX_E1RM_REPS } from './strength';
import { averageSpeedMS, yardsToMetres } from './sprintAnalysis';

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
  metadata: {
    category: 'Sprint' | 'Jump' | 'Strength' | 'Recovery' | 'Training' | 'Body';
    protocol?: string;
    amountUnit?: string;
    intensityUnit?: string;
    exerciseConcept: string;
    athleticQuality?: AthleticQuality;
    structuralVariable?: boolean;
    timepoint?: string;
    domain?: DiscoveryDomain;
    discoveryConcept?: string;
    role?: DiscoveryRole;
    quality?: SeriesQuality;
    exerciseId?: string;
    measurementProtocol?: string;
    trainingPrescription?: boolean;
    effortScope?: 'EXERCISE' | 'SESSION';
    sourceSessionIds?: string[];
  };
}
export type AnalysisVariable = NumericSeries;
export type MetricFamily = 'PERFORMANCE' | 'TRAINING_LOAD' | 'EFFORT' | 'SYMPTOM' | 'RECOVERY' | 'BODY_METRIC' | 'CONTEXT';
export type AthleticQuality = 'STRENGTH' | 'POWER' | 'ACCELERATION' | 'MAX_VELOCITY' | 'ENDURANCE' | 'JUMP' | 'GENERAL';
export type DiscoveryDomain = 'PERFORMANCE' | 'TRAINING_EXPOSURE' | 'SYMPTOM' | 'RECOVERY' | 'BODY_METRIC' | 'CONTEXT';
export type DiscoveryRole = 'OUTCOME' | 'EXPOSURE' | 'STATE' | 'CONTEXT';
export type SeriesQuality = 'RAW' | 'DERIVED' | 'MODELLED';

function context(row: TrainingSession): string {
  return [row.category, row.surface, row.footwear, row.leadInMetres != null ? `${row.leadInMetres}m lead-in` : undefined, row.rawExtra, row.symptoms, row.notes].filter(Boolean).join(' · ');
}

function point(row: TrainingSession, value: number, label: string, unit?: string, direction: NumericSeries['direction'] = 'neutral'): SeriesObservation | undefined {
  if (!row.date || !Number.isFinite(value)) return undefined;
  return { id: `${row.tab}:${row.rowNumber}:${label}`, date: row.date, value, label: row.exercise ?? label, unit, direction, context: context(row), sourceReference: { tab: row.tab, rowNumber: row.rowNumber }, metadata: { surface: row.surface, footwear: row.footwear, leadInMetres: row.leadInMetres, timingStart: row.timingStart, stance: row.stance, symptoms: row.symptoms, notes: row.notes, session: row.session, extra: row.extra } };
}

function legacyNumber(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text ? pattern.exec(text) : undefined;
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function symptomScore(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = /(?:pain[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)(?:\s*\/\s*10)?|([0-9]+(?:\.[0-9]+)?)\s*\/\s*10)/i.exec(text);
  const value = Number(match?.[1] ?? match?.[2]);
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
  if (/volume|tonnage|distance|duration|reps|sets/.test(value)) return 'TRAINING_LOAD';
  if (/sleep|hrv|resting|readiness|fatigue|recovery/.test(value)) return 'RECOVERY';
  if (/velocity|speed|height|time|load|power|force/.test(value)) return 'PERFORMANCE';
  return 'CONTEXT';
}

function intensityFamily(unit: string | undefined): MetricFamily {
  const normalized = unit?.trim().toLowerCase();
  return normalized === '%' || normalized === 'rpe' ? 'EFFORT' : 'PERFORMANCE';
}

function athleticQuality(rows: readonly TrainingSession[]): AthleticQuality {
  const category = rows[0]?.category?.toLowerCase() ?? '';
  if (rows[0]?.amountUnit?.toLowerCase() === 'reps' && rows[0]?.intensityUnit?.toLowerCase() === 'kg') return 'STRENGTH';
  if (category === 'acceleration') return 'ACCELERATION';
  if (category === 'max velocity') return 'MAX_VELOCITY';
  if (category === 'speed endurance') return 'ENDURANCE';
  if (category === 'plyometric' || category === 'testing') return 'JUMP';
  return 'GENERAL';
}

function discoveryDomain(metricFamily: MetricFamily): DiscoveryDomain {
  if (metricFamily === 'TRAINING_LOAD' || metricFamily === 'EFFORT') return 'TRAINING_EXPOSURE';
  return metricFamily;
}

function discoveryRole(metricFamily: MetricFamily): DiscoveryRole {
  if (metricFamily === 'TRAINING_LOAD' || metricFamily === 'EFFORT') return 'EXPOSURE';
  if (metricFamily === 'RECOVERY' || metricFamily === 'BODY_METRIC') return 'STATE';
  if (metricFamily === 'CONTEXT') return 'CONTEXT';
  return 'OUTCOME';
}

function discoveryConcept(metric: string, metricFamily: MetricFamily, quality: AthleticQuality, exerciseConcept: string): string {
  if (metricFamily === 'PERFORMANCE') return quality === 'GENERAL' ? `PERFORMANCE:${exerciseConcept}` : quality;
  if (metricFamily === 'TRAINING_LOAD') return /intensity|load/i.test(metric) ? 'TRAINING_INTENSITY' : 'TRAINING_VOLUME';
  if (metricFamily === 'EFFORT') return metric === 'rpe' ? 'EXERCISE_RPE' : 'EFFORT';
  if (metricFamily === 'BODY_METRIC') return /body.?weight|body.?mass/i.test(metric) ? 'BODYWEIGHT' : `BODY_METRIC:${metric}`;
  if (metricFamily === 'SYMPTOM') return `SYMPTOM:${metric}`;
  if (metricFamily === 'RECOVERY') return `RECOVERY:${metric}`;
  return `CONTEXT:${metric}`;
}

function variable(exercise: string, metric: string, label: string, unit: string | undefined, direction: NumericSeries['direction'], series: Array<SeriesObservation | undefined>, rows: readonly TrainingSession[], metricFamily: MetricFamily, derived = false, discoveryEligible = true, protocol?: string, derivedFrom: string[] = [], structuralVariable = false, trainingPrescription = structuralVariable): NumericSeries | undefined {
  const valid = series.filter((item): item is SeriesObservation => Boolean(item));
  if (!valid.length) return undefined;
  const id = seriesId(exercise, metric, unit, protocol);
  const exerciseConcept = rows[0]?.exercise ?? exercise;
  const quality = athleticQuality(rows);
  const sourceSessionIds = [...new Set(rows.filter((row) => row.date).map((row) => `${row.date}::${row.session ?? 'session-unknown'}`))];
  return { id, exercise, metric, variable: metric, label, source: 'Full Session tracking', unit, direction, higherIsBetter: direction === 'neutral' ? undefined : direction === 'higher', observations: valid, series: valid, derived, discoveryEligible, metricFamily, derivedFrom, sourceObservationIds: valid.map((item) => item.sourceReference ? `${item.sourceReference.tab}:${item.sourceReference.rowNumber}` : item.id), conceptId: `${exerciseConcept}::${metricFamily}`, metadata: { category: categoryFor(rows), protocol, amountUnit: rows[0]?.amountUnit, intensityUnit: rows[0]?.intensityUnit, exerciseConcept, athleticQuality: quality, structuralVariable, domain: discoveryDomain(metricFamily), discoveryConcept: discoveryConcept(metric, metricFamily, quality, exerciseConcept), role: discoveryRole(metricFamily), quality: metric === 'estimated-1rm' ? 'MODELLED' : derived ? 'DERIVED' : 'RAW', exerciseId: exerciseConcept.toLowerCase(), measurementProtocol: protocol, trainingPrescription, effortScope: metric === 'rpe' ? 'EXERCISE' : undefined, sourceSessionIds } };
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
      variable(exercise, 'amount', 'Amount', amountUnit, 'neutral', rows.map((row) => row.amount == null ? undefined : point(row, row.amount, 'Amount', row.amountUnit)), rows, 'TRAINING_LOAD', false, true, protocol, [], true),
      variable(exercise, 'intensity', 'Intensity', intensityUnit, direction, rows.map((row) => row.intensity == null ? undefined : point(row, row.intensity, 'Intensity', row.intensityUnit, direction)), rows, intensityFamily(intensityUnit), false, true, protocol, [], athleticQuality(rows) === 'STRENGTH'),
      variable(exercise, 'sets', 'Sets', 'sets', 'neutral', rows.map((row) => row.sets == null ? undefined : point(row, row.sets, 'Sets', 'sets')), rows, 'TRAINING_LOAD', false, true, protocol, [], true),
    ];
    const sprintSpeed = rows.map((row) => {
      if (row.intensityUnit?.toLowerCase() !== 's' || row.amount == null || row.intensity == null) return undefined;
      const unit = row.amountUnit?.toLowerCase();
      const distanceMetres = unit === 'm' ? row.amount : unit === 'yd' ? yardsToMetres(row.amount) : undefined;
      const speed = averageSpeedMS(distanceMetres, row.intensity);
      return speed == null ? undefined : point(row, speed, 'Average speed', 'm/s', 'higher');
    });
    candidates.push(variable(exercise, 'average-speed', 'Average speed', 'm/s', 'higher', sprintSpeed, rows, 'PERFORMANCE', true, true, protocol, [amountId, intensityId]));
    const distanceExposure = rows.map((row) => row.sets == null || row.amount == null || !['m', 'yd'].includes(row.amountUnit?.toLowerCase() ?? '') ? undefined : point(row, row.sets * row.amount, 'Distance exposure', row.amountUnit));
    candidates.push(variable(exercise, 'distance-exposure', 'Distance exposure', amountUnit, 'neutral', distanceExposure, rows, 'TRAINING_LOAD', true, true, protocol, [amountId, seriesId(exercise, 'sets', 'sets', protocol)], true, false));
    const symptomPoints = rows.map((row) => { const value = symptomScore(row.symptoms); return value == null ? undefined : point(row, value, 'Recorded symptom score', '0–10'); });
    candidates.push(variable(exercise, 'symptom-score', 'Recorded symptom score', '0–10', 'neutral', symptomPoints, rows, 'SYMPTOM', false, true, protocol));

    const measured = rows.filter((row) => row.intensity != null);
    if (measured.length) candidates.push(variable(exercise, 'pb', 'PB / best intensity', measured[0]?.intensityUnit, direction, pbSeries(measured, direction), rows, 'PERFORMANCE', true, false, protocol, [intensityId]));

    const strengthRows = rows.filter((row) => row.amountUnit?.toLowerCase() === 'reps' && row.intensityUnit?.toLowerCase() === 'kg' && row.amount != null && row.intensity != null);
    for (const reps of [...new Set(strengthRows.map((row) => row.amount!))].sort((a, b) => a - b)) {
      candidates.push(variable(exercise, `load-${reps}-reps`, `${reps}-rep load`, 'kg', 'higher', strengthRows.filter((row) => row.amount === reps).map((row) => point(row, row.intensity!, `${reps}-rep load`, 'kg', 'higher')), rows, 'PERFORMANCE', false, true, protocol, [intensityId, amountId]));
    }
    if (!isBodyweightAugmentedExercise(sourceExercise)) candidates.push(variable(exercise, 'estimated-1rm', 'Estimated 1RM (Epley)', 'kg', 'higher', strengthRows.map((row) => row.amount! > MAX_E1RM_REPS ? undefined : point(row, estimate1RM(row.intensity, row.amount)!, 'Estimated 1RM', 'kg', 'higher')), rows, 'PERFORMANCE', true, true, protocol, [intensityId, amountId]));
    candidates.push(variable(exercise, 'session-volume', 'Session volume', 'kg·reps', 'higher', strengthRows.map((row) => row.sets == null ? undefined : point(row, row.sets * row.amount! * row.intensity!, 'Session volume', 'kg·reps', 'higher')), rows, 'TRAINING_LOAD', true, true, protocol, [intensityId, amountId, seriesId(exercise, 'sets', 'sets', protocol)], true, false));

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
      if (familyForExtra(key) === 'BODY_METRIC') continue;
      const points = rows.map((row) => typeof row.extra?.[key] === 'number' ? point(row, row.extra[key] as number, key) : undefined);
      if (points.filter(Boolean).length >= 2) candidates.push(variable(exercise, `extra-${key}`, key.replaceAll('_', ' '), undefined, 'neutral', points, rows, familyForExtra(key), false, true, protocol));
    }
    result.push(...candidates.filter((item): item is AnalysisVariable => Boolean(item)));
  }

  const dailyGroups = new Map<string, { key: string; timepoint: string; rows: typeof data.dailyStatus }>();
  for (const row of data.dailyStatus) for (const [key, value] of Object.entries(row.extra ?? {})) {
    if (typeof value !== 'number' || familyForExtra(key) === 'BODY_METRIC') continue;
    const timepoint = row.timepoint?.trim() || 'Timepoint unknown';
    const id = `${key}::${timepoint.toLowerCase()}`;
    const group = dailyGroups.get(id) ?? { key, timepoint, rows: [] };
    group.rows.push(row); dailyGroups.set(id, group);
  }
  for (const { key, timepoint, rows } of dailyGroups.values()) {
    const series = rows.flatMap((row) => {
      const value = row.extra?.[key];
      return typeof value === 'number' && row.date ? [{ id: `${row.tab}:${row.rowNumber}:${key}`, date: row.date, value, label: row.context ?? 'Daily Status', direction: 'neutral' as const, context: [row.timepoint, row.context, row.notes].filter(Boolean).join(' · '), sourceReference: { tab: row.tab, rowNumber: row.rowNumber }, metadata: { timepoint: row.timepoint, context: row.context, notes: row.notes, extra: row.extra } }] : [];
    });
    if (series.length >= 2) {
      const metricFamily = familyForExtra(key);
      result.push({ id: `daily-status::${key}::${timepoint}`, exercise: `Daily Status — ${timepoint}`, metric: key, variable: key, label: key.replaceAll('_', ' '), source: 'Daily Status', direction: 'neutral', observations: series, series, discoveryEligible: true, metricFamily, derivedFrom: [], sourceObservationIds: series.map((item) => item.sourceReference ? `${item.sourceReference.tab}:${item.sourceReference.rowNumber}` : item.id), conceptId: `Daily Status:${key}:${timepoint}::${metricFamily}`, metadata: { category: 'Recovery', exerciseConcept: `Daily Status:${key}`, timepoint, domain: discoveryDomain(metricFamily), discoveryConcept: discoveryConcept(key, metricFamily, 'GENERAL', `Daily Status:${key}`), role: discoveryRole(metricFamily), quality: 'RAW', exerciseId: `daily-status:${key}`, sourceSessionIds: series.map((item) => `${item.date}::${timepoint.toLowerCase()}`) } });
    }
  }

  const bodyKeyGroups = new Map<string, Set<string>>();
  for (const row of [...data.training, ...data.dailyStatus]) for (const key of Object.keys(row.extra ?? {}).filter((candidate) => familyForExtra(candidate) === 'BODY_METRIC')) {
    const canonical = /body.?weight|body.?mass/i.test(key) ? 'bodyweight_kg' : key;
    const keys = bodyKeyGroups.get(canonical) ?? new Set<string>(); keys.add(key); bodyKeyGroups.set(canonical, keys);
  }
  for (const [key, sourceKeys] of bodyKeyGroups) {
    const series: SeriesObservation[] = [];
    for (const row of [...data.training, ...data.dailyStatus]) {
      const sourceKey = [...sourceKeys].find((candidate) => typeof row.extra?.[candidate] === 'number');
      const value = sourceKey ? row.extra?.[sourceKey] : undefined;
      if (typeof value !== 'number' || !row.date) continue;
      series.push({ id: `${row.tab}:${row.rowNumber}:${key}`, date: row.date, value, label: key.replaceAll('_', ' '), direction: 'neutral', sourceReference: { tab: row.tab, rowNumber: row.rowNumber }, context: 'Dated body metric', metadata: { extra: row.extra } });
    }
    if (series.length >= 2) result.push({ id: `body-metric::${key}`, exercise: 'Body metrics', metric: key, variable: key, label: key.replaceAll('_', ' '), source: series[0]?.sourceReference?.tab === 'Daily Status' ? 'Daily Status' : 'Full Session tracking', unit: /kg|weight|mass/i.test(key) ? 'kg' : undefined, direction: 'neutral', observations: series, series, discoveryEligible: true, metricFamily: 'BODY_METRIC', derivedFrom: [], sourceObservationIds: series.map((item) => `${item.sourceReference!.tab}:${item.sourceReference!.rowNumber}`), conceptId: `Body:${key}`, metadata: { category: 'Body', exerciseConcept: `Body:${key}`, domain: 'BODY_METRIC', discoveryConcept: discoveryConcept(key, 'BODY_METRIC', 'GENERAL', `Body:${key}`), role: 'STATE', quality: 'RAW', exerciseId: 'body-metrics', sourceSessionIds: series.map((item) => `${item.date}::body-metric`) } });
  }
  return result;
}
