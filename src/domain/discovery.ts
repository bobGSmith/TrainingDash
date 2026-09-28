import { analyseSeries, pairSeries, type PairingStrategy } from './analysis';
import type { NumericSeries } from './analysisVariables';

export const DEFAULT_DISCOVERY_MIN_N = 6;
export type ExclusionReason = 'DIRECT_DERIVATION' | 'SAME_EXERCISE_PERFORMANCE_REDUNDANCY' | 'SAME_OBSERVATION_LEAKAGE' | 'INSUFFICIENT_N' | 'INCOMPATIBLE_PROTOCOL' | 'DUPLICATE_SERIES';
export interface EligibilityResult { eligible: boolean; reason?: ExclusionReason }
export interface DiscoveryResult { xSeriesId: string; ySeriesId: string; xLabel: string; yLabel: string; n: number; pearsonR: number; spearmanRho: number; rawP: number; qValue: number; score: number; relationshipConceptId: string; relatedAnalysisCount: number; pairingStrategy: PairingStrategy; pairingWindowDays: number; confidenceInterval?: { lower: number; upper: number }; stability?: Record<string, number> }
export interface DiscoveryReport { results: DiscoveryResult[]; allResults: DiscoveryResult[]; candidateCountBeforeFiltering: number; eligibleCandidateCount: number; testedRelationshipCount: number; rejectedCounts: Record<ExclusionReason, number> }

const EXCLUSION_REASONS: ExclusionReason[] = ['DIRECT_DERIVATION', 'SAME_EXERCISE_PERFORMANCE_REDUNDANCY', 'SAME_OBSERVATION_LEAKAGE', 'INSUFFICIENT_N', 'INCOMPATIBLE_PROTOCOL', 'DUPLICATE_SERIES'];

export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const ordered = pValues.map((p, index) => ({ p: Math.min(1, Math.max(0, p)), index })).sort((a, b) => a.p - b.p || a.index - b.index);
  const adjusted = Array(pValues.length).fill(1) as number[];
  let next = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) { const item = ordered[index]!; next = Math.min(next, item.p * ordered.length / (index + 1)); adjusted[item.index] = next; }
  return adjusted;
}

export function discoveryScore(result: Pick<DiscoveryResult, 'n' | 'pearsonR' | 'spearmanRho' | 'qValue'>): number {
  const effect = (Math.abs(result.pearsonR) + Math.abs(result.spearmanRho)) / 2;
  const agreement = Math.max(0, 1 - Math.abs(result.pearsonR - result.spearmanRho) / 2);
  const sample = Math.min(1, Math.log2(result.n) / Math.log2(30));
  return effect * agreement * sample * Math.max(.1, 1 - result.qValue);
}

function observationOverlap(x: NumericSeries, y: NumericSeries): number {
  const left = new Set(x.sourceObservationIds), right = new Set(y.sourceObservationIds);
  if (!left.size || !right.size) return 0;
  return [...left].filter((id) => right.has(id)).length / Math.min(left.size, right.size);
}

function duplicateSeries(x: NumericSeries, y: NumericSeries): boolean {
  if (x.metricFamily !== y.metricFamily) return false;
  if (x.observations.length !== y.observations.length) return false;
  return x.observations.every((item, index) => { const other = y.observations[index]; return item.date === other?.date && item.value === other.value && x.sourceObservationIds[index] === y.sourceObservationIds[index]; });
}

export function evaluateDiscoveryEligibility(x: NumericSeries, y: NumericSeries): EligibilityResult {
  if (duplicateSeries(x, y)) return { eligible: false, reason: 'DUPLICATE_SERIES' };
  if (x.derivedFrom.includes(y.id) || y.derivedFrom.includes(x.id)) return { eligible: false, reason: 'DIRECT_DERIVATION' };
  if (x.metadata.exerciseConcept === y.metadata.exerciseConcept && x.metadata.protocol !== y.metadata.protocol && x.metricFamily === 'PERFORMANCE' && y.metricFamily === 'PERFORMANCE') return { eligible: false, reason: 'INCOMPATIBLE_PROTOCOL' };
  if (x.metadata.exerciseConcept === y.metadata.exerciseConcept && x.metricFamily === 'PERFORMANCE' && y.metricFamily === 'PERFORMANCE') return { eligible: false, reason: 'SAME_EXERCISE_PERFORMANCE_REDUNDANCY' };
  if (x.metricFamily === y.metricFamily && observationOverlap(x, y) >= .8) return { eligible: false, reason: 'SAME_OBSERVATION_LEAKAGE' };
  return { eligible: true };
}

function relationshipConceptId(x: NumericSeries, y: NumericSeries): string { return [`${x.metadata.exerciseConcept}::${x.metricFamily}`, `${y.metadata.exerciseConcept}::${y.metricFamily}`].sort().join('↔'); }

export function discoverRelationshipsDetailed(registry: readonly NumericSeries[], options: { strategy?: PairingStrategy; maximumSeparationDays?: number; minimumN?: number } = {}): DiscoveryReport {
  const strategy = options.strategy ?? 'same-day', pairingWindowDays = options.maximumSeparationDays ?? 14, minimumN = options.minimumN ?? DEFAULT_DISCOVERY_MIN_N;
  const series = registry.filter((item) => item.discoveryEligible !== false && item.observations.length >= minimumN);
  const rejectedCounts = Object.fromEntries(EXCLUSION_REASONS.map((reason) => [reason, 0])) as Record<ExclusionReason, number>;
  const candidateCountBeforeFiltering = series.length * (series.length - 1) / 2;
  let eligibleCandidateCount = 0;
  const candidates: Omit<DiscoveryResult, 'qValue' | 'score' | 'relatedAnalysisCount'>[] = [];
  for (let xIndex = 0; xIndex < series.length; xIndex += 1) for (let yIndex = xIndex + 1; yIndex < series.length; yIndex += 1) {
    const x = series[xIndex]!, y = series[yIndex]!, eligibility = evaluateDiscoveryEligibility(x, y);
    if (!eligibility.eligible) { rejectedCounts[eligibility.reason!] += 1; continue; }
    eligibleCandidateCount += 1;
    const pairs = pairSeries(x.observations, y.observations, strategy, pairingWindowDays);
    if (pairs.length < minimumN) { rejectedCounts.INSUFFICIENT_N += 1; continue; }
    const summary = analyseSeries(x.observations, y.observations, strategy, pairingWindowDays);
    if (summary.pearsonR == null || summary.spearmanRho == null || summary.pearsonP == null) { rejectedCounts.INSUFFICIENT_N += 1; continue; }
    candidates.push({ xSeriesId: x.id, ySeriesId: y.id, xLabel: `${x.exercise}: ${x.label}`, yLabel: `${y.exercise}: ${y.label}`, n: summary.n, pearsonR: summary.pearsonR, spearmanRho: summary.spearmanRho, rawP: summary.pearsonP, relationshipConceptId: relationshipConceptId(x, y), pairingStrategy: strategy, pairingWindowDays });
  }
  const qValues = benjaminiHochberg(candidates.map((candidate) => candidate.rawP));
  const groupSizes = new Map<string, number>(); candidates.forEach((candidate) => groupSizes.set(candidate.relationshipConceptId, (groupSizes.get(candidate.relationshipConceptId) ?? 0) + 1));
  const allResults = candidates.map((candidate, index) => { const withQ = { ...candidate, qValue: qValues[index]!, relatedAnalysisCount: groupSizes.get(candidate.relationshipConceptId) ?? 1 }; return { ...withQ, score: discoveryScore(withQ) }; }).sort((a, b) => b.score - a.score || b.n - a.n || a.xLabel.localeCompare(b.xLabel));
  const seen = new Set<string>();
  const results = allResults.filter((result) => seen.has(result.relationshipConceptId) ? false : (seen.add(result.relationshipConceptId), true));
  return { results, allResults, candidateCountBeforeFiltering, eligibleCandidateCount, testedRelationshipCount: candidates.length, rejectedCounts };
}

export function discoverRelationships(registry: readonly NumericSeries[], options: { strategy?: PairingStrategy; maximumSeparationDays?: number; minimumN?: number } = {}): DiscoveryResult[] { return discoverRelationshipsDetailed(registry, options).results; }
