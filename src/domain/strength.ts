import { normaliseExerciseName } from '../data/normalized/aliases';
import type { Metadata, SourceReference, TrainingSession } from '../data/normalized/types';

export const MAX_E1RM_REPS = 12;
export const DEFAULT_STRENGTH_WINDOW_DAYS = 45;
export const DEFAULT_TOP_PERFORMANCES = 2;

export type OneRepMaxMethod = 'epley';

export interface StrengthSetObservation extends SourceReference {
  id: string;
  date: string;
  exercise: string;
  loadKg: number;
  reps: number;
  sets?: number;
  rpe?: number;
  session?: string;
  notes?: string;
  symptoms?: string;
  rawExtra?: string;
  metadata?: Metadata;
}

export interface EstimatedOneRepMaxObservation extends StrengthSetObservation {
  e1rmKg: number;
  method: OneRepMaxMethod;
}

export interface StrengthStatePoint {
  date: string;
  estimatedStrengthKg: number;
  contributingObservationIds: string[];
  windowStart: string;
  windowDays: number;
}

export interface StrengthStateOptions {
  windowDays?: number;
  numberOfTopPerformances?: number;
  recencyWeighting?: boolean;
  useRpe?: boolean;
}

export interface WeeklyStrengthExposure {
  weekStart: string;
  sessions: number;
  workSets?: number;
  totalReps?: number;
  tonnageKg?: number;
}

function optionalMetadataNumber(metadata: Metadata | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function legacyRpe(text: string | undefined): number | undefined {
  const match = text?.match(/\bRPE\s*([0-9]+(?:\.[0-9]+)?)/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

export function estimate1RM(loadKg: number | undefined, reps: number | undefined, method: OneRepMaxMethod = 'epley'): number | undefined {
  if (method !== 'epley' || loadKg == null || reps == null || !Number.isFinite(loadKg) || !Number.isFinite(reps) || loadKg <= 0 || reps <= 0) return undefined;
  return loadKg * (1 + reps / 30);
}

export function isBodyweightAugmentedExercise(exercise: string): boolean {
  return /(?:weighted\s+)?(?:pull[ -]?ups?|chin[ -]?ups?|dips?).*(?:weighted|\+)|weighted.*(?:pull[ -]?ups?|chin[ -]?ups?|dips?)/i.test(exercise);
}

export function strengthSetObservations(rows: readonly TrainingSession[]): StrengthSetObservation[] {
  return rows.flatMap((row) => {
    if (!row.date || !row.exercise || row.amountUnit?.toLowerCase() !== 'reps' || row.intensityUnit?.toLowerCase() !== 'kg') return [];
    if (row.amount == null || row.intensity == null || row.amount <= 0 || row.intensity <= 0 || !Number.isInteger(row.amount)) return [];
    return [{ id: `${row.tab}:${row.rowNumber}`, tab: row.tab, rowNumber: row.rowNumber, date: row.date, exercise: normaliseExerciseName(row.exercise), loadKg: row.intensity, reps: row.amount, sets: row.sets, rpe: optionalMetadataNumber(row.extra, 'rpe') ?? legacyRpe(row.rawExtra), session: row.session, notes: row.notes, symptoms: row.symptoms, rawExtra: row.rawExtra, metadata: row.extra }];
  });
}

export function estimatedOneRepMaxObservations(observations: readonly StrengthSetObservation[], maximumReps = MAX_E1RM_REPS): EstimatedOneRepMaxObservation[] {
  return observations.flatMap((observation) => {
    if (observation.reps > maximumReps || isBodyweightAugmentedExercise(observation.exercise)) return [];
    const e1rmKg = estimate1RM(observation.loadKg, observation.reps);
    return e1rmKg == null ? [] : [{ ...observation, e1rmKg, method: 'epley' as const }];
  });
}

function dayNumber(date: string): number { return Date.parse(`${date}T00:00:00Z`) / 86_400_000; }
function isoDate(day: number): string { return new Date(day * 86_400_000).toISOString().slice(0, 10); }

export function estimateCurrentStrength(observations: readonly EstimatedOneRepMaxObservation[], date: string, options: StrengthStateOptions = {}): StrengthStatePoint | undefined {
  const windowDays = options.windowDays ?? DEFAULT_STRENGTH_WINDOW_DAYS;
  const numberOfTopPerformances = options.numberOfTopPerformances ?? DEFAULT_TOP_PERFORMANCES;
  const target = dayNumber(date);
  const eligible = observations.filter((item) => { const difference = target - dayNumber(item.date); return difference >= 0 && difference <= windowDays; }).sort((a, b) => b.e1rmKg - a.e1rmKg || b.date.localeCompare(a.date) || b.rowNumber - a.rowNumber).slice(0, Math.max(1, numberOfTopPerformances));
  if (!eligible.length) return undefined;
  // RPE and recency are intentionally retained in the API but not weighted yet.
  const estimatedStrengthKg = eligible.reduce((sum, item) => sum + item.e1rmKg, 0) / eligible.length;
  return { date, estimatedStrengthKg, contributingObservationIds: eligible.map((item) => item.id), windowStart: isoDate(target - windowDays), windowDays };
}

export function strengthStateProgression(observations: readonly EstimatedOneRepMaxObservation[], options: StrengthStateOptions = {}): StrengthStatePoint[] {
  const dates = [...new Set(observations.map((item) => item.date))].sort();
  return dates.flatMap((date) => { const state = estimateCurrentStrength(observations, date, options); return state ? [state] : []; });
}

export function bestActualPerformance(observations: readonly StrengthSetObservation[]): StrengthSetObservation | undefined {
  return [...observations].sort((a, b) => b.loadKg - a.loadKg || b.reps - a.reps || b.date.localeCompare(a.date) || b.rowNumber - a.rowNumber)[0];
}

export function repSpecificProgression(observations: readonly StrengthSetObservation[], reps: number): StrengthSetObservation[] {
  let best = -Infinity;
  return [...observations].filter((item) => item.reps === reps).sort((a, b) => a.date.localeCompare(b.date) || a.rowNumber - b.rowNumber).filter((item) => item.loadKg > best ? (best = item.loadKg, true) : false);
}

function weekStart(date: string): string {
  const value = new Date(`${date}T00:00:00Z`), day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

export function weeklyStrengthExposure(observations: readonly StrengthSetObservation[]): WeeklyStrengthExposure[] {
  const weeks = new Map<string, StrengthSetObservation[]>();
  observations.forEach((item) => { const key = weekStart(item.date); weeks.set(key, [...(weeks.get(key) ?? []), item]); });
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, items]) => {
    const knownSets = items.filter((item) => item.sets != null);
    const workSets = knownSets.length ? knownSets.reduce((sum, item) => sum + item.sets!, 0) : undefined;
    const totalReps = knownSets.length ? knownSets.reduce((sum, item) => sum + item.sets! * item.reps, 0) : undefined;
    const tonnageKg = knownSets.length ? knownSets.reduce((sum, item) => sum + item.sets! * item.reps * item.loadKg, 0) : undefined;
    return { weekStart: week, sessions: new Set(items.map((item) => item.date)).size, workSets, totalReps, tonnageKg };
  });
}
