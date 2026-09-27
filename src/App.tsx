import { useState } from 'react';
import { Overview } from './components/Overview';
import { DEFAULT_ATHLETE } from './config/athletes';
import { useDashboardData } from './hooks/useDashboardData';
import { JumpPage, RecoveryPage, SprintPage, StrengthPage, TrainingPage } from './components/AthleticPages';

const SECTIONS = ['Overview', 'Sprint', 'Jumps', 'Strength', 'Training', 'Recovery'] as const;
type Section = (typeof SECTIONS)[number];

export default function App() {
  const [section, setSection] = useState<Section>('Overview');
  const dashboard = useDashboardData(DEFAULT_ATHLETE, import.meta.env.VITE_GOOGLE_CLIENT_ID);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">AP</span><div><strong>Athletic</strong><span>Performance</span></div></div>
        <nav aria-label="Primary navigation">
          {SECTIONS.map((item) => (
            <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>
              <NavIcon name={item} />{item}
            </button>
          ))}
        </nav>
        <div className="privacy-note"><span className="lock">⌾</span><div><strong>Private & read only</strong><span>Source data is never modified</span></div></div>
      </aside>
      <main>
        <header className="mobile-header"><div className="brand"><span className="brand-mark">AP</span><strong>Athletic Performance</strong></div></header>
        <div className="content">
          {section === 'Overview' ? (
            <Overview
              athlete={DEFAULT_ATHLETE}
              {...dashboard}
              onSignIn={dashboard.signIn}
              onSignOut={dashboard.signOut}
              onReload={dashboard.reload}
            />
          ) : dashboard.normalized ? (
            section === 'Sprint' ? <SprintPage data={dashboard.normalized} /> :
            section === 'Jumps' ? <JumpPage data={dashboard.normalized} /> :
            section === 'Strength' ? <StrengthPage data={dashboard.normalized} /> :
            section === 'Training' ? <TrainingPage data={dashboard.normalized} /> :
            <RecoveryPage data={dashboard.normalized} />
          ) : <Placeholder section={section} />}
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {SECTIONS.map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}><NavIcon name={item} /><span>{item}</span></button>)}
        </nav>
      </main>
    </div>
  );
}

function Placeholder({ section }: { section: Exclude<Section, 'Overview'> }) {
  return <section className="placeholder"><p className="eyebrow">Coming next</p><h1>{section}</h1><p>This section is ready for analysis once the source data and normalisation rules have been verified.</p></section>;
}

function NavIcon({ name }: { name: Section }) {
  const icons: Record<Section, string> = { Overview: '⌂', Sprint: '↗', Jumps: '↥', Strength: '◇', Training: '≡', Recovery: '♡' };
  return <span className="nav-icon" aria-hidden="true">{icons[name]}</span>;
}
