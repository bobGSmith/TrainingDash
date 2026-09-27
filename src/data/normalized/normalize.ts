import type { RawWorkbook } from '../raw/types';
import { normaliseExerciseName } from './aliases';
import { optionalInteger, optionalNumber, optionalText, parseDate, parseExtra, pick, rowsToRecords } from './parsers';
import type { DailyStatusObservation, JumpPerformance, NormalizedWorkbook, SprintPerformance, StrengthPerformance, TrainingSession } from './types';

function trainingRows(rows: string[][]): TrainingSession[] {
  return rows.slice(1).flatMap((row, index) => {
    if (row.every((cell) => optionalText(cell) == null)) return [];
    return [{
      kind: 'training' as const,
      tab: 'Full Session tracking',
      rowNumber: index + 2,
      date: parseDate(row[0]),
      session: optionalText(row[1]),
      category: optionalText(row[2]),
      exercise: optionalText(row[3]),
      sets: optionalInteger(row[4]),
      amount: optionalNumber(row[5]),
      amountUnit: optionalText(row[6]),
      intensity: optionalNumber(row[7]),
      intensityUnit: optionalText(row[8]),
      surface: optionalText(row[9]),
      footwear: optionalText(row[10]),
      extra: parseExtra(row[11]),
      rawExtra: optionalText(row[11]),
      symptoms: optionalText(row[12]),
      notes: optionalText(row[13]),
    }];
  });
}

function dailyStatusRows(rows: string[][]): DailyStatusObservation[] {
  return rows.slice(1).flatMap((row, index) => {
    if (row.every((cell) => optionalText(cell) == null)) return [];
    return [{
      kind: 'daily-status' as const,
      tab: 'Daily Status',
      rowNumber: index + 2,
      date: parseDate(row[0]),
      timepoint: optionalText(row[1]),
      context: optionalText(row[2]),
      extra: parseExtra(row[3]),
      rawExtra: optionalText(row[3]),
      notes: optionalText(row[4]),
    }];
  });
}

function strengthRows(rows: string[][]): StrengthPerformance[] {
  return rowsToRecords(rows).flatMap(({ record, rowNumber }) => {
    const sourceExercise = pick(record, 'exercise', 'lift', 'movement');
    const loadKg = optionalNumber(pick(record, 'load', 'load kg', 'weight', 'weight kg'));
    const reps = optionalInteger(pick(record, 'reps', 'repetitions'));
    if (!sourceExercise || loadKg == null || reps == null) return [];
    const rawExtra = pick(record, 'extra', 'metadata');
    return [{
      kind: 'strength' as const,
      tab: 'Lifting top sets',
      rowNumber,
      date: parseDate(pick(record, 'date')),
      exercise: normaliseExerciseName(sourceExercise),
      sourceExercise,
      loadKg,
      reps,
      rpe: optionalNumber(pick(record, 'rpe')),
      velocityMps: optionalNumber(pick(record, 'velocity', 'velocity m/s', 'mean velocity')),
      pain: optionalNumber(pick(record, 'pain', 'pain score')),
      notes: pick(record, 'notes', 'note'),
      extra: parseExtra(rawExtra),
    }];
  });
}

const SPRINT_WORDS = /sprint|\bfly(?:ing)?\b|\b\d+\s*(?:m|metres?|yards?|yd)\b/i;
const JUMP_WORDS = /jump|\bcmj\b|\brsi\b|\bpogo\b/i;

function testingRows(rows: string[][]): { sprints: SprintPerformance[]; jumps: JumpPerformance[] } {
  const sprints: SprintPerformance[] = [];
  const jumps: JumpPerformance[] = [];
  for (const { record, rowNumber } of rowsToRecords(rows)) {
    const test = pick(record, 'test', 'exercise', 'event', 'type');
    if (!test) continue;
    const date = parseDate(pick(record, 'date'));
    const notes = pick(record, 'notes', 'note');
    const rawExtra = pick(record, 'extra', 'metadata');
    const context = {
      surface: pick(record, 'surface'),
      footwear: pick(record, 'footwear', 'shoes'),
      protocol: pick(record, 'protocol'),
      startType: pick(record, 'start type', 'start'),
      leadInMetres: optionalNumber(pick(record, 'lead in', 'lead-in', 'lead in metres')),
      timingMethod: pick(record, 'timing method', 'timing'),
    };

    if (SPRINT_WORDS.test(test)) {
      const timeSeconds = optionalNumber(pick(record, 'time', 'time seconds', 'result', 'value'));
      if (timeSeconds == null) continue;
      const distanceFromName = /(\d+(?:\.\d+)?)\s*(m|metres?|yards?|yd)\b/i.exec(test);
      const distanceValue = optionalNumber(pick(record, 'distance', 'distance metres'));
      const distanceMetres = distanceValue ?? (distanceFromName
        ? Number(distanceFromName[1]) * (/yard|yd/i.test(distanceFromName[2] ?? '') ? 0.9144 : 1)
        : undefined);
      sprints.push({ kind: 'sprint', tab: 'Data', rowNumber, date, test, distanceMetres, timeSeconds, notes, extra: parseExtra(rawExtra), ...context });
    } else if (JUMP_WORDS.test(test)) {
      const result = optionalNumber(pick(record, 'result', 'value', 'distance', 'height', 'rsi'));
      if (result == null) continue;
      jumps.push({ kind: 'jump', tab: 'Data', rowNumber, date, test, result, unit: pick(record, 'unit', 'result unit'), notes, extra: parseExtra(rawExtra), ...context });
    }
  }
  return { sprints, jumps };
}

export function normalizeWorkbook(raw: RawWorkbook): NormalizedWorkbook {
  const testing = testingRows(raw.Data.rows);
  return {
    ...testing,
    strength: strengthRows(raw['Lifting top sets'].rows),
    training: trainingRows(raw['Full Session tracking'].rows),
    dailyStatus: dailyStatusRows(raw['Daily Status'].rows),
  };
}
