import { useStore, type TabId } from './store';
import { LIVE } from './convex';
import Onboard from './tabs/Onboard';
import Queue from './tabs/Queue';
import Pipeline from './tabs/Pipeline';
import Ledger from './tabs/Ledger';
import Runs from './tabs/Runs';
import Roster from './tabs/Roster';
import { LiveOnboard, LiveQueue, LiveLedger, LivePipeline, LiveRuns } from './live/LiveTabs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'onboard', label: 'Onboard' },
  { id: 'queue', label: 'Queue' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'runs', label: 'Runs' },
  { id: 'roster', label: 'Roster' },
];

export default function App() {
  const { state, dispatch } = useStore();

  return (
    <>
      <header className="topbar">
        <div className="brand">Career <span>Agency</span></div>
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
          <label className="toggle" title="Masks last names and emails; never renders message bodies">
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
        {state.activeTab === 'queue' && (LIVE ? <LiveQueue /> : <Queue />)}
        {state.activeTab === 'pipeline' && (LIVE ? <LivePipeline /> : <Pipeline />)}
        {state.activeTab === 'ledger' && (LIVE ? <LiveLedger /> : <Ledger />)}
        {state.activeTab === 'runs' && (LIVE ? <LiveRuns /> : <Runs />)}
        {state.activeTab === 'roster' && <Roster />}
      </main>
    </>
  );
}
