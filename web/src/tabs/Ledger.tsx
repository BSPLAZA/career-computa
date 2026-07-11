import { useStore } from '../store';
import { maskEmail, fmtTime, fmtUsd, fmtMs, isToday, truncate } from '../util';

export default function Ledger() {
  const { state, dispatch } = useStore();

  const outsiderIds = new Set(state.users.filter(u => !u.isTeam).map(u => u._id));
  const tasksToday = state.tasks.filter(t => t.status === 'delivered' && t.completedAt && isToday(t.completedAt) && outsiderIds.has(t.userId));
  const signupsWithFirstUse = state.users.filter(u => !u.isTeam && u.firstUseAt).length;
  const jobsDiscovered = state.jobs.length;
  const briefsDelivered = state.artifacts.filter(a => a.kind === 'delivery_brief' && a.deliveredAt).length
    + state.artifacts.filter(a => a.kind === 'fit_report' && a.deliveredAt).length;
  const exceptions = state.tasks.filter(t => t.status === 'failed' || t.status === 'escalated');

  const sorted = [...state.tasks].sort((a, b) => b.createdAt - a.createdAt);

  function rowMeta(taskId: string) {
    const run = state.runs.find(r => r.taskId === taskId);
    if (!run) return { roles: [] as string[], cost: 0, latency: undefined as number | undefined, run: undefined };
    const roles = [...new Set(state.runSteps.filter(s => s.runId === run._id).map(s => s.agentRole))];
    const latency = run.finishedAt ? run.finishedAt - run.startedAt : undefined;
    return { roles, cost: run.costUsd, latency, run };
  }

  return (
    <div>
      <h2>Ledger</h2>
      <p className="sub">
        Public work log. One row per task, every claim verifiable: open any trace, follow any source. Team accounts are excluded from the outsider counters.
      </p>

      <div className="counters">
        <div className="counter hero"><div className="num">{tasksToday.length}</div><div className="lbl">tasks completed today (outsiders only)</div></div>
        <div className="counter"><div className="num">{signupsWithFirstUse}</div><div className="lbl">signups with first use</div></div>
        <div className="counter"><div className="num">{jobsDiscovered}</div><div className="lbl">jobs discovered</div></div>
        <div className="counter"><div className="num">{briefsDelivered}</div><div className="lbl">briefs delivered</div></div>
      </div>

      {exceptions.length > 0 && (
        <div className="exceptions">
          <h3>Exceptions ({exceptions.length}) : failures stay on the board</h3>
          {exceptions.map(t => {
            const run = state.runs.find(r => r.taskId === t._id);
            return (
              <div className="exception-row" key={t._id}>
                <span className="mono">{t._id}</span>{' '}
                <span className={`badge ${t.status === 'failed' ? 'b-err' : 'b-warn'}`}>{t.status}</span>{' '}
                <span className="muted">
                  {t.status === 'escalated' && t.escalation ? t.escalation.reason : run?.error ?? 'no detail'}
                </span>{' '}
                {run && (
                  <a href="#trace" onClick={e => { e.preventDefault(); dispatch({ type: 'setTab', tab: 'runs', runsFocus: { runId: run._id } }); }}>
                    trace
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th><th>Who</th><th>Kind</th><th>Input</th><th>Received</th><th>Completed</th>
              <th>Agents</th><th>Status</th><th className="num-r">Cost</th><th className="num-r">Latency</th><th>Verify</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(t => {
              const user = state.users.find(u => u._id === t.userId);
              const m = rowMeta(t._id);
              return (
                <tr key={t._id}>
                  <td className="mono">{t._id}</td>
                  <td className="mono">{user ? maskEmail(user.email) : '?'}{user?.isTeam ? <span className="badge b-muted" style={{ marginLeft: 5 }}>team</span> : null}</td>
                  <td><span className="badge b-info">{t.kind}</span></td>
                  <td className="muted" style={{ maxWidth: 260 }}>{truncate(t.input, 80)}</td>
                  <td className="mono">{fmtTime(t.createdAt)}</td>
                  <td className="mono">{fmtTime(t.completedAt)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{m.roles.join(', ') || '...'}</td>
                  <td>
                    <span className={`badge ${
                      t.status === 'delivered' ? 'b-ok'
                        : t.status === 'failed' ? 'b-err'
                          : t.status === 'escalated' ? 'b-warn'
                            : t.status === 'running' ? 'b-info' : 'b-muted'
                    }`}>{t.status}</span>
                  </td>
                  <td className="num-r">{m.run ? fmtUsd(m.cost) : '...'}</td>
                  <td className="num-r">{m.latency !== undefined ? fmtMs(m.latency) : '...'}</td>
                  <td>
                    {m.run ? (
                      <a href="#trace" onClick={e => { e.preventDefault(); dispatch({ type: 'setTab', tab: 'runs', runsFocus: { runId: m.run!._id, taskId: t._id } }); }}>
                        VERIFY
                      </a>
                    ) : <span className="muted">queued</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
