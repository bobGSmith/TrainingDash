export interface SeriesObservation {
  id: string;
  date: string;
  value: number;
  label: string;
  unit?: string;
  direction?: 'higher' | 'lower' | 'neutral';
  context?: string;
}

export interface PairedObservation {
  x: SeriesObservation;
  y: SeriesObservation;
  dayDifference: number;
}

export type PairingStrategy = 'same-day' | 'nearest';

export interface AnalysisSummary {
  pairs: PairedObservation[];
  n: number;
  pearsonR?: number;
  spearmanRho?: number;
  regression?: { slope: number; intercept: number };
}

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

export function pairSeries(
  xSeries: readonly SeriesObservation[],
  ySeries: readonly SeriesObservation[],
  strategy: PairingStrategy,
  maximumSeparationDays = 14,
): PairedObservation[] {
  const xs = [...xSeries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const ys = [...ySeries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const usedY = new Set<string>();
  const pairs: PairedObservation[] = [];

  for (const x of xs) {
    const candidates = ys
      .filter((y) => !usedY.has(y.id))
      .map((y) => ({ y, difference: dayNumber(y.date) - dayNumber(x.date) }))
      .filter(({ difference }) => strategy === 'same-day' ? difference === 0 : Math.abs(difference) <= maximumSeparationDays)
      .sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference) || a.y.date.localeCompare(b.y.date) || a.y.id.localeCompare(b.y.id));
    const match = candidates[0];
    if (!match) continue;
    usedY.add(match.y.id);
    pairs.push({ x, y: match.y, dayDifference: match.difference });
  }
  return pairs;
}

export function pearson(values: readonly [number, number][]): number | undefined {
  if (values.length < 2) return undefined;
  const xMean = values.reduce((sum, [x]) => sum + x, 0) / values.length;
  const yMean = values.reduce((sum, [, y]) => sum + y, 0) / values.length;
  let numerator = 0, xSquares = 0, ySquares = 0;
  for (const [x, y] of values) {
    const xd = x - xMean, yd = y - yMean;
    numerator += xd * yd;
    xSquares += xd * xd;
    ySquares += yd * yd;
  }
  const denominator = Math.sqrt(xSquares * ySquares);
  return denominator === 0 ? undefined : numerator / denominator;
}

function ranks(values: readonly number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length).fill(0) as number[];
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end]!.value === sorted[start]!.value) end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) result[sorted[index]!.index] = averageRank;
    start = end;
  }
  return result;
}

export function spearman(values: readonly [number, number][]): number | undefined {
  if (values.length < 2) return undefined;
  const xRanks = ranks(values.map(([x]) => x));
  const yRanks = ranks(values.map(([, y]) => y));
  return pearson(xRanks.map((rank, index) => [rank, yRanks[index]!]));
}

export function analyseSeries(
  xSeries: readonly SeriesObservation[],
  ySeries: readonly SeriesObservation[],
  strategy: PairingStrategy,
  maximumSeparationDays = 14,
): AnalysisSummary {
  const pairs = pairSeries(xSeries, ySeries, strategy, maximumSeparationDays);
  const values = pairs.map((pair): [number, number] => [pair.x.value, pair.y.value]);
  const pearsonR = pearson(values);
  const spearmanRho = spearman(values);
  let regression: AnalysisSummary['regression'];
  if (pearsonR != null) {
    const xMean = values.reduce((sum, [x]) => sum + x, 0) / values.length;
    const yMean = values.reduce((sum, [, y]) => sum + y, 0) / values.length;
    const denominator = values.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0);
    if (denominator > 0) {
      const slope = values.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0) / denominator;
      regression = { slope, intercept: yMean - slope * xMean };
    }
  }
  return { pairs, n: pairs.length, pearsonR, spearmanRho, regression };
}

