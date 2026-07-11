import { useStore } from '../store';
import { fmtUsd, isToday } from '../util';
import type { AgentRole } from '../types';

const DESCRIPTIONS: Record<AgentRole, string> = {
  manager: 'Plans every task, delegates to specialists, composes the final brief.',
  scout: 'Scores job fit against the profile with evidence pairs and caveats.',
  researcher: 'Digs into companies and people; every claim ships with a source URL.',
  drafter: 'Renders resume variants and writes notes under the 300 char cap.',
  pipeline: 'Polls ATS boards, tracks job state, never lets a role go stale silently.',
  reviewer: 'Runs the gates: char caps, sources, tone rules, no em dashes. Sends work back.',
};

export default function Roster() {
  const { state, dispatch } = useStore();

  function todayStats(role: AgentRole) {
    let steps = 0, cost = 0, revised = 0, errors = 0;
    for (const s of state.runSteps) {
      if (s.agentRole !== role) continue;
      const r = state.runs.find(rr => rr._id === s.runId);
      if (!r || !isToday(r.startedAt)) continue;
      steps += 1; cost += s.costUsd;
      if (s.status === 'revised') revised += 1;
      if (s.status === 'error') errors += 1;
    }
    return { steps, cost, revised, errors };
  }

  return (
    <div>
      <h2>Roster</h2>
      <p className="sub">The agency staff. Pause any agent or set its daily quota; the manager routes around paused staff.</p>

      <div className="roster-grid">
        {state.agentConfigs.map(cfg => {
          const s = todayStats(cfg.role);
          return (
            <div className={`agent-card ${cfg.paused ? 'paused' : ''}`} key={cfg.role}>
              <div className="agent-head">
                <span className="agent-name">{cfg.role}</span>
                <button
                  className={cfg.paused ? 'primary small' : 'danger small'}
                  onClick={() => dispatch({ type: 'agentConfig', role: cfg.role, patch: { paused: !cfg.paused } })}
                >
                  {cfg.paused ? 'Resume' : 'Pause'}
                </button>
              </div>
              <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{DESCRIPTIONS[cfg.role]}</p>
              <div className="stat-line"><span>steps today</span><b>{s.steps}</b></div>
              <div className="stat-line"><span>spend today</span><b>{fmtUsd(s.cost)}</b></div>
              <div className="stat-line"><span>revisions</span><b>{s.revised}</b></div>
              <div className="stat-line"><span>errors</span><b>{s.errors}</b></div>
              <div className="quota-row">
                <label className="muted" style={{ fontSize: 12 }}>daily quota</label>
                <input
                  type="number"
                  min={0}
                  value={cfg.dailyQuota}
                  onChange={e => dispatch({ type: 'agentConfig', role: cfg.role, patch: { dailyQuota: Number(e.target.value) || 0 } })}
                />
              </div>
              {cfg.paused && <div style={{ marginTop: 8 }}><span className="badge b-warn">paused</span></div>}
            </div>
          );
        })}
      </div>

      <div className="note-stub">
        Display-only for now: pause and quota write local config rows. The frozen contract has no agent-config table yet,
        so the worker does not read these until the brain adds one and the Convex lane wires it. Reported upstream.
      </div>
    </div>
  );
}
