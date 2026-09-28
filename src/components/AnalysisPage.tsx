import { useMemo, useState } from 'react';
import type { NormalizedWorkbook } from '../data/normalized/types';
import { analyseSeries, type AnalysisSummary, type PairingStrategy, type PairedObservation } from '../domain/analysis';
import { buildAnalysisVariables, type AnalysisVariable } from '../domain/analysisVariables';
import { DEFAULT_DISCOVERY_MIN_N, discoverRelationshipsDetailed, type DiscoveryReport, type DiscoveryResult } from '../domain/discovery';

export function AnalysisPage({ data }: { data: NormalizedWorkbook }) {
  const variables = useMemo(() => buildAnalysisVariables(data), [data]);
  const exercises = [...new Set(variables.map((variable) => variable.exercise))];
  const initialX = variables.find((variable) => variable.metric.includes('load-')) ?? variables.find((variable) => variable.metric === 'intensity') ?? variables[0];
  const initialY = variables.find((variable) => variable.exercise !== initialX?.exercise && variable.metric === 'intensity') ?? variables[1] ?? variables[0];
  const [xId, setXId] = useState(initialX?.id ?? '');
  const [yId, setYId] = useState(initialY?.id ?? '');
  const [strategy, setStrategy] = useState<PairingStrategy>('same-day');
  const [windowDays, setWindowDays] = useState(14);
  const [showRegression, setShowRegression] = useState(true);
  const [mode, setMode] = useState<'explore' | 'discover'>('explore');
  const [minimumN, setMinimumN] = useState(DEFAULT_DISCOVERY_MIN_N);
  const x = variables.find((variable) => variable.id === xId) ?? initialX;
  const y = variables.find((variable) => variable.id === yId) ?? initialY;
  const summary = useMemo(() => x && y ? analyseSeries(x.series, y.series, strategy, windowDays) : undefined, [x, y, strategy, windowDays]);
  const discoveryReport = useMemo(() => discoverRelationshipsDetailed(variables, { strategy: 'same-day', minimumN }), [variables, minimumN]);

  const selectExercise = (axis: 'x' | 'y', exercise: string) => {
    const next = variables.find((variable) => variable.exercise === exercise);
    if (next) axis === 'x' ? setXId(next.id) : setYId(next.id);
  };

  const inspectDiscovery = (result: DiscoveryResult) => { setXId(result.xSeriesId); setYId(result.ySeriesId); setStrategy(result.pairingStrategy); setWindowDays(result.pairingWindowDays); setMode('explore'); };

  return <>
    <header className="page-header"><p className="eyebrow">Exploratory</p><h1>Analysis</h1><p>Explore associations between recorded variables. Pairing is explicit, raw points remain visible, and correlation does not establish causation.</p></header>
    <div className="analysis-tabs" role="tablist"><button role="tab" aria-selected={mode === 'explore'} className={mode === 'explore' ? 'active' : ''} onClick={() => setMode('explore')}>Explore</button><button role="tab" aria-selected={mode === 'discover'} className={mode === 'discover' ? 'active' : ''} onClick={() => setMode('discover')}>Discover</button></div>
    {mode === 'discover' ? <DiscoverView report={discoveryReport} minimumN={minimumN} onMinimumN={setMinimumN} onInspect={inspectDiscovery} /> : <>
    <section className="analysis-builder">
      <AxisSelector axis="X" variable={x} variables={variables} exercises={exercises} onExercise={(value) => selectExercise('x', value)} onVariable={setXId} />
      <div className="axis-link" aria-hidden="true">×</div>
      <AxisSelector axis="Y" variable={y} variables={variables} exercises={exercises} onExercise={(value) => selectExercise('y', value)} onVariable={setYId} />
    </section>
    <section className="panel pairing-controls">
      <label><span>Pairing method</span><select value={strategy} onChange={(event) => setStrategy(event.target.value as PairingStrategy)}><option value="same-day">Same day</option><option value="nearest">Nearest observation</option></select></label>
      {strategy === 'nearest' && <label><span>Maximum separation</span><select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))}>{[3, 7, 14, 30, 60].map((days) => <option value={days} key={days}>{days} days</option>)}</select></label>}
      <label className="check-control"><input type="checkbox" checked={showRegression} onChange={(event) => setShowRegression(event.target.checked)} /><span>Regression line</span></label>
      <p>{strategy === 'same-day' ? 'Observations are paired only when their dates match.' : `Each X observation is paired to the nearest unused Y observation within ${windowDays} days.`}</p>
    </section>
    {x && y && summary && <AnalysisResults x={x} y={y} summary={summary} showRegression={showRegression} />}
    </>}
  </>;
}

function DiscoverView({ report, minimumN, onMinimumN, onInspect }: { report: DiscoveryReport; minimumN: number; onMinimumN(value: number): void; onInspect(result: DiscoveryResult): void }) {
  const [showAll, setShowAll] = useState(false);
  const discoveries = showAll ? report.allResults : report.results;
  return <><section className="panel discovery-intro"><div><p className="eyebrow">Exploratory screening</p><h2>Relationships worth exploring</h2><p>Eligible series are paired on the same day, screened cheaply, and corrected together for multiple testing. Rankings prioritise effect size, sample size, FDR evidence, and agreement between Pearson and Spearman.</p></div><label className="select-label"><span>Minimum paired n</span><select value={minimumN} onChange={(event) => onMinimumN(Number(event.target.value))}>{[6, 8, 10, 12].map((value) => <option key={value}>{value}</option>)}</select></label></section>
    <div className="notice analysis-warning"><strong>Exploratory, not causal</strong><span>Shared trends over time and repeated training cycles can create associations. Raw points should be inspected before interpreting a result.</span></div>
    <div className="discovery-tools"><button className="secondary-button compact-button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show grouped shortlist' : `Show all ${report.allResults.length} eligible analyses`}</button><details><summary>Filtering diagnostics</summary><div><span>Candidate pairs before semantic filtering <strong>{report.candidateCountBeforeFiltering}</strong></span><span>Semantically eligible <strong>{report.eligibleCandidateCount}</strong></span><span>Statistically tested <strong>{report.testedRelationshipCount}</strong></span>{Object.entries(report.rejectedCounts).map(([reason, count]) => <span key={reason}>{reason.replaceAll('_', ' ').toLowerCase()} <strong>{count}</strong></span>)}</div></details></div>
    {discoveries.length ? <section className="discovery-list">{discoveries.slice(0, 30).map((result) => <button className="discovery-row" key={`${result.xSeriesId}:${result.ySeriesId}`} onClick={() => onInspect(result)}><div><strong>{result.xLabel}</strong><span>↔</span><strong>{result.yLabel}</strong></div><dl><div><dt>r</dt><dd>{result.pearsonR.toFixed(3)}</dd></div><div><dt>ρ</dt><dd>{result.spearmanRho.toFixed(3)}</dd></div><div><dt>n</dt><dd>{result.n}</dd></div><div><dt>p</dt><dd>{formatProbability(result.rawP)}</dd></div><div><dt>FDR q</dt><dd>{formatProbability(result.qValue)}</dd></div></dl><small>{result.relatedAnalysisCount > 1 ? `${result.relatedAnalysisCount} related · ` : ''}Inspect raw observations →</small></button>)}</section> : <div className="empty-state">No relationships have at least {minimumN} valid same-day pairs. This is a valid result—not enough data is preferable to a misleading correlation.</div>}
  </>;
}

function AxisSelector({ axis, variable, variables, exercises, onExercise, onVariable }: { axis: 'X' | 'Y'; variable?: AnalysisVariable; variables: AnalysisVariable[]; exercises: string[]; onExercise(value: string): void; onVariable(value: string): void }) {
  const available = variables.filter((item) => item.exercise === variable?.exercise);
  return <section className={`axis-selector axis-${axis.toLowerCase()}`}><div className="axis-badge">{axis}</div><label><span>Exercise / test</span><select value={variable?.exercise ?? ''} onChange={(event) => onExercise(event.target.value)}>{exercises.map((exercise) => <option key={exercise}>{exercise}</option>)}</select></label><label><span>Metric / variable</span><select value={variable?.id ?? ''} onChange={(event) => onVariable(event.target.value)}>{available.map((item) => <option value={item.id} key={item.id}>{item.label}{item.unit ? ` (${item.unit})` : ''}{item.derived ? ' · derived' : ''}</option>)}</select></label><small>{variable?.series.length ?? 0} recorded values · {variable?.direction === 'lower' ? 'lower is better' : variable?.direction === 'higher' ? 'higher is better' : 'no performance direction'}</small></section>;
}

function AnalysisResults({ x, y, summary, showRegression }: { x: AnalysisVariable; y: AnalysisVariable; summary: AnalysisSummary; showRegression: boolean }) {
  return <>
    <section className="analysis-stats"><Stat label="Paired observations" value={String(summary.n)} emphasize={summary.n < 5} /><Stat label="Pearson r" value={formatStatistic(summary.pearsonR)} /><Stat label="Spearman ρ" value={formatStatistic(summary.spearmanRho)} /><Stat label="Pearson p" value={summary.pearsonP == null ? '—' : formatProbability(summary.pearsonP)} /></section>
    {summary.n < 5 && <div className="notice analysis-warning"><strong>Small sample</strong><span>Only {summary.n} paired observation{summary.n === 1 ? '' : 's'}. Treat any apparent relationship as highly uncertain.</span></div>}
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Recorded relationship</p><h2>{x.exercise}: {x.label} vs {y.exercise}: {y.label}</h2></div></div><ScatterPlot pairs={summary.pairs} x={x} y={y} regression={showRegression ? summary.regression : undefined} /></section>
    {summary.pairs.length > 0 && <section className="panel"><h2>Paired observations</h2><div className="table-scroll"><table><thead><tr><th>X value</th><th>X date</th><th>Y value</th><th>Y date</th><th>Date difference</th></tr></thead><tbody>{summary.pairs.map((pair) => <tr key={`${pair.x.id}:${pair.y.id}`}><td>{pair.x.value} {x.unit}</td><td>{pair.x.date}</td><td>{pair.y.value} {y.unit}</td><td>{pair.y.date}</td><td>{formatDayDifference(pair.dayDifference)}</td></tr>)}</tbody></table></div></section>}
  </>;
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) { return <div className={emphasize ? 'stat caution' : 'stat'}><span>{label}</span><strong>{value}</strong></div>; }
function formatStatistic(value: number | undefined) { return value == null ? '—' : value.toFixed(3); }
function formatProbability(value: number) { return value < .001 ? '<0.001' : value.toFixed(3); }
function formatDayDifference(days: number) { return days === 0 ? 'Same day' : `${days > 0 ? '+' : ''}${days} day${Math.abs(days) === 1 ? '' : 's'}`; }

function ScatterPlot({ pairs, x, y, regression }: { pairs: PairedObservation[]; x: AnalysisVariable; y: AnalysisVariable; regression?: { slope: number; intercept: number } }) {
  const [selected, setSelected] = useState<PairedObservation>();
  if (!pairs.length) return <div className="empty-state">No observations meet this pairing rule. Try another variable, pairing method, or window.</div>;
  const width = 760, height = 390, left = 62, right = 24, top = 25, bottom = 55;
  const xs = pairs.map((pair) => pair.x.value), ys = pairs.map((pair) => pair.y.value);
  const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xPad = (xMax - xMin || Math.abs(xMax) || 1) * .08, yPad = (yMax - yMin || Math.abs(yMax) || 1) * .08;
  const sx = (value: number) => left + ((value - (xMin - xPad)) / (xMax - xMin + xPad * 2)) * (width - left - right);
  const sy = (value: number) => height - bottom - ((value - (yMin - yPad)) / (yMax - yMin + yPad * 2)) * (height - top - bottom);
  const lineStart = regression ? { x: xMin, y: regression.slope * xMin + regression.intercept } : undefined;
  const lineEnd = regression ? { x: xMax, y: regression.slope * xMax + regression.intercept } : undefined;
  return <div><div className="chart-wrap scatter"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Scatter plot of ${x.label} and ${y.label}`}><line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="axis" /><line x1={left} y1={top} x2={left} y2={height - bottom} className="axis" />{lineStart && lineEnd && <line x1={sx(lineStart.x)} y1={sy(lineStart.y)} x2={sx(lineEnd.x)} y2={sy(lineEnd.y)} className="regression-line" />}{pairs.map((pair) => <g className="scatter-point" key={`${pair.x.id}:${pair.y.id}`} onClick={() => setSelected(pair)}><circle cx={sx(pair.x.value)} cy={sy(pair.y.value)} r="8" /><title>{pair.x.value} {x.unit} / {pair.y.value} {y.unit}</title></g>)}<text x={width / 2} y={height - 10} className="chart-label axis-title">{x.exercise} · {x.label}{x.unit ? ` (${x.unit})` : ''}</text><text x={8} y={16} className="chart-label">{y.exercise} · {y.label}{y.unit ? ` (${y.unit})` : ''}</text></svg></div>{selected && <div className="point-detail"><strong>{selected.x.value} {x.unit} ↔ {selected.y.value} {y.unit}</strong><span>X: {selected.x.date} · Y: {selected.y.date} · {formatDayDifference(selected.dayDifference)}</span><p>{[selected.x.context, selected.y.context].filter(Boolean).join(' / ') || 'No additional context recorded.'}</p></div>}</div>;
}
