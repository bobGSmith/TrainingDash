import { analyseSeries, type PairingStrategy } from './analysis';
import type { NumericSeries } from './analysisVariables';

export const DEFAULT_DISCOVERY_MIN_N = 6;

export interface DiscoveryResult {
  xSeriesId: string;
  ySeriesId: string;
  xLabel: string;
  yLabel: string;
  n: number;
  pearsonR: number;
  spearmanRho: number;
  rawP: number;
  qValue: number;
  score: number;
  pairingStrategy: PairingStrategy;
  pairingWindowDays: number;
  confidenceInterval?: { lower: number; upper: number };
  stability?: Record<string, number>;
}

export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const ordered = pValues.map((p, index) => ({ p: Math.min(1, Math.max(0, p)), index })).sort((a, b) => a.p - b.p || a.index - b.index);
  const adjusted = Array(pValues.length).fill(1) as number[];
  let next = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const item = ordered[index]!;
    next = Math.min(next, item.p * ordered.length / (index + 1));
    adjusted[item.index] = next;
  }
  return adjusted;
}

export function discoveryScore(result: Pick<DiscoveryResult, 'n' | 'pearsonR' | 'spearmanRho' | 'qValue'>): number {
  const effect = (Math.abs(result.pearsonR) + Math.abs(result.spearmanRho)) / 2;
  const agreement = Math.max(0, 1 - Math.abs(result.pearsonR - result.spearmanRho) / 2);
  const sample = Math.min(1, Math.log2(result.n) / Math.log2(30));
  const evidence = Math.max(.1, 1 - result.qValue);
  return effect * agreement * sample * evidence;
}

function sameObservations(x: NumericSeries, y: NumericSeries): boolean {
  if (x.observations.length !== y.observations.length) return false;
  return x.observations.every((item, index) => {
    const other = y.observations[index];
    if (!other || item.date !== other.date || item.value !== other.value) return false;
    if (item.sourceReference && other.sourceReference) return item.sourceReference.tab === other.sourceReference.tab && item.sourceReference.rowNumber === other.sourceReference.rowNumber;
    return item.id === other.id;
  });
}

export function discoverRelationships(
  registry: readonly NumericSeries[],
  options: { strategy?: PairingStrategy; maximumSeparationDays?: number; minimumN?: number } = {},
): DiscoveryResult[] {
  const strategy = options.strategy ?? 'same-day';
  const pairingWindowDays = options.maximumSeparationDays ?? 14;
  const minimumN = options.minimumN ?? DEFAULT_DISCOVERY_MIN_N;
  const eligible = registry.filter((series) => series.discoveryEligible !== false && series.observations.length >= minimumN);
  const candidates: Omit<DiscoveryResult, 'qValue' | 'score'>[] = [];
  for (let xIndex = 0; xIndex < eligible.length; xIndex += 1) {
    for (let yIndex = xIndex + 1; yIndex < eligible.length; yIndex += 1) {
      const x = eligible[xIndex]!, y = eligible[yIndex]!;
      if (sameObservations(x, y)) continue;
      const summary = analyseSeries(x.observations, y.observations, strategy, pairingWindowDays);
      if (summary.n < minimumN || summary.pearsonR == null || summary.spearmanRho == null || summary.pearsonP == null) continue;
      candidates.push({ xSeriesId: x.id, ySeriesId: y.id, xLabel: `${x.exercise}: ${x.label}`, yLabel: `${y.exercise}: ${y.label}`, n: summary.n, pearsonR: summary.pearsonR, spearmanRho: summary.spearmanRho, rawP: summary.pearsonP, pairingStrategy: strategy, pairingWindowDays });
    }
  }
  const qValues = benjaminiHochberg(candidates.map((candidate) => candidate.rawP));
  return candidates.map((candidate, index) => {
    const withQ = { ...candidate, qValue: qValues[index]! };
    return { ...withQ, score: discoveryScore(withQ) };
  }).sort((a, b) => b.score - a.score || b.n - a.n || a.xLabel.localeCompare(b.xLabel));
}
