import { useState } from 'react';
import { Overview } from './components/Overview';
import { DEFAULT_ATHLETE } from './config/athletes';
import { useDashboardData } from './hooks/useDashboardData';
import { JumpPage, RecoveryPage, SprintPage, StrengthPage, TrainingPage } from './components/AthleticPages';
import { AnalysisPage } from './components/AnalysisPage';

const SECTIONS = ['Overview', 'Analysis', 'Sprint', 'Jumps', 'Strength', 'Training', 'Recovery'] as const;
type Section = (typeof SECTIONS)[number];
const NAV_GROUPS: { label: string; items: readonly Section[] }[] = [
  { label: 'Home', items: ['Overview'] },
  { label: 'Performance', items: ['Sprint', 'Jumps', 'Strength'] },
  { label: 'Training & insight', items: ['Training', 'Recovery', 'Analysis'] },
];
const MOBILE_PRIMARY: readonly Section[] = ['Overview', 'Sprint', 'Jumps', 'Strength'];

export default function App() {
  const [section, setSection] = useState<Section>('Overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dashboard = useDashboardData(DEFAULT_ATHLETE, import.meta.env.VITE_GOOGLE_CLIENT_ID);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">AP</span><div><strong>Athletic</strong><span>Performance</span></div></div>
        <nav aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map((item) => (
            <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}><NavIcon name={item} />{item}</button>
          ))}</div>)}
        </nav>
        <div className="privacy-note"><span className="lock">⌾</span><div><strong>Private & read only</strong><span>Source data is never modified</span></div></div>
      </aside>
      <main>
        {section !== 'Overview' && <header className="mobile-header"><div className="brand"><span className="brand-mark">AP</span><strong>Athleticism Testing</strong></div></header>}
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
            section === 'Analysis' ? <AnalysisPage data={dashboard.normalized} /> :
            section === 'Sprint' ? <SprintPage data={dashboard.normalized} /> :
            section === 'Jumps' ? <JumpPage data={dashboard.normalized} /> :
            section === 'Strength' ? <StrengthPage data={dashboard.normalized} /> :
            section === 'Training' ? <TrainingPage data={dashboard.normalized} /> :
            <RecoveryPage data={dashboard.normalized} />
          ) : <Placeholder section={section} />}
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {MOBILE_PRIMARY.map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => { setSection(item); setMobileMenuOpen(false); }}><NavIcon name={item} /><span>{item}</span></button>)}
          <button className={['Training', 'Recovery', 'Analysis'].includes(section) ? 'active' : ''} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}><span className="nav-icon" aria-hidden="true">•••</span><span>More</span></button>
        </nav>
        {mobileMenuOpen && <div className="mobile-more" role="dialog" aria-label="More navigation"><div><strong>Training & insight</strong><button aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}>×</button></div>{(['Training', 'Recovery', 'Analysis'] as const).map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => { setSection(item); setMobileMenuOpen(false); }}><NavIcon name={item} /><span>{item}</span></button>)}</div>}
      </main>
    </div>
  );
}

function Placeholder({ section }: { section: Exclude<Section, 'Overview'> }) {
  return <section className="placeholder"><p className="eyebrow">Coming next</p><h1>{section}</h1><p>This section is ready for analysis once the source data and normalisation rules have been verified.</p></section>;
}

function NavIcon({ name }: { name: Section }) {
  const icons: Record<Section, string> = { Overview: '⌂', Analysis: '⌁', Sprint: '↗', Jumps: '↥', Strength: '◇', Training: '≡', Recovery: '♡' };
  return <span className="nav-icon" aria-hidden="true">{icons[name]}</span>;
}
