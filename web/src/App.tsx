import { useStore, type TabId } from './store';
import { LIVE } from './convex';
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
import LiveResume from './live/Resume';
import MockOnboardVoice from './onboard/MockOnboard';

// /brief/<artifactId> is the unique delivery link surface; /resume/<variantId>
// is the printable resume; /help is the operator guide; everything else is the
// dashboard.
const briefMatch = window.location.pathname.match(/^\/brief\/([A-Za-z0-9_-]+)\/?$/);
const resumeMatch = window.location.pathname.match(/^\/resume\/([A-Za-z0-9_-]+)\/?$/);
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

  if (briefMatch || resumeMatch || helpMatch) {
    return (
      <>
        <header className="topbar">
          <Brand />
          <div className="topbar-right"><a href="/" className="topbar-link">Back to dashboard</a></div>
        </header>
        <main>
          {helpMatch
            ? <Help />
            : !LIVE
              ? <div className="panel empty">This link needs the live backend; this build is in mock mode.</div>
              : briefMatch
                ? <LiveBrief artifactId={briefMatch[1]} />
                : <LiveResume variantId={resumeMatch![1]} />}
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
          <a href="/help" className="topbar-link">Help</a>
          <label className="toggle" title="Masks last names and emails and hides other people's message bodies; your own drafts stay visible. Off by default.">
            <input
              type="checkbox"
              checked={state.demoMode}
              onChange={e => {
                localStorage.setItem('ca.demoMode', e.target.checked ? '1' : '0');
                dispatch({ type: 'setDemoMode', on: e.target.checked });
              }}
            />
            privacy mask
          </label>
        </div>
      </header>
      {!LIVE && (
        <div className="mock-banner">
          MOCK DATA: Convex backend not wired yet (no .convex-url at build time). Every row on screen is a typed placeholder, not a real run.
        </div>
      )}
      <main className={state.activeTab === 'runs' || state.activeTab === 'roster' ? 'console' : undefined}>
        {state.activeTab === 'onboard' && (LIVE ? <LiveOnboard /> : <MockOnboardVoice />)}
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
