import type { AthleteConfig } from '../config/athletes';
import type { ConnectionStatus } from '../hooks/useDashboardData';
import type { NormalizedWorkbook } from '../data/normalized/types';
import type { RawWorkbook } from '../data/raw/types';
import { RawDataInspector } from './RawDataInspector';

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
      <section className="hero">
        <div>
          <p className="eyebrow">{props.athlete.name}</p>
          <h1>Your performance data,<br />ready to inspect.</h1>
          <p className="hero-copy">A private, read-only view of training, testing, strength, and recovery records.</p>
        </div>
        {!props.authenticated ? (
          <button className="primary-button" onClick={props.onSignIn} disabled={!props.clientConfigured}>Sign in with Google</button>
        ) : (
          <div className="button-row">
            <button className="primary-button" onClick={props.onReload} disabled={props.status === 'loading'}>Refresh data</button>
            <button className="secondary-button" onClick={props.onSignOut}>Sign out</button>
          </div>
        )}
      </section>

      {!props.clientConfigured && <div className="notice error"><strong>Configuration needed</strong><span>Add VITE_GOOGLE_CLIENT_ID to your local .env file, then restart Vite.</span></div>}
      {props.error && <div className="notice error" role="alert"><strong>Connection failed</strong><span>{props.error}</span></div>}

      <section className="status-grid" aria-label="Connection status">
        <StatusCard label="Google authentication" value={props.authenticated ? 'Authenticated' : 'Signed out'} state={props.authenticated ? 'ok' : 'idle'} />
        <StatusCard label="Spreadsheet connection" value={statusLabel} state={props.status === 'connected' ? 'ok' : props.status === 'error' ? 'error' : 'idle'} />
        <StatusCard label="Access mode" value="Read only" state="ok" />
      </section>

      {props.status === 'loading' && <div className="loading-panel"><span className="spinner" />Loading five spreadsheet tabs…</div>}

      {props.rawWorkbook && (
        <>
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">Import summary</p><h2>Rows loaded</h2></div><span className="live-pill">Live data</span></div>
            <div className="row-counts">
              {props.athlete.tabs.map((tab) => (
                <div className="row-count" key={tab}><span>{tab}</span><strong>{Math.max(props.rawWorkbook![tab].rows.length - 1, 0)}</strong></div>
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

function StatusCard({ label, value, state }: { label: string; value: string; state: 'ok' | 'error' | 'idle' }) {
  return <div className="status-card"><span className={`status-dot ${state}`} /><div><span>{label}</span><strong>{value}</strong></div></div>;
}
