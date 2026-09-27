import { useMemo, useState } from 'react';
import type { NormalizedWorkbook, SprintPerformance } from '../data/normalized/types';
import { jumpPBs, liftingPBFrontier, sprintPBs } from '../domain/pb';
import { buildPerformanceCurve, compatibleCurveExercises } from '../domain/performanceCurve';
import { PerformanceCurve, ProgressChart, type ChartDatum } from './Charts';

function PageHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></header>;
}

export function SprintPage({ data }: { data: NormalizedWorkbook }) {
  const tests = [...new Set(data.sprints.map((item) => item.test))];
  const [test, setTest] = useState(tests[0] ?? '');
  const [surface, setSurface] = useState('All');
  const [footwear, setFootwear] = useState('All');
  const filtered = data.sprints.filter((item) => item.test === test && (surface === 'All' || item.surface === surface) && (footwear === 'All' || item.footwear === footwear));
  const pb = sprintPBs(filtered)[0];
  const chart: ChartDatum[] = [...filtered].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((item) => ({ id: String(item.rowNumber), date: item.date, value: item.timeSeconds, label: `${item.test} · ${item.timeSeconds}s`, detail: sprintDetail(item) }));
  return <><PageHeader eyebrow="Speed" title="Sprint performance" copy="Compare timed performances without losing protocol or conditions." />
    <section className="panel controls"><label>Test<select value={test} onChange={(e) => setTest(e.target.value)}>{tests.map((value) => <option key={value}>{value}</option>)}</select></label><label>Surface<select value={surface} onChange={(e) => setSurface(e.target.value)}>{['All', ...new Set(data.sprints.map((x) => x.surface).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label><label>Footwear<select value={footwear} onChange={(e) => setFootwear(e.target.value)}>{['All', ...new Set(data.sprints.map((x) => x.footwear).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label></section>
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
  const exercises = compatibleCurveExercises(data.training).filter((exercise) => data.strength.some((row) => row.exercise === exercise));
  const [exercise, setExercise] = useState(exercises[0] ?? '');
  const curve = useMemo(() => buildPerformanceCurve(data.training, exercise), [data.training, exercise]);
  const frontier = liftingPBFrontier(data.strength.filter((row) => row.exercise === exercise));
  return <><PageHeader eyebrow="Capacity" title="Strength" copy="Actual demonstrated load–repetition capacity, separate from estimates." />
    <section className="panel controls"><label>Exercise<select value={exercise} onChange={(e) => setExercise(e.target.value)}>{exercises.map((value) => <option key={value}>{value}</option>)}</select></label></section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">Performance curve</p><h2>{exercise}</h2></div></div>{curve ? <PerformanceCurve curve={curve} /> : <div className="empty-state">No compatible reps × kg observations.</div>}</section>
    <section className="panel"><h2>Current demonstrated frontier</h2><div className="frontier-cards">{frontier.map((point) => <div key={point.rowNumber}><strong>{point.loadKg} kg</strong><span>× {point.reps} reps</span><small>{point.date ?? 'Date unknown'}{point.rpe != null ? ` · RPE ${point.rpe}` : ''}</small></div>)}</div></section>
  </>;
}

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
