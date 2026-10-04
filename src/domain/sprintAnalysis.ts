import type { SprintPerformance } from '../data/normalized/types';

export type SprintProtocolFamily = 'ACCELERATION_START' | 'FLYING' | 'RACE_LONG_SPRINT' | 'OTHER';

export interface SprintSpeedMetric {
  observation: SprintPerformance;
  averageSpeedMS: number;
  averageSpeedKMH: number;
  derived: true;
  derivedFrom: string[];
}

export interface AccelerationEnvelopePoint {
  distanceMetres: number;
  timeSeconds: number;
  averageSpeedMS: number;
  observation: SprintPerformance;
}

export interface SprintConsistency {
  n: number;
  bestSeconds: number;
  medianSeconds: number;
  minimumSeconds: number;
  maximumSeconds: number;
  coefficientOfVariation?: number;
}

export const DEFAULT_SPRINT_WORK_REP_MIN_EFFORT_PERCENT = 90;

export interface SprintSessionSummary {
  id: string;
  date: string;
  session?: string;
  observations: SprintPerformance[];
  excludedWarmupCount: number;
  fastestTimeSeconds: number;
  meanTimeSeconds: number;
  timeStandardDeviation?: number;
  fastestSpeedMS: number;
  meanSpeedMS: number;
  speedStandardDeviation?: number;
}

export interface SpeedRetentionMetric {
  longSprint: SprintSpeedMetric;
  flyReference: SprintSpeedMetric;
  retentionPercent: number;
  derived: true;
  derivedFrom: string[];
}

export interface SprintPredictionInputRequirement {
  id: string;
  family: SprintProtocolFamily;
  distanceMetres?: number;
}

export interface SprintPredictionInput {
  requirementId: string;
  observation: SprintPerformance;
}

export interface SprintPrediction {
  estimated60mSeconds?: number;
  estimated100mSeconds?: number;
  uncertaintyRange?: { lower: number; upper: number };
  inputsUsed: SprintPredictionInput[];
  modelId: string;
  estimated: true;
  derivedFrom: string[];
}

export interface SprintPredictionModel {
  id: string;
  name: string;
  version: string;
  description: string;
  requiredInputs: SprintPredictionInputRequirement[];
  compatibleProtocols: string[];
  source: string;
  population?: string;
  limitations: string;
  maximumInputAgeDays?: number;
  predict(inputs: SprintPredictionInput[]): SprintPrediction;
}

export const SPRINT_PREDICTION_MODELS: readonly SprintPredictionModel[] = [];

export function yardsToMetres(yards: number): number | undefined {
  return Number.isFinite(yards) && yards > 0 ? yards * .9144 : undefined;
}

export function averageSpeedMS(distanceMetres: number | undefined, timeSeconds: number | undefined): number | undefined {
  if (distanceMetres == null || timeSeconds == null || !Number.isFinite(distanceMetres) || !Number.isFinite(timeSeconds) || distanceMetres <= 0 || timeSeconds <= 0) return undefined;
  return distanceMetres / timeSeconds;
}

export function metresPerSecondToKmh(speedMS: number | undefined): number | undefined {
  return speedMS == null || !Number.isFinite(speedMS) || speedMS < 0 ? undefined : speedMS * 3.6;
}

export function sprintSpeedMetric(observation: SprintPerformance): SprintSpeedMetric | undefined {
  const speed = averageSpeedMS(observation.distanceMetres, observation.timeSeconds);
  const kmh = metresPerSecondToKmh(speed);
  if (speed == null || kmh == null) return undefined;
  return { observation, averageSpeedMS: speed, averageSpeedKMH: kmh, derived: true, derivedFrom: [`${observation.tab}:${observation.rowNumber}:distance`, `${observation.tab}:${observation.rowNumber}:time`] };
}

export function sprintProtocolFamily(observation: SprintPerformance): SprintProtocolFamily {
  const protocol = observation.protocol?.toLowerCase() ?? '';
  const test = observation.test.toLowerCase();
  if (protocol === 'max velocity' || /\bfly(?:ing)?\b/.test(test)) return 'FLYING';
  if (protocol === 'acceleration' || /\bstart\b/.test(test)) return 'ACCELERATION_START';
  if (protocol === 'speed endurance' || (observation.distanceMetres ?? 0) >= 60) return 'RACE_LONG_SPRINT';
  return 'OTHER';
}

export function sprintProtocolKey(observation: SprintPerformance, includeConditions = true): string {
  const values: unknown[] = [sprintProtocolFamily(observation), observation.distanceMetres, observation.startType, observation.leadInMetres, observation.timingMethod];
  if (includeConditions) values.push(observation.surface, observation.footwear);
  return values.map((value) => value ?? 'unknown').join('|').toLowerCase();
}

export function protocolAwarePBs(observations: readonly SprintPerformance[]): SprintPerformance[] {
  const groups = new Map<string, SprintPerformance[]>();
  observations.forEach((item) => { const key = sprintProtocolKey(item); groups.set(key, [...(groups.get(key) ?? []), item]); });
  return [...groups.values()].flatMap((items) => {
    const best = Math.min(...items.map((item) => item.timeSeconds));
    return items.filter((item) => item.timeSeconds === best);
  }).sort((a, b) => (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0) || a.timeSeconds - b.timeSeconds);
}

export function accelerationProtocolKey(observation: SprintPerformance): string {
  return [observation.startType, observation.leadInMetres, observation.timingMethod, observation.surface, observation.footwear].map((value) => value ?? 'unknown').join('|').toLowerCase();
}

export function accelerationEnvelope(observations: readonly SprintPerformance[], protocolKey?: string): AccelerationEnvelopePoint[] {
  const compatible = observations.filter((item) => sprintProtocolFamily(item) === 'ACCELERATION_START' && item.distanceMetres != null && (!protocolKey || accelerationProtocolKey(item) === protocolKey));
  const byDistance = new Map<number, SprintPerformance[]>();
  compatible.forEach((item) => byDistance.set(item.distanceMetres!, [...(byDistance.get(item.distanceMetres!) ?? []), item]));
  return [...byDistance.entries()].map(([distanceMetres, items]) => {
    const observation = [...items].sort((a, b) => a.timeSeconds - b.timeSeconds || (b.date ?? '').localeCompare(a.date ?? ''))[0]!;
    return { distanceMetres, timeSeconds: observation.timeSeconds, averageSpeedMS: distanceMetres / observation.timeSeconds, observation };
  }).sort((a, b) => a.distanceMetres - b.distanceMetres);
}

export function speedRetention(longSprint: SprintPerformance, flyReference: SprintPerformance): SpeedRetentionMetric | undefined {
  const longMetric = sprintSpeedMetric(longSprint), flyMetric = sprintSpeedMetric(flyReference);
  if (!longMetric || !flyMetric || sprintProtocolFamily(flyReference) !== 'FLYING' || sprintProtocolFamily(longSprint) !== 'RACE_LONG_SPRINT') return undefined;
  return { longSprint: longMetric, flyReference: flyMetric, retentionPercent: longMetric.averageSpeedMS / flyMetric.averageSpeedMS * 100, derived: true, derivedFrom: [...longMetric.derivedFrom, ...flyMetric.derivedFrom] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function sampleStandardDeviation(values: readonly number[]): number | undefined {
  if (values.length < 2) return undefined;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

export function isExplicitSprintWarmup(observation: SprintPerformance, minimumEffortPercent = DEFAULT_SPRINT_WORK_REP_MIN_EFFORT_PERCENT): boolean {
  if (observation.effortPercent != null && observation.effortPercent < minimumEffortPercent) return true;
  const metadata = observation.extra ?? {};
  if (metadata.warmup === true || metadata.warm_up === true || metadata.is_warmup === true) return true;
  const text = [observation.session, observation.notes, observation.rawExtra, ...Object.values(metadata).filter((value): value is string => typeof value === 'string')].filter(Boolean).join(' ');
  return /\bwarm[ -]?up\b/i.test(text);
}

export function sprintSessionSummaries(observations: readonly SprintPerformance[], minimumEffortPercent = DEFAULT_SPRINT_WORK_REP_MIN_EFFORT_PERCENT): SprintSessionSummary[] {
  const groups = new Map<string, SprintPerformance[]>();
  observations.filter((item) => item.date).forEach((item) => {
    const key = `${item.date}::${item.session ?? 'session-unknown'}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return [...groups.entries()].flatMap(([id, all]) => {
    const work = all.filter((item) => !isExplicitSprintWarmup(item, minimumEffortPercent));
    const metrics = work.flatMap((item) => { const metric = sprintSpeedMetric(item); return metric ? [metric] : []; });
    if (!work.length || !metrics.length) return [];
    const times = work.map((item) => item.timeSeconds);
    const speeds = metrics.map((item) => item.averageSpeedMS);
    return [{
      id, date: work[0]!.date!, session: work[0]!.session, observations: work,
      excludedWarmupCount: all.length - work.length,
      fastestTimeSeconds: Math.min(...times), meanTimeSeconds: times.reduce((sum, value) => sum + value, 0) / times.length,
      timeStandardDeviation: sampleStandardDeviation(times),
      fastestSpeedMS: Math.max(...speeds), meanSpeedMS: speeds.reduce((sum, value) => sum + value, 0) / speeds.length,
      speedStandardDeviation: sampleStandardDeviation(speeds),
    }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function sprintConsistency(observations: readonly SprintPerformance[], limit = 10): SprintConsistency | undefined {
  const recent = [...observations].filter((item) => item.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.rowNumber - a.rowNumber).slice(0, limit);
  if (!recent.length) return undefined;
  const values = recent.map((item) => item.timeSeconds), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : undefined;
  return { n: values.length, bestSeconds: Math.min(...values), medianSeconds: median(values), minimumSeconds: Math.min(...values), maximumSeconds: Math.max(...values), coefficientOfVariation: standardDeviation == null || mean === 0 ? undefined : standardDeviation / mean * 100 };
}

function dayNumber(date: string): number { return Date.parse(`${date}T00:00:00Z`) / 86_400_000; }

export function selectPredictionInputs(model: SprintPredictionModel, observations: readonly SprintPerformance[], asOfDate: string): SprintPredictionInput[] | undefined {
  const asOf = dayNumber(asOfDate), maximumAge = model.maximumInputAgeDays ?? Infinity;
  const selected = model.requiredInputs.map((requirement) => {
    const candidates = observations.filter((item) => {
      const protocolCompatible = !model.compatibleProtocols.length || model.compatibleProtocols.includes('*') || model.compatibleProtocols.some((protocol) => protocol.toLowerCase() === item.protocol?.toLowerCase() || protocol.toLowerCase() === sprintProtocolKey(item, false));
      return item.date && protocolCompatible && sprintProtocolFamily(item) === requirement.family && (requirement.distanceMetres == null || item.distanceMetres === requirement.distanceMetres) && asOf - dayNumber(item.date) >= 0 && asOf - dayNumber(item.date) <= maximumAge;
    }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.timeSeconds - b.timeSeconds || b.rowNumber - a.rowNumber);
    return candidates[0] ? { requirementId: requirement.id, observation: candidates[0] } : undefined;
  });
  return selected.every(Boolean) ? selected as SprintPredictionInput[] : undefined;
}

export function compatiblePredictionModels(observations: readonly SprintPerformance[], asOfDate: string, models: readonly SprintPredictionModel[] = SPRINT_PREDICTION_MODELS): Array<{ model: SprintPredictionModel; inputs: SprintPredictionInput[] }> {
  return models.flatMap((model) => { const inputs = selectPredictionInputs(model, observations, asOfDate); return inputs ? [{ model, inputs }] : []; });
}
