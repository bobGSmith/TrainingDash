import { useMemo, useState } from 'react';
import type { NormalizedWorkbook, SprintPerformance } from '../data/normalized/types';
import { jumpPBs, sprintPBs } from '../domain/pb';
import { buildPerformanceCurve, compatibleCurveExercises } from '../domain/performanceCurve';
import { PerformanceCurve, ProgressChart, StrengthEstimateChart, type ChartDatum } from './Charts';
import { filterSprintPerformances } from '../domain/sprint';
import { bestActualPerformance, DEFAULT_STRENGTH_WINDOW_DAYS, estimatedOneRepMaxObservations, estimateCurrentStrength, isBodyweightAugmentedExercise, repSpecificProgression, strengthSetObservations, strengthStateProgression, weeklyStrengthExposure } from '../domain/strength';

function PageHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></header>;
}

export function SprintPage({ data }: { data: NormalizedWorkbook }) {
  const tests = [...new Set(data.sprints.map((item) => item.test))];
  const [test, setTest] = useState(tests[0] ?? '');
  const [surface, setSurface] = useState('All');
  const [footwear, setFootwear] = useState('All');
  const [leadIn, setLeadIn] = useState('All');
  const leadInFilter = leadIn === 'All' ? undefined : leadIn === 'Unknown' ? 'unknown' as const : Number(leadIn);
  const filtered = filterSprintPerformances(data.sprints, { test, surface, footwear, leadInMetres: leadInFilter });
  const leadIns = [...new Set(data.sprints.filter((item) => item.test === test && item.leadInMetres != null).map((item) => item.leadInMetres!))].sort((a, b) => a - b);
  const pb = sprintPBs(filtered)[0];
  const chart: ChartDatum[] = [...filtered].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((item) => ({ id: String(item.rowNumber), date: item.date, value: item.timeSeconds, label: `${item.test} · ${item.timeSeconds}s`, detail: sprintDetail(item) }));
  return <><PageHeader eyebrow="Speed" title="Sprint performance" copy="Compare timed performances without losing protocol or conditions." />
    <section className="panel controls"><label>Test<select value={test} onChange={(e) => { setTest(e.target.value); setLeadIn('All'); }}>{tests.map((value) => <option key={value}>{value}</option>)}</select></label><label>Surface<select value={surface} onChange={(e) => setSurface(e.target.value)}>{['All', ...new Set(data.sprints.map((x) => x.surface).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label><label>Footwear<select value={footwear} onChange={(e) => setFootwear(e.target.value)}>{['All', ...new Set(data.sprints.map((x) => x.footwear).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label><label>Lead-in<select value={leadIn} onChange={(e) => setLeadIn(e.target.value)}><option>All</option>{leadIns.map((value) => <option value={String(value)} key={value}>{value} m</option>)}<option>Unknown</option></select></label></section>
    {pb && <section className="metric-hero"><span>Best in current filter</span><strong>{pb.timeSeconds.toFixed(3)} s</strong><p>{pb.date ?? 'Unknown date'} · {sprintDetail(pb)}</p></section>}
    <section className="panel"><h2>Performance over time</h2><ProgressChart data={chart} lowerIsBetter unit="s" /></section>
    <ObservationTable rows={filtered.map((x) => ({ date: x.date, performance: `${x.timeSeconds}s`, context: sprintDetail(x) }))} />
  </>;
}

function sprintDetail(item: SprintPerformance) { return [item.surface ?? 'surface unknown', item.footwear ?? 'footwear unknown', item.startType, item.leadInMetres != null ? `${item.leadInMetres}m lead-in` : 'lead-in unknown', item.effortPercent != null ? `${item.effortPercent}% effort` : undefined, item.symptoms, item.notes].filter(Boolean).join(' · '); }

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
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Rep-specific progression</p><h2>Actual demonstrated load</h2></div>{selectedReps != null && <label className="select-label"><span>Rep count</span><select value={selectedReps} onChange={(event) => setRepSelection(Number(event.target.value))}>{repCounts.map((reps) => <option value={reps} key={reps}>{reps} reps</option>)}</select></label>}</div><ProgressChart unit="kg" data={repProgression.map((item) => ({ id: item.id, date: item.date, value: item.loadKg, label: `${item.loadKg} kg × ${item.reps}`, detail: [item.rpe != null ? `RPE ${item.rpe}` : 'RPE unknown', item.session, item.rawExtra, item.symptoms, item.notes].filter(Boolean).join(' · ') }))} /><p className="muted">Only new recorded load bests at exactly {selectedReps ?? 'the selected'} reps are connected. No rep counts are converted or interpolated.</p></section>
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
