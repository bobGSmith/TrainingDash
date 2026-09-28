import { analyseSeries, pairSeries, type PairingStrategy } from './analysis';
import type { NumericSeries } from './analysisVariables';

export const DEFAULT_DISCOVERY_MIN_N = 6;
export type ExclusionReason = 'DIRECT_DERIVATION' | 'SAME_CONCEPT_REDUNDANCY' | 'SAME_OBSERVATION_LEAKAGE' | 'STRUCTURAL_RELATIONSHIP' | 'STATIC_SERIES' | 'INSUFFICIENT_N' | 'INCOMPATIBLE_PROTOCOL' | 'DUPLICATE_SERIES';
export interface EligibilityResult { eligible: boolean; reason?: ExclusionReason }
export interface DiscoveryResult { xSeriesId: string; ySeriesId: string; xLabel: string; yLabel: string; n: number; pearsonR: number; spearmanRho: number; rawP: number; qValue: number; score: number; semanticInterest: number; meanAbsoluteDateDifference: number; relationshipConceptId: string; relatedAnalysisCount: number; pairingStrategy: PairingStrategy; pairingWindowDays: number; confidenceInterval?: { lower: number; upper: number }; stability?: Record<string, number> }
export interface DiscoveryReport { results: DiscoveryResult[]; allResults: DiscoveryResult[]; candidateSeriesCount: number; candidateCountBeforeFiltering: number; eligibleCandidateCount: number; testedRelationshipCount: number; collapsedRelationshipCount: number; rejectedCounts: Record<ExclusionReason, number> }

const EXCLUSION_REASONS: ExclusionReason[] = ['DIRECT_DERIVATION', 'SAME_CONCEPT_REDUNDANCY', 'SAME_OBSERVATION_LEAKAGE', 'STRUCTURAL_RELATIONSHIP', 'STATIC_SERIES', 'INSUFFICIENT_N', 'INCOMPATIBLE_PROTOCOL', 'DUPLICATE_SERIES'];

export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const ordered = pValues.map((p, index) => ({ p: Math.min(1, Math.max(0, p)), index })).sort((a, b) => a.p - b.p || a.index - b.index);
  const adjusted = Array(pValues.length).fill(1) as number[];
  let next = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) { const item = ordered[index]!; next = Math.min(next, item.p * ordered.length / (index + 1)); adjusted[item.index] = next; }
  return adjusted;
}

export function discoveryScore(result: Pick<DiscoveryResult, 'n' | 'pearsonR' | 'spearmanRho' | 'qValue'> & Partial<Pick<DiscoveryResult, 'semanticInterest' | 'meanAbsoluteDateDifference' | 'pairingWindowDays'>>): number {
  const effect = (Math.abs(result.pearsonR) + Math.abs(result.spearmanRho)) / 2;
  const agreement = Math.max(0, 1 - Math.abs(result.pearsonR - result.spearmanRho) / 2);
  const sample = Math.min(1, Math.log2(result.n) / Math.log2(30));
  const temporalQuality = 1 - Math.min(1, (result.meanAbsoluteDateDifference ?? 0) / Math.max(1, result.pairingWindowDays ?? 1)) * .3;
  return effect * agreement * sample * Math.max(.1, 1 - result.qValue) * (result.semanticInterest ?? 1) * temporalQuality;
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
  if (new Set(x.observations.map((item) => item.value)).size < 2 || new Set(y.observations.map((item) => item.value)).size < 2) return { eligible: false, reason: 'STATIC_SERIES' };
  if (duplicateSeries(x, y)) return { eligible: false, reason: 'DUPLICATE_SERIES' };
  if (x.derivedFrom.includes(y.id) || y.derivedFrom.includes(x.id)) return { eligible: false, reason: 'DIRECT_DERIVATION' };
  if (x.metadata.exerciseConcept === y.metadata.exerciseConcept && x.metadata.protocol !== y.metadata.protocol && x.metricFamily === 'PERFORMANCE' && y.metricFamily === 'PERFORMANCE') return { eligible: false, reason: 'INCOMPATIBLE_PROTOCOL' };
  const sameConcept = x.metadata.exerciseConcept === y.metadata.exerciseConcept;
  if (sameConcept && (x.metricFamily === 'PERFORMANCE' && y.metricFamily === 'PERFORMANCE' || x.metadata.structuralVariable || y.metadata.structuralVariable || [x.metricFamily, y.metricFamily].includes('TRAINING_LOAD') && [x.metricFamily, y.metricFamily].includes('PERFORMANCE'))) return { eligible: false, reason: 'SAME_CONCEPT_REDUNDANCY' };
  if (x.metadata.structuralVariable && y.metadata.structuralVariable || x.metricFamily === 'TRAINING_LOAD' && y.metricFamily === 'TRAINING_LOAD') return { eligible: false, reason: 'STRUCTURAL_RELATIONSHIP' };
  if (x.metricFamily === y.metricFamily && observationOverlap(x, y) >= .8) return { eligible: false, reason: 'SAME_OBSERVATION_LEAKAGE' };
  if (semanticInterest(x, y) === 0) return { eligible: false, reason: 'STRUCTURAL_RELATIONSHIP' };
  return { eligible: true };
}

export function semanticInterest(x: NumericSeries, y: NumericSeries): number {
  const pair = new Set([x.metricFamily, y.metricFamily]);
  if (pair.has('PERFORMANCE') && pair.has('BODY_METRIC')) return 1.4;
  if (pair.has('TRAINING_LOAD') && pair.has('SYMPTOM')) return 1.4;
  if (pair.has('TRAINING_LOAD') && pair.has('RECOVERY')) return 1.3;
  if (pair.has('PERFORMANCE') && (pair.has('RECOVERY') || pair.has('SYMPTOM'))) return 1.25;
  if (pair.has('PERFORMANCE') && pair.has('EFFORT')) return 1.05;
  if (pair.has('PERFORMANCE') && pair.has('TRAINING_LOAD')) return .9;
  if (x.metricFamily === 'PERFORMANCE' && y.metricFamily === 'PERFORMANCE') return x.metadata.athleticQuality !== y.metadata.athleticQuality ? 1.3 : .75;
  if (pair.has('BODY_METRIC') && (pair.has('RECOVERY') || pair.has('SYMPTOM'))) return .9;
  return 0;
}

function relationshipConceptId(x: NumericSeries, y: NumericSeries): string { return [`${x.metadata.exerciseConcept}::${x.metricFamily}`, `${y.metadata.exerciseConcept}::${y.metricFamily}`].sort().join('↔'); }

export function discoverRelationshipsDetailed(registry: readonly NumericSeries[], options: { strategy?: PairingStrategy; maximumSeparationDays?: number; minimumN?: number } = {}): DiscoveryReport {
  const strategy = options.strategy ?? 'nearest', pairingWindowDays = options.maximumSeparationDays ?? 7, minimumN = options.minimumN ?? DEFAULT_DISCOVERY_MIN_N;
  const series = registry.filter((item) => item.discoveryEligible !== false && item.observations.length >= minimumN);
  const rejectedCounts = Object.fromEntries(EXCLUSION_REASONS.map((reason) => [reason, 0])) as Record<ExclusionReason, number>;
  const candidateCountBeforeFiltering = series.length * (series.length - 1) / 2;
  let eligibleCandidateCount = 0;
  const candidates: Omit<DiscoveryResult, 'qValue' | 'score' | 'relatedAnalysisCount'>[] = [];
  for (let xIndex = 0; xIndex < series.length; xIndex += 1) for (let yIndex = xIndex + 1; yIndex < series.length; yIndex += 1) {
    let x = series[xIndex]!, y = series[yIndex]!;
    const eligibility = evaluateDiscoveryEligibility(x, y);
    if (!eligibility.eligible) { rejectedCounts[eligibility.reason!] += 1; continue; }
    eligibleCandidateCount += 1;
    const outcome = (item: NumericSeries) => item.metricFamily === 'SYMPTOM' || item.metricFamily === 'RECOVERY';
    if (outcome(x) && !outcome(y)) [x, y] = [y, x];
    const pairStrategy: PairingStrategy = outcome(y) && (x.metricFamily === 'TRAINING_LOAD' || x.metricFamily === 'PERFORMANCE') ? 'forward-lag' : strategy;
    const pairWindow = pairStrategy === 'forward-lag' ? Math.min(3, pairingWindowDays) : pairingWindowDays;
    const pairs = pairSeries(x.observations, y.observations, pairStrategy, pairWindow);
    if (pairs.length < minimumN) { rejectedCounts.INSUFFICIENT_N += 1; continue; }
    const summary = analyseSeries(x.observations, y.observations, pairStrategy, pairWindow);
    if (summary.pearsonR == null || summary.spearmanRho == null || summary.pearsonP == null) { rejectedCounts.INSUFFICIENT_N += 1; continue; }
    const meanAbsoluteDateDifference = pairs.reduce((sum, pair) => sum + Math.abs(pair.dayDifference), 0) / pairs.length;
    candidates.push({ xSeriesId: x.id, ySeriesId: y.id, xLabel: `${x.exercise}: ${x.label}`, yLabel: `${y.exercise}: ${y.label}`, n: summary.n, pearsonR: summary.pearsonR, spearmanRho: summary.spearmanRho, rawP: summary.pearsonP, semanticInterest: semanticInterest(x, y), meanAbsoluteDateDifference, relationshipConceptId: relationshipConceptId(x, y), pairingStrategy: pairStrategy, pairingWindowDays: pairWindow });
  }
  const qValues = benjaminiHochberg(candidates.map((candidate) => candidate.rawP));
  const groupSizes = new Map<string, number>(); candidates.forEach((candidate) => groupSizes.set(candidate.relationshipConceptId, (groupSizes.get(candidate.relationshipConceptId) ?? 0) + 1));
  const allResults = candidates.map((candidate, index) => { const withQ = { ...candidate, qValue: qValues[index]!, relatedAnalysisCount: groupSizes.get(candidate.relationshipConceptId) ?? 1 }; return { ...withQ, score: discoveryScore(withQ) }; }).sort((a, b) => b.score - a.score || b.n - a.n || a.xLabel.localeCompare(b.xLabel));
  const seen = new Set<string>();
  const results = allResults.filter((result) => seen.has(result.relationshipConceptId) ? false : (seen.add(result.relationshipConceptId), true));
  return { results, allResults, candidateSeriesCount: series.length, candidateCountBeforeFiltering, eligibleCandidateCount, testedRelationshipCount: candidates.length, collapsedRelationshipCount: allResults.length - results.length, rejectedCounts };
}

export function discoverRelationships(registry: readonly NumericSeries[], options: { strategy?: PairingStrategy; maximumSeparationDays?: number; minimumN?: number } = {}): DiscoveryResult[] { return discoverRelationshipsDetailed(registry, options).results; }
