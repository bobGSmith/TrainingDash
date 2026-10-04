export interface SeriesObservation {
  id: string;
  date: string;
  value: number;
  label: string;
  unit?: string;
  direction?: 'higher' | 'lower' | 'neutral';
  context?: string;
  sourceReference?: { tab: string; rowNumber: number };
  metadata?: Record<string, unknown>;
}

export interface PairedObservation {
  x: SeriesObservation;
  y: SeriesObservation;
  dayDifference: number;
  xValue: number;
  yValue: number;
  xDate: string;
  yDate: string;
  xObservationReference?: SeriesObservation['sourceReference'];
  yObservationReference?: SeriesObservation['sourceReference'];
}

export type PairingStrategy = 'same-day' | 'nearest' | 'forward-lag' | 'forward-lag-delayed';

export interface AnalysisSummary {
  pairs: PairedObservation[];
  n: number;
  pearsonR?: number;
  spearmanRho?: number;
  pearsonP?: number;
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
      .filter(({ difference }) => strategy === 'same-day' ? difference === 0 : strategy === 'forward-lag' ? difference >= 0 && difference <= maximumSeparationDays : strategy === 'forward-lag-delayed' ? difference >= 1 && difference <= maximumSeparationDays : Math.abs(difference) <= maximumSeparationDays)
      .sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference) || a.y.date.localeCompare(b.y.date) || a.y.id.localeCompare(b.y.id));
    const match = candidates[0];
    if (!match) continue;
    usedY.add(match.y.id);
    pairs.push({ x, y: match.y, dayDifference: match.difference, xValue: x.value, yValue: match.y.value, xDate: x.date, yDate: match.y.date, xObservationReference: x.sourceReference, yObservationReference: match.y.sourceReference });
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

// Lanczos log-gamma and continued-fraction incomplete beta, used for a two-sided
// Student-t p-value without adding a heavyweight statistics dependency.
function logGamma(value: number): number {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (value < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  let x = .9999999999998099;
  const z = value - 1;
  coefficients.forEach((coefficient, index) => { x += coefficient / (z + index + 1); });
  const t = z + coefficients.length - .5;
  return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a: number, b: number, x: number): number {
  const maxIterations = 200, epsilon = 3e-12, floor = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const m2 = 2 * iteration;
    let term = iteration * (b - iteration) * x / ((qam + m2) * (a + m2));
    d = 1 + term * d; if (Math.abs(d) < floor) d = floor;
    c = 1 + term / c; if (Math.abs(c) < floor) c = floor;
    d = 1 / d; result *= d * c;
    term = -(a + iteration) * (qab + iteration) * x / ((a + m2) * (qap + m2));
    d = 1 + term * d; if (Math.abs(d) < floor) d = floor;
    c = 1 + term / c; if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? front * betaFraction(a, b, x) / a : 1 - front * betaFraction(b, a, 1 - x) / b;
}

export function pearsonPValue(r: number | undefined, n: number): number | undefined {
  if (r == null || n < 3 || !Number.isFinite(r)) return undefined;
  if (Math.abs(r) >= 1) return 0;
  const degrees = n - 2;
  const tSquared = r * r * degrees / (1 - r * r);
  return regularizedBeta(degrees / (degrees + tSquared), degrees / 2, .5);
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
  const pearsonP = pearsonPValue(pearsonR, pairs.length);
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
  return { pairs, n: pairs.length, pearsonR, spearmanRho, pearsonP, regression };
}
