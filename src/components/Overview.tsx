import { useState } from 'react';
import type { AthleteConfig } from '../config/athletes';
import type { ConnectionStatus } from '../hooks/useDashboardData';
import type { NormalizedWorkbook } from '../data/normalized/types';
import type { RawWorkbook } from '../data/raw/types';
import { RawDataInspector } from './RawDataInspector';
import { chronologicalPBProgression, jumpPBs, sprintPBs } from '../domain/pb';
import { latestRecordedDate, withinLookback, type LookbackWindow } from '../domain/lookback';
import { representativeStrengthPerformance } from '../domain/overview';

interface Props {
  athlete: AthleteConfig;
  authenticated: boolean;
  clientConfigured: boolean;
  status: ConnectionStatus;
  error?: string;
  rawWorkbook?: RawWorkbook;
  normalized?: NormalizedWorkbook;
  onSignIn(): void;
  onSignOut(): void;
  onReload(): void;
}

export function Overview(props: Props) {
  const statusLabel = props.status === 'connected' ? 'Connected' : props.status === 'loading' ? 'Loading…' : props.status === 'error' ? 'Needs attention' : 'Not connected';
  return (
    <div className="overview">
      <header className="overview-banner">
        <div className="overview-title"><span className="brand-mark">AP</span><h1>{props.athlete.name}</h1></div>
        <div className="overview-actions">
        {!props.authenticated ? (
          <button className="primary-button" onClick={props.onSignIn} disabled={!props.clientConfigured}>Sign in with Google</button>
        ) : (
          <div className="button-row">
            <button className="compact-button primary-button" onClick={props.onReload} disabled={props.status === 'loading'}>Refresh</button>
            <button className="compact-button secondary-button" onClick={props.onSignOut}>Sign out</button>
          </div>
        )}
          <details className="connection-popover"><summary aria-label="Connection details"><span className={`status-dot ${props.authenticated && props.status === 'connected' ? 'ok' : props.status === 'error' ? 'error' : ''}`} />Status</summary><div><StatusLine label="Google" value={props.authenticated ? 'Authenticated' : 'Signed out'} state={props.authenticated ? 'ok' : 'idle'} /><StatusLine label="Spreadsheet" value={statusLabel} state={props.status === 'connected' ? 'ok' : props.status === 'error' ? 'error' : 'idle'} /><StatusLine label="Access" value="Read only" state="ok" /></div></details>
        </div>
      </header>

      {!props.clientConfigured && <div className="notice error"><strong>Configuration needed</strong><span>Add VITE_GOOGLE_CLIENT_ID to your local .env file, then restart Vite.</span></div>}
      {props.error && <div className="notice error" role="alert"><strong>Connection failed</strong><span>{props.error}</span></div>}

      {props.status === 'loading' && <div className="loading-panel"><span className="spinner" />Loading six spreadsheet tabs…</div>}

      {props.rawWorkbook && (
        <>
          {props.normalized && <AthleteOverview data={props.normalized} />}
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">Import summary</p><h2>Rows loaded</h2></div><span className="live-pill">Live data</span></div>
            <div className="row-counts">
              {props.athlete.tabs.map((tab) => (
                <div className="row-count" key={tab} title={props.rawWorkbook![tab].error}>
                  <span>{tab}</span>
                  {props.rawWorkbook![tab].error
                    ? <strong className="missing-tab">Missing</strong>
                    : <strong>{Math.max(props.rawWorkbook![tab].rows.length - 1, 0)}</strong>}
                </div>
              ))}
            </div>
          </section>
          {props.normalized && (
            <section className="panel">
              <div className="section-heading"><div><p className="eyebrow">Normalisation preview</p><h2>Typed records detected</h2></div></div>
              <div className="row-counts compact">
                <div className="row-count"><span>Sprints</span><strong>{props.normalized.sprints.length}</strong></div>
                <div className="row-count"><span>Jumps</span><strong>{props.normalized.jumps.length}</strong></div>
                <div className="row-count"><span>Strength</span><strong>{props.normalized.strength.length}</strong></div>
                <div className="row-count"><span>Training rows</span><strong>{props.normalized.training.length}</strong></div>
                <div className="row-count"><span>Daily status</span><strong>{props.normalized.dailyStatus.length}</strong></div>
              </div>
              <p className="muted">Counts are deliberately conservative: records without enough information remain raw instead of being guessed.</p>
            </section>
          )}
          <RawDataInspector workbook={props.rawWorkbook} />
        </>
      )}
    </div>
  );
}

function AthleteOverview({ data }: { data: NormalizedWorkbook }) {
  const [lookback, setLookback] = useState<LookbackWindow>(30);
  const latestDate = latestRecordedDate([...data.sprints, ...data.jumps, ...data.strength]);
  const sprints = withinLookback(data.sprints, lookback, latestDate);
  const jumps = withinLookback(data.jumps, lookback, latestDate);
  const strength = withinLookback(data.strength, lookback, latestDate);
  const sprintTests = [...new Set(sprints.map((item) => item.test))];
  const jumpTests = [...new Set(jumps.map((item) => `${item.test}|${item.unit}`))];
  const sprintCards = sprintTests.map((test) => {
    const rows = sprints.filter((item) => item.test === test);
    const pb = sprintPBs(rows)[0];
    const progression = chronologicalPBProgression(rows, (item) => item.timeSeconds, 'lower');
    return pb ? { name: test, value: `${pb.timeSeconds.toFixed(3)} s`, date: pb.date, context: [pb.surface, pb.footwear, pb.leadInMetres != null ? `${pb.leadInMetres}m lead-in` : undefined].filter(Boolean).join(' · ') || 'Conditions unknown', change: progression.at(-1)?.improvement } : undefined;
  }).filter(Boolean);
  const jumpCards = jumpTests.map((identity) => {
    const [test, unit] = identity.split('|');
    const rows = jumps.filter((item) => item.test === test && item.unit === unit);
    const pb = jumpPBs(rows)[0];
    const progression = chronologicalPBProgression(rows, (item) => item.result, 'higher');
    return pb ? { name: test!, value: `${pb.result} ${unit}`, date: pb.date, context: [pb.surface, pb.footwear].filter(Boolean).join(' · ') || 'Conditions unknown', change: progression.at(-1)?.improvement } : undefined;
  }).filter(Boolean);
  const strengthCards = [...new Set(strength.map((item) => item.exercise))].map((exercise) => {
    const best = representativeStrengthPerformance(strength.filter((item) => item.exercise === exercise));
    return best ? { name: exercise, value: `${best.loadKg} kg × ${best.reps}`, date: best.date, context: [best.rpe != null ? `RPE ${best.rpe}` : undefined, best.velocityMps != null ? `${best.velocityMps} m/s` : undefined].filter(Boolean).join(' · ') || 'No RPE or velocity recorded', change: undefined } : undefined;
  }).filter(Boolean);
  const cards = [...sprintCards, ...jumpCards, ...strengthCards].sort((a, b) => (b?.date ?? '').localeCompare(a?.date ?? ''));
  const recentDates = [...new Set(data.training.map((row) => row.date).filter((date): date is string => Boolean(date)))].sort().reverse().slice(0, 4);
  const recentStatus = [...data.dailyStatus].sort((a,b)=>(b.date??'').localeCompare(a.date??'')).slice(0, 3);
  return <>
    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">Current performance</p><h2>Best recent performances</h2><p className="muted">Window anchored to the latest recorded performance{latestDate ? ` (${latestDate})` : ''}.</p></div><label className="select-label"><span>Look back</span><select value={lookback} onChange={(event) => setLookback(event.target.value === 'all' ? 'all' : Number(event.target.value) as 30 | 90)}><option value="30">30 days</option><option value="90">90 days</option><option value="all">All time</option></select></label></div>{cards.length ? <div className="performance-table"><div className="performance-table-head"><span>Exercise / test</span><span>Best result</span><span>Date</span><span>Known conditions</span></div>{cards.map((card) => card && <article className="performance-row" key={`${card.name}-${card.value}`}><div className="performance-name"><i aria-hidden="true" /><strong>{card.name}</strong>{card.change != null && <small>{card.change.toFixed(3)} improvement</small>}</div><strong className="performance-result">{card.value}</strong><time>{card.date ?? 'Unknown'}</time><span className="performance-context" title={card.context}>{card.context}</span></article>)}</div> : <div className="empty-state">No measured performances in this window.</div>}</section>
    <section className="dashboard-columns"><div><div className="section-heading"><div><p className="eyebrow">Recent training</p><h2>Actual sessions</h2></div></div>{recentDates.map((date) => { const rows=data.training.filter((row)=>row.date===date); return <article className="recent-row" key={date}><time>{date}</time><div><strong>{[...new Set(rows.map((r)=>r.session).filter(Boolean))].join(' / ') || 'Session'}</strong><span>{rows.length} recorded activities · {[...new Set(rows.map((r)=>r.category).filter(Boolean))].slice(0,3).join(', ')}</span></div></article>; })}</div>
      <div><div className="section-heading"><div><p className="eyebrow">Recovery</p><h2>Recent observations</h2></div></div>{recentStatus.map((item)=><article className="recent-row" key={item.rowNumber}><time>{item.date ?? 'Unknown date'}</time><div><strong>{item.timepoint ?? 'Observation'}</strong><span>{item.context ?? item.notes}</span></div></article>)}</div></section>
  </>;
}

function StatusLine({ label, value, state }: { label: string; value: string; state: 'ok' | 'error' | 'idle' }) {
  return <span className="status-line"><span className={`status-dot ${state}`} /><span>{label}</span><strong>{value}</strong></span>;
}
