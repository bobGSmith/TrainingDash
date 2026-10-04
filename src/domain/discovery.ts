import { analyseSeries, pairSeries, pearson, pearsonPValue, spearman, type PairedObservation, type PairingStrategy } from './analysis';
import type { DiscoveryDomain, NumericSeries } from './analysisVariables';

export const DEFAULT_DISCOVERY_MIN_N = 8;
export const DISCOVERY_EVIDENCE_THRESHOLDS = { insufficientN: 8, supportedN: 12, supportedEffect: .4, supportedQ: .2, strongN: 15, strongEffect: .5, strongQ: .1 } as const;

export type EvidenceTier = 'INSUFFICIENT' | 'EXPLORATORY' | 'SUPPORTED' | 'STRONG';
export type RelationshipClass = 'CROSS_CONCEPT_PERFORMANCE' | 'BODY_METRIC_PERFORMANCE' | 'EXPOSURE_DELAYED_SYMPTOM' | 'EXPOSURE_LATER_PERFORMANCE' | 'EXPOSURE_RECOVERY' | 'STATE_PERFORMANCE' | 'PERFORMANCE_EFFORT' | 'OTHER';
export type ExclusionReason =
  | 'DIRECT_DERIVATION' | 'SHARED_DERIVATION' | 'DUPLICATE_TRANSFORMATION' | 'DUPLICATE_SERIES'
  | 'SAME_EXERCISE_PERFORMANCE_REDUNDANCY' | 'SAME_EXERCISE_EFFORT_COUPLING' | 'LOW_VALUE_RPE_RELATIONSHIP'
  | 'TRAINING_PRESCRIPTION_COUPLING' | 'SAME_SESSION_TRAINING_COUPLING' | 'SAME_OBSERVATION_LEAKAGE'
  | 'STRUCTURAL_STRUCTURAL' | 'INCOMPATIBLE_PROTOCOL' | 'STATIC_SERIES' | 'INSUFFICIENT_N'
  | 'WEAK_EFFECT' | 'DIRECTION_DISAGREEMENT' | 'POOR_FDR' | 'TEMPORAL_DIRECTION_INVALID'
  | 'DUPLICATE_CONCEPTUAL_FAMILY';

export interface EligibilityResult { eligible: boolean; reason?: ExclusionReason; relationshipClass?: RelationshipClass; semanticValue?: number }
export interface DiscoveryResult {
  xSeriesId: string; ySeriesId: string; xLabel: string; yLabel: string;
  xDirection: NumericSeries['direction']; yDirection: NumericSeries['direction'];
  n: number; pearsonR: number; spearmanRho: number; rawP: number; qValue: number; score: number;
  semanticInterest: number; meanAbsoluteDateDifference: number; relationshipConceptId: string;
  relationshipClass: RelationshipClass; evidenceTier: EvidenceTier; relatedAnalysisCount: number;
  pairingStrategy: PairingStrategy; pairingWindowDays: number; minimumLagDays: number; lagLabel: string;
  associationText: string; confidenceInterval?: { lower: number; upper: number }; stability?: Record<string, number>;
}
export interface DiscoveryReport {
  results: DiscoveryResult[]; interestingResults: DiscoveryResult[]; exploratoryResults: DiscoveryResult[]; allResults: DiscoveryResult[];
  totalNumericSeriesCount: number; candidateSeriesCount: number; candidateCountBeforeFiltering: number; eligibleCandidateCount: number;
  testedRelationshipCount: number; evidenceSurvivorCount: number; collapsedRelationshipCount: number;
  insufficientEvidenceCandidates: Array<{ xLabel: string; yLabel: string; n: number; relationshipClass: RelationshipClass; lagLabel: string }>;
  rejectedCounts: Record<ExclusionReason, number>;
}

const EXCLUSION_REASONS: ExclusionReason[] = [
  'DIRECT_DERIVATION', 'SHARED_DERIVATION', 'DUPLICATE_TRANSFORMATION', 'DUPLICATE_SERIES',
  'SAME_EXERCISE_PERFORMANCE_REDUNDANCY', 'SAME_EXERCISE_EFFORT_COUPLING', 'LOW_VALUE_RPE_RELATIONSHIP',
  'TRAINING_PRESCRIPTION_COUPLING', 'SAME_SESSION_TRAINING_COUPLING', 'SAME_OBSERVATION_LEAKAGE',
  'STRUCTURAL_STRUCTURAL', 'INCOMPATIBLE_PROTOCOL', 'STATIC_SERIES', 'INSUFFICIENT_N', 'WEAK_EFFECT',
  'DIRECTION_DISAGREEMENT', 'POOR_FDR', 'TEMPORAL_DIRECTION_INVALID', 'DUPLICATE_CONCEPTUAL_FAMILY',
];

export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const ordered = pValues.map((p, index) => ({ p: Math.min(1, Math.max(0, p)), index })).sort((a, b) => a.p - b.p || a.index - b.index);
  const adjusted = Array(pValues.length).fill(1) as number[];
  let next = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) { const item = ordered[index]!; next = Math.min(next, item.p * ordered.length / (index + 1)); adjusted[item.index] = next; }
  return adjusted;
}

function domain(series: NumericSeries): DiscoveryDomain {
  if (series.metadata.domain) return series.metadata.domain;
  if (series.metricFamily === 'TRAINING_LOAD' || series.metricFamily === 'EFFORT') return 'TRAINING_EXPOSURE';
  return series.metricFamily;
}
function concept(series: NumericSeries): string { return series.metadata.discoveryConcept ?? series.metadata.athleticQuality ?? `${series.metricFamily}:${series.metadata.exerciseConcept}`; }
function exerciseId(series: NumericSeries): string { return series.metadata.exerciseId ?? series.metadata.exerciseConcept.toLowerCase(); }
function isExerciseRpe(series: NumericSeries): boolean { return series.metadata.effortScope === 'EXERCISE' || series.metadata.discoveryConcept === 'EXERCISE_RPE' || series.metric === 'rpe'; }
function isPrescription(series: NumericSeries): boolean { return series.metadata.trainingPrescription === true || series.metadata.structuralVariable === true; }

function overlap(leftValues: readonly string[] | undefined, rightValues: readonly string[] | undefined): number {
  const left = new Set(leftValues ?? []), right = new Set(rightValues ?? []);
  if (!left.size || !right.size) return 0;
  return [...left].filter((id) => right.has(id)).length / Math.min(left.size, right.size);
}
function duplicateSeries(x: NumericSeries, y: NumericSeries): boolean {
  if (x.observations.length !== y.observations.length) return false;
  return x.observations.every((item, index) => { const other = y.observations[index]; return item.date === other?.date && item.value === other.value && x.sourceObservationIds[index] === y.sourceObservationIds[index]; });
}

function relationshipUtility(x: NumericSeries, y: NumericSeries): { relationshipClass: RelationshipClass; semanticValue: number } {
  const xd = domain(x), yd = domain(y), domains = new Set([xd, yd]);
  if (xd === 'PERFORMANCE' && yd === 'PERFORMANCE' && concept(x) !== concept(y)) return { relationshipClass: 'CROSS_CONCEPT_PERFORMANCE', semanticValue: 1.65 };
  if (domains.has('BODY_METRIC') && domains.has('PERFORMANCE')) return { relationshipClass: 'BODY_METRIC_PERFORMANCE', semanticValue: 1.75 };
  if (domains.has('TRAINING_EXPOSURE') && domains.has('SYMPTOM')) return { relationshipClass: 'EXPOSURE_DELAYED_SYMPTOM', semanticValue: 2 };
  if (domains.has('TRAINING_EXPOSURE') && domains.has('RECOVERY')) return { relationshipClass: 'EXPOSURE_RECOVERY', semanticValue: 1.8 };
  if (domains.has('TRAINING_EXPOSURE') && domains.has('PERFORMANCE')) return { relationshipClass: 'EXPOSURE_LATER_PERFORMANCE', semanticValue: 1.4 };
  if (((xd === 'RECOVERY' || xd === 'SYMPTOM') && yd === 'PERFORMANCE') || ((yd === 'RECOVERY' || yd === 'SYMPTOM') && xd === 'PERFORMANCE')) return { relationshipClass: 'STATE_PERFORMANCE', semanticValue: 1.7 };
  if (new Set([x.metricFamily, y.metricFamily]).has('EFFORT') && domains.has('PERFORMANCE')) return { relationshipClass: 'PERFORMANCE_EFFORT', semanticValue: 1.05 };
  return { relationshipClass: 'OTHER', semanticValue: 0 };
}

export function evaluateDiscoveryEligibility(x: NumericSeries, y: NumericSeries): EligibilityResult {
  if (new Set(x.observations.map((item) => item.value)).size < 2 || new Set(y.observations.map((item) => item.value)).size < 2) return { eligible: false, reason: 'STATIC_SERIES' };
  if (duplicateSeries(x, y)) return { eligible: false, reason: 'DUPLICATE_SERIES' };
  if (x.derivedFrom.includes(y.id) || y.derivedFrom.includes(x.id)) return { eligible: false, reason: 'DIRECT_DERIVATION' };
  if (x.derivedFrom.some((id) => y.derivedFrom.includes(id)) && (x.derived || y.derived)) return { eligible: false, reason: 'SHARED_DERIVATION' };
  const sameExercise = exerciseId(x) === exerciseId(y);
  if (sameExercise && x.metadata.measurementProtocol !== y.metadata.measurementProtocol && domain(x) === 'PERFORMANCE' && domain(y) === 'PERFORMANCE') return { eligible: false, reason: 'INCOMPATIBLE_PROTOCOL' };
  if (sameExercise && domain(x) === 'PERFORMANCE' && domain(y) === 'PERFORMANCE') return { eligible: false, reason: 'SAME_EXERCISE_PERFORMANCE_REDUNDANCY' };
  if (sameExercise && ((domain(x) === 'PERFORMANCE' && isExerciseRpe(y)) || (domain(y) === 'PERFORMANCE' && isExerciseRpe(x)))) return { eligible: false, reason: 'SAME_EXERCISE_EFFORT_COUPLING' };
  if (isExerciseRpe(x) || isExerciseRpe(y)) return { eligible: false, reason: 'LOW_VALUE_RPE_RELATIONSHIP' };
  if (isPrescription(x) && isPrescription(y)) return { eligible: false, reason: 'TRAINING_PRESCRIPTION_COUPLING' };
  if (isPrescription(x) || isPrescription(y)) return { eligible: false, reason: 'TRAINING_PRESCRIPTION_COUPLING' };
  const trainingLike = (series: NumericSeries) => domain(series) === 'TRAINING_EXPOSURE' || isPrescription(series);
  if (trainingLike(x) && trainingLike(y) && overlap(x.metadata.sourceSessionIds, y.metadata.sourceSessionIds) >= .5) return { eligible: false, reason: 'SAME_SESSION_TRAINING_COUPLING' };
  if (x.metadata.structuralVariable && y.metadata.structuralVariable) return { eligible: false, reason: 'STRUCTURAL_STRUCTURAL' };
  const sourceOverlap = overlap(x.sourceObservationIds, y.sourceObservationIds);
  if (sourceOverlap >= .8) {
    if (sameExercise && domain(x) === 'PERFORMANCE' && domain(y) === 'PERFORMANCE' && (x.derived || y.derived)) return { eligible: false, reason: 'DUPLICATE_TRANSFORMATION' };
    return { eligible: false, reason: 'SAME_OBSERVATION_LEAKAGE' };
  }
  const utility = relationshipUtility(x, y);
  if (utility.semanticValue === 0) return { eligible: false, reason: 'STRUCTURAL_STRUCTURAL' };
  return { eligible: true, ...utility };
}

export function semanticInterest(x: NumericSeries, y: NumericSeries): number { return relationshipUtility(x, y).semanticValue; }
export function classifyEvidence(result: Pick<DiscoveryResult, 'n' | 'pearsonR' | 'spearmanRho' | 'qValue'>): EvidenceTier {
  const directionsAgree = Math.sign(result.pearsonR) === Math.sign(result.spearmanRho);
  if (result.n < DISCOVERY_EVIDENCE_THRESHOLDS.insufficientN) return 'INSUFFICIENT';
  if (result.n >= DISCOVERY_EVIDENCE_THRESHOLDS.strongN && Math.abs(result.pearsonR) >= DISCOVERY_EVIDENCE_THRESHOLDS.strongEffect && Math.abs(result.spearmanRho) >= DISCOVERY_EVIDENCE_THRESHOLDS.strongEffect && directionsAgree && result.qValue <= DISCOVERY_EVIDENCE_THRESHOLDS.strongQ) return 'STRONG';
  if (result.n >= DISCOVERY_EVIDENCE_THRESHOLDS.supportedN && Math.abs(result.pearsonR) >= DISCOVERY_EVIDENCE_THRESHOLDS.supportedEffect && Math.abs(result.spearmanRho) >= DISCOVERY_EVIDENCE_THRESHOLDS.supportedEffect && directionsAgree && result.qValue <= DISCOVERY_EVIDENCE_THRESHOLDS.supportedQ) return 'SUPPORTED';
  return 'EXPLORATORY';
}
export function discoveryScore(result: Pick<DiscoveryResult, 'n' | 'pearsonR' | 'spearmanRho' | 'qValue'> & Partial<Pick<DiscoveryResult, 'semanticInterest' | 'meanAbsoluteDateDifference' | 'pairingWindowDays' | 'evidenceTier'>>): number {
  const effect = (Math.abs(result.pearsonR) + Math.abs(result.spearmanRho)) / 2;
  const agreement = Math.sign(result.pearsonR) === Math.sign(result.spearmanRho) ? Math.max(.5, 1 - Math.abs(Math.abs(result.pearsonR) - Math.abs(result.spearmanRho))) : .15;
  const evidence = result.evidenceTier === 'STRONG' ? 1.8 : result.evidenceTier === 'SUPPORTED' ? 1.4 : .45;
  const sample = Math.min(1.2, Math.log2(result.n) / Math.log2(20));
  const temporalQuality = 1 - Math.min(1, (result.meanAbsoluteDateDifference ?? 0) / Math.max(1, result.pairingWindowDays ?? 1)) * .35;
  return (result.semanticInterest ?? 1) * evidence * effect * agreement * sample * Math.max(.1, 1 - result.qValue) * temporalQuality;
}

function dayNumber(date: string): number { return Date.parse(`${date}T00:00:00Z`) / 86_400_000; }
function pairForwardRange(x: NumericSeries, y: NumericSeries, minimumDays: number, maximumDays: number): PairedObservation[] {
  const xs = [...x.observations].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const ys = [...y.observations].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const used = new Set<string>();
  return xs.flatMap((left) => {
    const match = ys.filter((right) => !used.has(right.id)).map((right) => ({ right, difference: dayNumber(right.date) - dayNumber(left.date) })).filter(({ difference }) => difference >= minimumDays && difference <= maximumDays).sort((a, b) => a.difference - b.difference || a.right.date.localeCompare(b.right.date) || a.right.id.localeCompare(b.right.id))[0];
    if (!match) return [];
    used.add(match.right.id);
    return [{ x: left, y: match.right, dayDifference: match.difference, xValue: left.value, yValue: match.right.value, xDate: left.date, yDate: match.right.date, xObservationReference: left.sourceReference, yObservationReference: match.right.sourceReference }];
  });
}
function analysePairs(pairs: PairedObservation[]) {
  const values = pairs.map((pair): [number, number] => [pair.x.value, pair.y.value]);
  const pearsonR = pearson(values), spearmanRho = spearman(values);
  return { n: pairs.length, pearsonR, spearmanRho, pearsonP: pearsonPValue(pearsonR, pairs.length) };
}
function orient(x: NumericSeries, y: NumericSeries, relationshipClass: RelationshipClass): [NumericSeries, NumericSeries] {
  if (relationshipClass === 'EXPOSURE_DELAYED_SYMPTOM' || relationshipClass === 'EXPOSURE_LATER_PERFORMANCE' || relationshipClass === 'EXPOSURE_RECOVERY') return domain(x) === 'TRAINING_EXPOSURE' ? [x, y] : [y, x];
  if (relationshipClass === 'STATE_PERFORMANCE') return domain(x) === 'RECOVERY' || domain(x) === 'SYMPTOM' ? [x, y] : [y, x];
  return [x, y];
}
function pairingFor(x: NumericSeries, relationshipClass: RelationshipClass, defaultStrategy: PairingStrategy, maximumDays: number) {
  if (relationshipClass === 'EXPOSURE_DELAYED_SYMPTOM') return { strategy: 'forward-lag-delayed' as const, minimumDays: 1, maximumDays: Math.min(3, maximumDays), label: `+1–${Math.min(3, maximumDays)} days` };
  if (relationshipClass === 'EXPOSURE_RECOVERY') return { strategy: 'forward-lag-delayed' as const, minimumDays: 1, maximumDays, label: `+1–${maximumDays} days` };
  if (relationshipClass === 'EXPOSURE_LATER_PERFORMANCE') return { strategy: 'forward-lag-delayed' as const, minimumDays: 1, maximumDays, label: `+1–${maximumDays} days` };
  if (relationshipClass === 'STATE_PERFORMANCE' && x.metadata.timepoint?.toLowerCase().includes('morning')) return { strategy: 'same-day' as const, minimumDays: 0, maximumDays: 0, label: 'Same day' };
  return { strategy: defaultStrategy, minimumDays: 0, maximumDays, label: defaultStrategy === 'same-day' ? 'Same day' : `Nearest ±${maximumDays} days` };
}
function relationshipConceptId(x: NumericSeries, y: NumericSeries): string { return [`${exerciseId(x)}::${concept(x)}`, `${exerciseId(y)}::${concept(y)}`].sort().join('↔'); }
function associationText(x: NumericSeries, y: NumericSeries, pearsonR: number, relationshipClass: RelationshipClass): string {
  if (relationshipClass === 'EXPOSURE_DELAYED_SYMPTOM') return `${pearsonR >= 0 ? 'Higher' : 'Lower'} recorded ${x.label.toLowerCase()} was associated with ${pearsonR >= 0 ? 'greater' : 'lower'} later ${y.label.toLowerCase()}.`;
  const performanceDirection = (series: NumericSeries) => series.direction === 'lower' ? -1 : series.direction === 'higher' ? 1 : 0;
  if (domain(x) === 'PERFORMANCE' && domain(y) === 'PERFORMANCE' && performanceDirection(x) && performanceDirection(y)) {
    const aligned = Math.sign(pearsonR) === Math.sign(performanceDirection(x) * performanceDirection(y));
    return `Better ${x.exercise.toLowerCase()} performance was associated with ${aligned ? 'better' : 'poorer'} ${y.exercise.toLowerCase()} performance.`;
  }
  return `${pearsonR >= 0 ? 'Higher' : 'Lower'} recorded ${x.label.toLowerCase()} was associated with ${pearsonR >= 0 ? 'higher' : 'lower'} ${y.label.toLowerCase()}.`;
}
function evidenceFailure(result: DiscoveryResult): ExclusionReason | undefined {
  if (result.evidenceTier !== 'EXPLORATORY') return undefined;
  if (Math.sign(result.pearsonR) !== Math.sign(result.spearmanRho)) return 'DIRECTION_DISAGREEMENT';
  if (Math.abs(result.pearsonR) < DISCOVERY_EVIDENCE_THRESHOLDS.supportedEffect || Math.abs(result.spearmanRho) < DISCOVERY_EVIDENCE_THRESHOLDS.supportedEffect) return 'WEAK_EFFECT';
  if (result.qValue > DISCOVERY_EVIDENCE_THRESHOLDS.supportedQ) return 'POOR_FDR';
  return 'INSUFFICIENT_N';
}

export function discoverRelationshipsDetailed(registry: readonly NumericSeries[], options: { strategy?: PairingStrategy; maximumSeparationDays?: number; minimumN?: number } = {}): DiscoveryReport {
  const strategy = options.strategy ?? 'nearest', pairingWindowDays = options.maximumSeparationDays ?? 7, minimumN = Math.max(DISCOVERY_EVIDENCE_THRESHOLDS.insufficientN, options.minimumN ?? DEFAULT_DISCOVERY_MIN_N);
  const discoverable = registry.filter((item) => item.discoveryEligible !== false);
  const rejectedCounts = Object.fromEntries(EXCLUSION_REASONS.map((reason) => [reason, 0])) as Record<ExclusionReason, number>;
  const series = discoverable.filter((item) => item.observations.length >= 2 && new Set(item.observations.map((observation) => observation.value)).size >= 2);
  rejectedCounts.STATIC_SERIES = discoverable.length - series.length;
  const candidateCountBeforeFiltering = series.length * (series.length - 1) / 2;
  let eligibleCandidateCount = 0;
  const insufficientEvidenceCandidates: DiscoveryReport['insufficientEvidenceCandidates'] = [];
  const candidates: Array<Omit<DiscoveryResult, 'qValue' | 'score' | 'evidenceTier' | 'relatedAnalysisCount' | 'associationText'>> = [];
  for (let xIndex = 0; xIndex < series.length; xIndex += 1) for (let yIndex = xIndex + 1; yIndex < series.length; yIndex += 1) {
    const eligibility = evaluateDiscoveryEligibility(series[xIndex]!, series[yIndex]!);
    if (!eligibility.eligible) { rejectedCounts[eligibility.reason!] += 1; continue; }
    eligibleCandidateCount += 1;
    const [x, y] = orient(series[xIndex]!, series[yIndex]!, eligibility.relationshipClass!);
    const pairing = pairingFor(x, eligibility.relationshipClass!, strategy, pairingWindowDays);
    if (pairing.maximumDays < pairing.minimumDays) { rejectedCounts.TEMPORAL_DIRECTION_INVALID += 1; continue; }
    const pairs = pairing.minimumDays > 0 ? pairForwardRange(x, y, pairing.minimumDays, pairing.maximumDays) : pairSeries(x.observations, y.observations, pairing.strategy, pairing.maximumDays);
    if (pairs.length < minimumN) {
      rejectedCounts.INSUFFICIENT_N += 1;
      if (pairs.length >= 2) insufficientEvidenceCandidates.push({ xLabel: `${x.exercise}: ${x.label}`, yLabel: `${y.exercise}: ${y.label}`, n: pairs.length, relationshipClass: eligibility.relationshipClass!, lagLabel: pairing.label });
      continue;
    }
    const summary = pairing.minimumDays > 0 ? analysePairs(pairs) : analyseSeries(x.observations, y.observations, pairing.strategy, pairing.maximumDays);
    if (summary.pearsonR == null || summary.spearmanRho == null || summary.pearsonP == null) { rejectedCounts.INSUFFICIENT_N += 1; continue; }
    candidates.push({ xSeriesId: x.id, ySeriesId: y.id, xLabel: `${x.exercise}: ${x.label}`, yLabel: `${y.exercise}: ${y.label}`, xDirection: x.direction, yDirection: y.direction, n: summary.n, pearsonR: summary.pearsonR, spearmanRho: summary.spearmanRho, rawP: summary.pearsonP, semanticInterest: eligibility.semanticValue!, meanAbsoluteDateDifference: pairs.reduce((sum, pair) => sum + Math.abs(pair.dayDifference), 0) / pairs.length, relationshipConceptId: relationshipConceptId(x, y), relationshipClass: eligibility.relationshipClass!, pairingStrategy: pairing.strategy, pairingWindowDays: pairing.maximumDays, minimumLagDays: pairing.minimumDays, lagLabel: pairing.label });
  }
  const qValues = benjaminiHochberg(candidates.map((candidate) => candidate.rawP));
  const groupSizes = new Map<string, number>(); candidates.forEach((candidate) => groupSizes.set(candidate.relationshipConceptId, (groupSizes.get(candidate.relationshipConceptId) ?? 0) + 1));
  const allResults = candidates.map((candidate, index): DiscoveryResult => {
    const base = { ...candidate, qValue: qValues[index]!, relatedAnalysisCount: groupSizes.get(candidate.relationshipConceptId) ?? 1 };
    const evidenceTier = classifyEvidence(base);
    const x = series.find((item) => item.id === base.xSeriesId)!, y = series.find((item) => item.id === base.ySeriesId)!;
    const result: DiscoveryResult = { ...base, evidenceTier, associationText: associationText(x, y, base.pearsonR, base.relationshipClass), score: 0 };
    result.score = discoveryScore(result);
    const failure = evidenceFailure(result); if (failure) rejectedCounts[failure] += 1;
    return result;
  }).sort((a, b) => b.score - a.score || b.n - a.n || a.xLabel.localeCompare(b.xLabel));
  const collapse = (input: DiscoveryResult[]) => { const seen = new Set<string>(); return input.filter((result) => seen.has(result.relationshipConceptId) ? (rejectedCounts.DUPLICATE_CONCEPTUAL_FAMILY += 1, false) : (seen.add(result.relationshipConceptId), true)); };
  const interestingResults = collapse(allResults.filter((result) => result.evidenceTier === 'SUPPORTED' || result.evidenceTier === 'STRONG'));
  const exploratoryResults = collapse(allResults.filter((result) => result.evidenceTier === 'EXPLORATORY'));
  insufficientEvidenceCandidates.sort((a, b) => b.n - a.n || a.relationshipClass.localeCompare(b.relationshipClass));
  return { results: interestingResults, interestingResults, exploratoryResults, allResults, totalNumericSeriesCount: registry.length, candidateSeriesCount: series.length, candidateCountBeforeFiltering, eligibleCandidateCount, testedRelationshipCount: candidates.length, evidenceSurvivorCount: interestingResults.length, collapsedRelationshipCount: allResults.length - new Set(allResults.map((result) => result.relationshipConceptId)).size, insufficientEvidenceCandidates, rejectedCounts };
}

export function discoverRelationships(registry: readonly NumericSeries[], options: { strategy?: PairingStrategy; maximumSeparationDays?: number; minimumN?: number } = {}): DiscoveryResult[] { return discoverRelationshipsDetailed(registry, options).results; }
