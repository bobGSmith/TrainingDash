import type { RawWorkbook } from '../raw/types';
import { normaliseExerciseName } from './aliases';
import { optionalInteger, optionalNumber, optionalText, parseDate, parseExtra } from './parsers';
import type { DailyStatusObservation, JumpPerformance, Metadata, NormalizedWorkbook, SprintPerformance, StrengthPerformance, TrainingSession } from './types';

function textNumber(text: string | undefined, pattern: RegExp): number | undefined {
  const match = text ? pattern.exec(text) : undefined;
  return match ? optionalNumber(match[1]) : undefined;
}

function metadataNumber(metadata: Metadata | undefined, key: string): number | undefined {
  return metadata ? optionalNumber(metadata[key]) : undefined;
}

function trainingRows(rows: string[][]): TrainingSession[] {
  return rows.slice(1).flatMap((row, index) => {
    if (row.every((cell) => optionalText(cell) == null)) return [];
    const setsText = optionalText(row[4]);
    const sets = optionalInteger(row[4]);
    return [{ kind: 'training' as const, tab: 'Full Session tracking', rowNumber: index + 2,
      date: parseDate(row[0]), session: optionalText(row[1]), category: optionalText(row[2]), exercise: optionalText(row[3]),
      sets, setsText: sets == null ? setsText : undefined, amount: optionalNumber(row[5]), amountUnit: optionalText(row[6]),
      intensity: optionalNumber(row[7]), intensityUnit: optionalText(row[8]), surface: optionalText(row[9]), footwear: optionalText(row[10]),
      extra: parseExtra(row[11]), rawExtra: optionalText(row[11]), symptoms: optionalText(row[12]), notes: optionalText(row[13]),
      timingStart: optionalText(row[14]), leadInMetres: optionalNumber(row[15]), stance: optionalText(row[16]), effortPercent: optionalNumber(row[17]),
    }];
  });
}

function dailyStatusRows(rows: string[][]): DailyStatusObservation[] {
  return rows.slice(1).flatMap((row, index) => row.every((cell) => optionalText(cell) == null) ? [] : [{
    kind: 'daily-status' as const, tab: 'Daily Status', rowNumber: index + 2, date: parseDate(row[0]),
    timepoint: optionalText(row[1]), context: optionalText(row[2]), extra: parseExtra(row[3]), rawExtra: optionalText(row[3]), notes: optionalText(row[4]),
  }]);
}

function isCategory(row: TrainingSession, ...categories: string[]): boolean {
  return categories.some((candidate) => row.category?.toLowerCase() === candidate.toLowerCase());
}

function strengthPerformances(rows: TrainingSession[]): StrengthPerformance[] {
  return rows.flatMap((row) => {
    if (!isCategory(row, 'Strength') || row.amountUnit?.toLowerCase() !== 'reps' || row.intensityUnit?.toLowerCase() !== 'kg') return [];
    if (!row.exercise || row.amount == null || row.intensity == null || !Number.isInteger(row.amount)) return [];
    return [{ kind: 'strength' as const, tab: row.tab, rowNumber: row.rowNumber, date: row.date,
      exercise: normaliseExerciseName(row.exercise), sourceExercise: row.exercise, loadKg: row.intensity, reps: row.amount,
      rpe: metadataNumber(row.extra, 'rpe') ?? textNumber(row.rawExtra, /\bRPE\s*([0-9]+(?:\.[0-9]+)?)/i),
      velocityMps: metadataNumber(row.extra, 'best_velocity_ms') ?? metadataNumber(row.extra, 'rep_velocity_ms') ?? textNumber(row.rawExtra, /\bVelocity\s*([0-9]+(?:\.[0-9]+)?)\s*m\/s/i),
      pain: textNumber(row.symptoms, /(?:pain\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:\/\s*10)?/i), notes: row.notes, extra: row.extra,
    }];
  });
}

function sprintPerformances(rows: TrainingSession[]): SprintPerformance[] {
  return rows.flatMap((row) => {
    if (!isCategory(row, 'Acceleration', 'Max velocity', 'Speed endurance') || row.amount == null || row.intensity == null || row.intensityUnit?.toLowerCase() !== 's') return [];
    if (!row.exercise || !['m', 'yd'].includes(row.amountUnit?.toLowerCase() ?? '')) return [];
    return [{ kind: 'sprint' as const, tab: row.tab, rowNumber: row.rowNumber, date: row.date, test: row.exercise,
      distanceMetres: row.amountUnit?.toLowerCase() === 'yd' ? row.amount * 0.9144 : row.amount, timeSeconds: row.intensity,
      effortPercent: row.effortPercent, sets: row.sets, session: row.session, surface: row.surface, footwear: row.footwear, protocol: row.category,
      startType: row.stance, leadInMetres: row.leadInMetres, timingMethod: row.timingStart, symptoms: row.symptoms, notes: row.notes, rawExtra: row.rawExtra, extra: row.extra,
    }];
  });
}

function jumpPerformances(rows: TrainingSession[]): JumpPerformance[] {
  return rows.flatMap((row) => {
    if (!isCategory(row, 'Plyometric', 'Testing') || !row.exercise || row.intensity == null || !row.intensityUnit) return [];
    if (!['m', 'cm', 'rsi'].includes(row.intensityUnit.toLowerCase())) return [];
    return [{ kind: 'jump' as const, tab: row.tab, rowNumber: row.rowNumber, date: row.date, test: row.exercise,
      result: row.intensity, unit: row.intensityUnit, sets: row.sets, surface: row.surface, footwear: row.footwear,
      protocol: row.rawExtra, symptoms: row.symptoms, notes: row.notes, extra: row.extra,
    }];
  });
}

export function normalizeWorkbook(raw: RawWorkbook): NormalizedWorkbook {
  const training = trainingRows(raw['Full Session tracking'].rows);
  return { training, sprints: sprintPerformances(training), jumps: jumpPerformances(training), strength: strengthPerformances(training), dailyStatus: dailyStatusRows(raw['Daily Status'].rows) };
}
