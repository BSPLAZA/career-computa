import { useStore, type TabId } from './store';
import { LIVE } from './convex';
import Onboard from './tabs/Onboard';
import Queue from './tabs/Queue';
import Pipeline from './tabs/Pipeline';
import Ledger from './tabs/Ledger';
import Runs from './tabs/Runs';
import Roster from './tabs/Roster';
import Help from './Help';
import { LiveOnboard, LiveQueue, LiveLedger, LivePipeline, LiveRuns } from './live/LiveTabs';
import LiveApplyReady from './live/ApplyReady';
import LiveRoster from './live/Roster';
import LiveBrief from './live/Brief';

// /brief/<artifactId> is the unique delivery link surface; /help is the
// operator guide; everything else is the dashboard.
const briefMatch = window.location.pathname.match(/^\/brief\/([A-Za-z0-9_-]+)\/?$/);
const helpMatch = /^\/help\/?$/.test(window.location.pathname);

const TABS: { id: TabId; label: string }[] = [
  { id: 'onboard', label: 'Onboard' },
  { id: 'ready', label: 'Ready' },
  { id: 'queue', label: 'Queue' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'runs', label: 'Runs' },
  { id: 'roster', label: 'Roster' },
];

function Brand() {
  return <div className="brand">Career <span>Computa</span></div>;
}

export default function App() {
  const { state, dispatch } = useStore();

  if (briefMatch || helpMatch) {
    return (
      <>
        <header className="topbar">
          <Brand />
          <div className="topbar-right"><a href="/" style={{ fontSize: 13 }}>dashboard</a></div>
        </header>
        <main>
          {helpMatch
            ? <Help />
            : LIVE
              ? <LiveBrief artifactId={briefMatch![1]} />
              : <div className="panel empty">Brief links need the live backend; this build is in mock mode.</div>}
        </main>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <Brand />
        <nav className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-btn ${state.activeTab === t.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'setTab', tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <a href="/help" style={{ fontSize: 13 }}>help</a>
          <label className="toggle" title="Masks last names and emails and hides other people's message bodies; your own drafts stay visible. Off by default.">
            <input
              type="checkbox"
              checked={state.demoMode}
              onChange={e => {
                localStorage.setItem('ca.demoMode', e.target.checked ? '1' : '0');
                dispatch({ type: 'setDemoMode', on: e.target.checked });
              }}
            />
            demo mode
          </label>
        </div>
      </header>
      {!LIVE && (
        <div className="mock-banner">
          MOCK DATA: Convex backend not wired yet (no .convex-url at build time). Every row on screen is a typed placeholder, not a real run.
        </div>
      )}
      <main>
        {state.activeTab === 'onboard' && (LIVE ? <LiveOnboard /> : <Onboard />)}
        {state.activeTab === 'ready' && (LIVE ? <LiveApplyReady /> : <div className="panel empty">Apply-ready cards need the live backend; this build is in mock mode.</div>)}
        {state.activeTab === 'queue' && (LIVE ? <LiveQueue /> : <Queue />)}
        {state.activeTab === 'pipeline' && (LIVE ? <LivePipeline /> : <Pipeline />)}
        {state.activeTab === 'ledger' && (LIVE ? <LiveLedger /> : <Ledger />)}
        {state.activeTab === 'runs' && (LIVE ? <LiveRuns /> : <Runs />)}
        {state.activeTab === 'roster' && (LIVE ? <LiveRoster /> : <Roster />)}
      </main>
    </>
  );
}
