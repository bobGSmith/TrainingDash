import type { Metadata, SprintPerformance } from '../data/normalized/types';
import { sprintProtocolFamily, sprintSpeedMetric } from './sprintAnalysis';

export interface SprintSummaryOptions {
  includeSpeedKmh?: boolean;
}

export interface SprintObservationDetails {
  date?: string;
  test: string;
  timeSeconds: number;
  distanceMetres?: number;
  averageSpeedMS?: number;
  averageSpeedKMH?: number;
  leadInMetres?: number;
  surface?: string;
  footwear?: string;
  startType?: string;
  timingMethod?: string;
  effortPercent?: number;
  session?: string;
  symptoms?: string;
  notes?: string;
  rawExtra?: string;
  extra?: Metadata;
  source: { tab: string; rowNumber: number };
}

function metres(value: number): string {
  return `${Number.isInteger(value) ? value : Number(value.toFixed(3))} m`;
}

/** Known, structured conditions suitable for compact human-facing UI. */
export function formatSprintConditions(observation: SprintPerformance): string {
  const family = sprintProtocolFamily(observation);
  const conditions: Array<string | undefined> = [];
  if (family === 'ACCELERATION_START' || family === 'RACE_LONG_SPRINT') conditions.push(observation.startType);
  if (family === 'FLYING' || family === 'ACCELERATION_START') conditions.push(observation.leadInMetres == null ? undefined : `${metres(observation.leadInMetres)} lead-in`);
  conditions.push(observation.surface, observation.footwear, observation.timingMethod);
  return conditions.filter((value): value is string => Boolean(value?.trim())).join(' · ');
}

/** Primary result plus concise structured provenance. Notes and internal fields are deliberately excluded. */
export function formatSprintObservationSummary(observation: SprintPerformance, options: SprintSummaryOptions = {}): string {
  const family = sprintProtocolFamily(observation);
  const speed = sprintSpeedMetric(observation);
  const primary: string[] = [];
  if ((options.includeSpeedKmh ?? family === 'FLYING') && speed) primary.push(`${speed.averageSpeedKMH.toFixed(1)} km/h`);
  primary.push(family === 'RACE_LONG_SPRINT' || observation.distanceMetres == null
    ? `${observation.timeSeconds.toFixed(3)} s`
    : `${observation.timeSeconds.toFixed(3)} s over ${metres(observation.distanceMetres)}`);
  const conditions = formatSprintConditions(observation);
  if (conditions) primary.push(conditions);
  return primary.join(' · ');
}

/** Rich representation for inspectors/details without weakening the normalized model. */
export function sprintObservationDetails(observation: SprintPerformance): SprintObservationDetails {
  const speed = sprintSpeedMetric(observation);
  return {
    date: observation.date,
    test: observation.test,
    timeSeconds: observation.timeSeconds,
    distanceMetres: observation.distanceMetres,
    averageSpeedMS: speed?.averageSpeedMS,
    averageSpeedKMH: speed?.averageSpeedKMH,
    leadInMetres: observation.leadInMetres,
    surface: observation.surface,
    footwear: observation.footwear,
    startType: observation.startType,
    timingMethod: observation.timingMethod,
    effortPercent: observation.effortPercent,
    session: observation.session,
    symptoms: observation.symptoms,
    notes: observation.notes,
    rawExtra: observation.rawExtra,
    extra: observation.extra,
    source: { tab: observation.tab, rowNumber: observation.rowNumber },
  };
}

export function formatSprintObservationDetailText(observation: SprintPerformance): string {
  const details = sprintObservationDetails(observation);
  return [
    formatSprintConditions(observation),
    details.effortPercent == null ? undefined : `${details.effortPercent}% effort`,
    details.symptoms ? `Symptoms: ${details.symptoms}` : undefined,
    details.notes ? `Notes: ${details.notes}` : undefined,
    `Source: ${details.source.tab} row ${details.source.rowNumber}`,
  ].filter(Boolean).join(' · ');
}
