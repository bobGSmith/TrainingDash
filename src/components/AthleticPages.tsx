import { useMemo, useState } from 'react';
import type { NormalizedWorkbook, SprintPerformance } from '../data/normalized/types';
import { jumpPBs } from '../domain/pb';
import { buildPerformanceCurve, compatibleCurveExercises } from '../domain/performanceCurve';
import { PerformanceCurve, ProgressChart, SprintProgressChart, StrengthEstimateChart } from './Charts';
import { filterSprintPerformances } from '../domain/sprint';
import { bestActualPerformance, DEFAULT_STRENGTH_WINDOW_DAYS, estimatedOneRepMaxObservations, estimateCurrentStrength, isBodyweightAugmentedExercise, repSpecificProgression, strengthSetObservations, strengthStateProgression, weeklyStrengthExposure } from '../domain/strength';
import { protocolAwarePBs, speedRetention, sprintConsistency, sprintProtocolFamily, sprintSessionSummaries, sprintSpeedMetric } from '../domain/sprintAnalysis';
import { formatSprintConditions, formatSprintObservationDetailText, formatSprintObservationSummary, sprintObservationDetails } from '../domain/sprintPresentation';

function PageHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></header>;
}

export function SprintPage({ data }: { data: NormalizedWorkbook }) {
  const tests = [...new Set(data.sprints.map((item) => item.test))];
  const [test, setTest] = useState(tests[0] ?? '');
  const [surface, setSurface] = useState('All');
  const [footwear, setFootwear] = useState('All');
  const [leadIn, setLeadIn] = useState('All');
  const [startType, setStartType] = useState('All');
  const [timingMethod, setTimingMethod] = useState('All');
  const [metricMode, setMetricMode] = useState<'time' | 'speed'>('time');
  const [flyLeadIn, setFlyLeadIn] = useState('All');
  const leadInFilter = leadIn === 'All' ? undefined : leadIn === 'Unknown' ? 'unknown' as const : Number(leadIn);
  const filtered = filterSprintPerformances(data.sprints, { test, surface, footwear, leadInMetres: leadInFilter, startType, timingMethod });
  const leadIns = [...new Set(data.sprints.filter((item) => item.test === test && item.leadInMetres != null).map((item) => item.leadInMetres!))].sort((a, b) => a - b);
  const starts = ['All', ...new Set(data.sprints.filter((item) => item.test === test).map((item) => item.startType ?? 'Unknown'))];
  const timingMethods = ['All', ...new Set(data.sprints.filter((item) => item.test === test).map((item) => item.timingMethod ?? 'Unknown'))];
  const metrics = filtered.flatMap((item) => { const metric = sprintSpeedMetric(item); return metric ? [metric] : []; });
  const sessionSummaries = sprintSessionSummaries(filtered);
  const summaryPBs = protocolAwarePBs(data.sprints)
    .sort((a, b) => a.timeSeconds - b.timeSeconds)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.test === item.test) === index);
  const flyLeadFilter = flyLeadIn === 'All' ? undefined : flyLeadIn === 'Unknown' ? 'unknown' as const : Number(flyLeadIn);
  const flyRows = data.sprints.filter((item) => sprintProtocolFamily(item) === 'FLYING');
  const flyLeadIns = [...new Set(flyRows.filter((item) => item.leadInMetres != null).map((item) => item.leadInMetres!))].sort((a, b) => a - b);
  const flyMetrics = filterSprintPerformances(flyRows, { surface, footwear, leadInMetres: flyLeadFilter }).flatMap((item) => { const metric = sprintSpeedMetric(item); return metric ? [metric] : []; }).sort((a, b) => b.averageSpeedMS - a.averageSpeedMS);
  const bestFly = flyMetrics[0];
  const flyProtocolCount = new Set(flyMetrics.map((item) => [item.observation.distanceMetres, item.observation.leadInMetres, item.observation.timingMethod, item.observation.surface, item.observation.footwear].map((value) => value ?? 'unknown').join('|'))).size;
  const longSprints = data.sprints.filter((item) => sprintProtocolFamily(item) === 'RACE_LONG_SPRINT').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const retention = bestFly ? longSprints.flatMap((item) => { const result = speedRetention(item, bestFly.observation); return result ? [result] : []; }) : [];
  const consistency = sprintConsistency(filtered);
  const protocolCount = new Set(filtered.map((item) => [item.startType, item.leadInMetres, item.timingMethod, item.surface, item.footwear].map((value) => value ?? 'unknown').join('|'))).size;
  return <><PageHeader eyebrow="Speed" title="Sprint performance" copy="Actual performances, transparent speed metrics, and protocol-aware sprint profiles." />
    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">Sprint performance summary</p><h2>Fastest actual result by test</h2></div></div><div className="sprint-summary">{summaryPBs.map((item) => { const speed = sprintSpeedMetric(item); const conditions = formatSprintConditions(item); return <div className="sprint-metric" key={`${item.tab}:${item.rowNumber}:${item.test}`}><span>{item.test}</span><strong>{item.timeSeconds.toFixed(3)} s</strong>{speed && <b>{speed.averageSpeedMS.toFixed(2)} m/s · {speed.averageSpeedKMH.toFixed(1)} km/h</b>}<small>{[item.date, conditions].filter(Boolean).join(' · ') || 'Date and conditions not recorded'}</small></div>; })}</div><p className="muted">Each card identifies the known structured conditions of the fastest recorded result. It does not imply that other protocols are equivalent.</p></section>
    <section className="panel controls sprint-controls"><label>Test<select value={test} onChange={(e) => { setTest(e.target.value); setLeadIn('All'); setStartType('All'); setTimingMethod('All'); }}>{tests.map((value) => <option key={value}>{value}</option>)}</select></label><label>Surface<select value={surface} onChange={(e) => setSurface(e.target.value)}>{['All', ...new Set(data.sprints.map((x) => x.surface).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label><label>Footwear<select value={footwear} onChange={(e) => setFootwear(e.target.value)}>{['All', ...new Set(data.sprints.map((x) => x.footwear).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label><label>Start<select value={startType} onChange={(e) => setStartType(e.target.value)}>{starts.map((value) => <option key={value}>{value}</option>)}</select></label><label>Lead-in<select value={leadIn} onChange={(e) => setLeadIn(e.target.value)}><option>All</option>{leadIns.map((value) => <option value={String(value)} key={value}>{value} m</option>)}<option>Unknown</option></select></label><label>Timing<select value={timingMethod} onChange={(e) => setTimingMethod(e.target.value)}>{timingMethods.map((value) => <option key={value}>{value}</option>)}</select></label></section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Performance over time</p><h2>{test}</h2></div><label className="select-label"><span>Y axis</span><select value={metricMode} onChange={(event) => setMetricMode(event.target.value as 'time' | 'speed')}><option value="time">Time</option><option value="speed">Average speed</option></select></label></div>{protocolCount > 1 && <div className="notice analysis-warning"><strong>Multiple protocols visible</strong><span>Unrestricted points remain visible but are not assumed equivalent. Use the filters for like-for-like analysis. PB progression is hidden until one compatible protocol remains.</span></div>}<SprintProgressChart metrics={metrics} sessionSummaries={sessionSummaries} mode={metricMode} showPbProgression={protocolCount <= 1} /><p className="muted">Session mean and ±1 sample SD use recorded work reps only. Rows explicitly marked as warm-up or recorded below 90% effort are excluded; slower reps are not automatically classified as warm-ups.</p>{consistency && <div className="consistency-strip"><span>Last {consistency.n}</span><strong>Best {consistency.bestSeconds.toFixed(3)} s</strong><strong>Median {consistency.medianSeconds.toFixed(3)} s</strong><strong>Range {consistency.minimumSeconds.toFixed(3)}–{consistency.maximumSeconds.toFixed(3)} s</strong>{consistency.coefficientOfVariation != null && <strong>CV {consistency.coefficientOfVariation.toFixed(1)}%</strong>}</div>}</section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Speed / velocity metrics</p><h2>Flying sprint analysis</h2></div><label className="select-label"><span>Fly lead-in</span><select value={flyLeadIn} onChange={(event) => setFlyLeadIn(event.target.value)}><option>All</option>{flyLeadIns.map((value) => <option value={value} key={value}>{value} m</option>)}<option>Unknown</option></select></label></div>{bestFly ? <><div className="metric-hero derived-metric"><span>Fly-zone average speed · derived</span><strong>{bestFly.averageSpeedMS.toFixed(2)} m/s</strong><p>{formatSprintObservationSummary(bestFly.observation)}</p><SprintObservationDetails observation={bestFly.observation} /></div>{flyProtocolCount > 1 && <p className="muted">Multiple fly protocols are visible; filter the lead-in and conditions for a restrictive comparison. PB progression is not drawn across incompatible protocols.</p>}<SprintProgressChart metrics={flyMetrics} mode="speed" showPbProgression={flyProtocolCount <= 1} /></> : <div className="empty-state">No valid flying sprint observations.</div>}<p className="muted">This is average speed across the timed fly zone—a proxy for max-velocity ability, not instantaneous maximum velocity.</p></section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Speed endurance</p><h2>Long sprint performance</h2></div></div>{longSprints.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>Test</th><th>Actual time</th><th>Average speed</th><th>Average-speed retention</th></tr></thead><tbody>{longSprints.map((item) => { const speed = sprintSpeedMetric(item); const retained = retention.find((entry) => entry.longSprint.observation.tab === item.tab && entry.longSprint.observation.rowNumber === item.rowNumber); return <tr key={`${item.tab}:${item.rowNumber}`}><td>{item.date ?? 'Unknown'}</td><td>{item.test}</td><td>{item.timeSeconds.toFixed(3)} s</td><td>{speed ? `${speed.averageSpeedMS.toFixed(2)} m/s` : '—'}</td><td>{retained ? `${retained.retentionPercent.toFixed(1)}%` : '—'}</td></tr>; })}</tbody></table></div> : <div className="empty-state">No long sprint performances recorded.</div>}<p className="muted">Average-speed retention compares whole-run average speed with the best recorded fly-zone average. Standing-start acceleration is included, so this is descriptive—not a pure velocity-decay or physiological score.</p></section>
    <details className="panel sprint-details"><summary>Protocol, conditions and actual observations</summary><ObservationTable rows={filtered.map((x) => ({ date: x.date, performance: `${x.timeSeconds}s`, context: formatSprintObservationDetailText(x) }))} /></details>
    <details className="panel sprint-details"><summary>Future advanced metrics</summary><p className="muted">The architecture supports documented multi-input prediction models, estimated capability over time, actual-vs-model calibration, athlete-specific models once sample size is adequate, and within-session rep sequencing when explicitly recorded.</p></details>
  </>;
}

function SprintObservationDetails({ observation }: { observation: SprintPerformance }) {
  const details = sprintObservationDetails(observation);
  const rows = [
    ['Date', details.date], ['Original test', details.test], ['Time', `${details.timeSeconds.toFixed(3)} s`],
    ['Distance', details.distanceMetres == null ? undefined : `${details.distanceMetres} m`],
    ['Average speed', details.averageSpeedMS == null ? undefined : `${details.averageSpeedMS.toFixed(2)} m/s · ${details.averageSpeedKMH?.toFixed(1)} km/h`],
    ['Lead-in', details.leadInMetres == null ? undefined : `${details.leadInMetres} m`], ['Surface', details.surface],
    ['Footwear', details.footwear], ['Start', details.startType], ['Timing', details.timingMethod], ['Session', details.session],
    ['Symptoms', details.symptoms], ['Notes', details.notes], ['Source', `${details.source.tab} row ${details.source.rowNumber}`],
  ].filter((row): row is string[] => Boolean(row[1]));
  return <details className="metric-details"><summary>View details</summary><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>;
}

export function JumpPage({ data }: { data: NormalizedWorkbook }) {
  const identities = [...new Set(data.jumps.map((item) => `${item.test}|${item.unit}`))];
  const [identity, setIdentity] = useState(identities[0] ?? '');
  const [test, unit] = identity.split('|');
  const rows = data.jumps.filter((item) => item.test === test && item.unit === unit);
  const pb = jumpPBs(rows)[0];
  return <><PageHeader eyebrow="Power" title="Jumping" copy="Distinct tests and measurement units remain separate." />
    <section className="panel controls"><label>Test<select value={identity} onChange={(e) => setIdentity(e.target.value)}>{identities.map((value) => { const [name, measure] = value.split('|'); return <option value={value} key={value}>{name} ({measure})</option>; })}</select></label></section>
    {pb && <section className="metric-hero"><span>Current recorded best</span><strong>{pb.result} {pb.unit}</strong><p>{pb.date ?? 'Unknown date'} · {[pb.surface, pb.footwear].filter(Boolean).join(' · ') || 'Conditions unknown'}</p></section>}
    <section className="panel"><h2>Performance over time</h2><ProgressChart unit={unit ?? ''} data={rows.sort((a,b)=>(a.date??'').localeCompare(b.date??'')).map((item) => ({ id: String(item.rowNumber), date: item.date, value: item.result, label: `${item.test} · ${item.result}${item.unit}`, detail: [item.surface, item.footwear, item.symptoms, item.notes].filter(Boolean).join(' · ') }))} /></section>
  </>;
}

export function StrengthPage({ data }: { data: NormalizedWorkbook }) {
  const allStrength = useMemo(() => strengthSetObservations(data.training), [data.training]);
  const exercises = compatibleCurveExercises(data.training).filter((exercise) => allStrength.some((row) => row.exercise === exercise));
  const [exercise, setExercise] = useState(exercises[0] ?? '');
  const [windowDays, setWindowDays] = useState(DEFAULT_STRENGTH_WINDOW_DAYS);
  const [repSelection, setRepSelection] = useState(5);
  const observations = allStrength.filter((row) => row.exercise === exercise);
  const e1rm = estimatedOneRepMaxObservations(observations);
  const state = strengthStateProgression(e1rm, { windowDays });
  const latestDate = observations.map((item) => item.date).sort().at(-1);
  const current = latestDate ? estimateCurrentStrength(e1rm, latestDate, { windowDays }) : undefined;
  const contributing = new Set(current?.contributingObservationIds ?? []);
  const bestRecent = e1rm.filter((item) => contributing.has(item.id)).sort((a, b) => b.e1rmKg - a.e1rmKg)[0];
  const actual = bestActualPerformance(observations);
  const priorDate = latestDate ? new Date(Date.parse(`${latestDate}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10) : undefined;
  const prior = priorDate ? estimateCurrentStrength(e1rm, priorDate, { windowDays }) : undefined;
  const change = current && prior ? current.estimatedStrengthKg - prior.estimatedStrengthKg : undefined;
  const repCounts = [...new Set(observations.map((item) => item.reps))].sort((a, b) => a - b);
  const selectedReps = repCounts.includes(repSelection) ? repSelection : repCounts[0];
  const repProgression = selectedReps == null ? [] : repSpecificProgression(observations, selectedReps);
  const exposure = weeklyStrengthExposure(observations).slice(-8).reverse();
  const curve = useMemo(() => buildPerformanceCurve(data.training, exercise), [data.training, exercise]);
  return <><PageHeader eyebrow="Capacity" title="Strength" copy="Modelled current strength, actual rep-specific progress, and demonstrated load–repetition capacity." />
    <section className="panel controls"><label>Exercise<select value={exercise} onChange={(e) => setExercise(e.target.value)}>{exercises.map((value) => <option key={value}>{value}</option>)}</select></label></section>
    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">Current strength summary</p><h2>{exercise}</h2></div></div>{isBodyweightAugmentedExercise(exercise) ? <div className="notice analysis-warning"><strong>e1RM unsupported</strong><span>This exercise requires historical bodyweight plus external load. Its actual observations remain available without a misleading external-load-only estimate.</span></div> : <div className="strength-summary">{current && <SummaryMetric label="Estimated current 1RM" value={`~${current.estimatedStrengthKg.toFixed(1)} kg`} detail={`${windowDays}-day upper-performance model`} estimated />}{bestRecent && <SummaryMetric label="Best recent estimate" value={`${bestRecent.e1rmKg.toFixed(1)} kg`} detail={`${bestRecent.loadKg} kg × ${bestRecent.reps} · ${bestRecent.date}`} estimated />}{actual && <SummaryMetric label="Best actual performance" value={`${actual.loadKg} kg × ${actual.reps}`} detail={actual.date} />}{change != null && <SummaryMetric label="90-day model change" value={`${change >= 0 ? '+' : ''}${change.toFixed(1)} kg`} detail={`${change >= 0 ? '+' : ''}${(change / prior!.estimatedStrengthKg * 100).toFixed(1)}%`} estimated />}</div>}</section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Estimated 1RM over time</p><h2>Raw estimates vs current strength</h2></div><label className="select-label"><span>Rolling window</span><select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))}>{[30, 45, 60, 90].map((days) => <option value={days} key={days}>{days} days</option>)}</select></label></div><StrengthEstimateChart observations={e1rm} state={state} /><p className="muted">Epley estimates use positive 1–12 rep performances. The model line is the mean of up to the two best estimates in the selected recent window; it is not a formal confidence interval.</p></section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Load–rep performance curve</p><h2>Demonstrated capacity</h2></div></div>{curve ? <PerformanceCurve curve={curve} /> : <div className="empty-state">No compatible reps × kg observations.</div>}<h2>Current demonstrated frontier</h2><div className="frontier-cards">{curve?.frontier.map((point) => <div key={point.observation.rowNumber}><strong>{point.intensity} kg</strong><span>× {point.amount} reps</span><small>{point.observation.date ?? 'Date unknown'}{point.observation.rawExtra ? ` · ${point.observation.rawExtra}` : ''}</small></div>)}</div></section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Rep-specific progression</p><h2>Actual demonstrated load</h2></div>{selectedReps != null && <label className="select-label"><span>Rep count</span><select value={selectedReps} onChange={(event) => setRepSelection(Number(event.target.value))}>{repCounts.map((reps) => <option value={reps} key={reps}>{reps} reps</option>)}</select></label>}</div><ProgressChart unit="kg" yAxisLabel="Load" labelPoints data={repProgression.map((item) => ({ id: item.id, date: item.date, value: item.loadKg, label: `${item.loadKg} kg × ${item.reps}`, detail: [item.rpe != null ? `RPE ${item.rpe}` : 'RPE unknown', item.session, item.rawExtra, item.symptoms, item.notes].filter(Boolean).join(' · ') }))} /><p className="muted">Only new recorded load bests at exactly {selectedReps ?? 'the selected'} reps are connected. No rep counts are converted or interpolated.</p></section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Training exposure</p><h2>Recent weekly work</h2></div></div>{exposure.length ? <div className="table-scroll exposure-table"><table><thead><tr><th>Week starting</th><th>Sessions</th><th>Known work sets</th><th>Known reps</th><th>Tonnage</th></tr></thead><tbody>{exposure.map((week) => <tr key={week.weekStart}><td>{week.weekStart}</td><td>{week.sessions}</td><td>{week.workSets ?? 'Unknown'}</td><td>{week.totalReps ?? 'Unknown'}</td><td>{week.tonnageKg != null ? `${week.tonnageKg.toLocaleString()} kg` : 'Unknown'}</td></tr>)}</tbody></table></div> : <div className="empty-state">No exposure data for this exercise.</div>}<p className="muted">Tonnage is shown only for conventional reps × kg rows with recorded sets. It describes exposure, not training effect.</p></section>
  </>;
}

function SummaryMetric({ label, value, detail, estimated = false }: { label: string; value: string; detail: string; estimated?: boolean }) { return <div className={estimated ? 'strength-metric estimated' : 'strength-metric'}><span>{label}</span><strong>{value}</strong><small>{estimated ? 'Modelled · ' : 'Recorded · '}{detail}</small></div>; }

export function TrainingPage({ data }: { data: NormalizedWorkbook }) {
  const dates = [...new Set(data.training.map((row) => row.date).filter(Boolean))].sort().reverse();
  return <><PageHeader eyebrow="Performed work" title="Training history" copy="Only Full Session tracking is counted here; Program remains intended work." />
    <div className="session-list">{dates.slice(0, 12).map((date) => { const rows = data.training.filter((row) => row.date === date); return <section className="panel session" key={date}><div><strong>{date}</strong><span>{[...new Set(rows.map((r) => r.session).filter(Boolean))].join(' / ')}</span></div><ul>{rows.map((row) => <li key={row.rowNumber}><strong>{row.exercise ?? row.category}</strong><span>{[row.sets ?? row.setsText, row.amount, row.amountUnit, row.intensity, row.intensityUnit].filter((x) => x != null).join(' ')}</span></li>)}</ul></section>; })}</div>
  </>;
}

export function RecoveryPage({ data }: { data: NormalizedWorkbook }) {
  return <><PageHeader eyebrow="Observational" title="Recovery & symptoms" copy="Training exposure and recovery observations aligned by date; associations do not establish causation." />
    <div className="timeline">{[...data.dailyStatus].sort((a,b)=>(b.date??'').localeCompare(a.date??'')).map((item) => <article className="panel" key={item.rowNumber}><time>{item.date ?? 'Date unknown'} · {item.timepoint ?? 'Timepoint unknown'}</time><h2>{item.context ?? 'Observation'}</h2><p>{item.notes ?? 'No notes recorded.'}</p>{item.extra && <div className="metadata-chips">{Object.entries(item.extra).map(([key,value]) => <span key={key}>{key.replaceAll('_',' ')}: {String(value)}</span>)}</div>}</article>)}</div>
  </>;
}

function ObservationTable({ rows }: { rows: Array<{ date?: string; performance: string; context: string }> }) { return <section className="panel"><h2>Observations</h2><div className="table-scroll"><table><thead><tr><th>Date</th><th>Performance</th><th>Known context</th></tr></thead><tbody>{rows.map((row,index)=><tr key={index}><td>{row.date ?? 'Unknown'}</td><td>{row.performance}</td><td>{row.context}</td></tr>)}</tbody></table></div></section>; }
