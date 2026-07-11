import { useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { fmtDateTime, fmtUsd, fmtMs, isToday, truncate } from '../util';
import type { RunStep } from '../types';

const ROLE_COLORS: Record<RunStep['agentRole'], string> = {
  manager: '#5aa7f0',
  scout: '#4cc38a',
  researcher: '#e2b93b',
  drafter: '#a78bfa',
  pipeline: '#e5654f',
  reviewer: '#6fd6e0',
};

function StepTree({ steps, roleFilter, demoMode }: { steps: RunStep[]; roleFilter: string; demoMode: boolean }) {
  // Nest by parentSeq. Children render indented under their parent.
  const bySeq = new Map(steps.map(s => [s.seq, s]));
  const children = new Map<number | undefined, RunStep[]>();
  for (const s of steps) {
    const key = s.parentSeq !== undefined && bySeq.has(s.parentSeq) ? s.parentSeq : undefined;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(s);
  }
  for (const arr of children.values()) arr.sort((a, b) => a.seq - b.seq);

  function render(parent: number | undefined, depth: number): ReactNode[] {
    const rows = children.get(parent) ?? [];
    return rows.flatMap(s => {
      const dimmed = roleFilter !== 'all' && s.agentRole !== roleFilter;
      const row = (
        <div
          key={s._id}
          className={`step-row ${s.status === 'revised' ? 'revised' : s.status === 'error' ? 'error' : s.status === 'escalated' ? 'escalated' : ''}`}
          style={{ paddingLeft: 10 + depth * 26, opacity: dimmed ? 0.35 : 1 }}
        >
          <span className="mono muted">#{s.seq}</span>
          <span className="role-tag" style={{ background: `${ROLE_COLORS[s.agentRole]}22`, color: ROLE_COLORS[s.agentRole] }}>
            {s.agentRole}
          </span>
          <span className="mono" style={{ color: 'var(--muted)' }}>{s.action}</span>
          <span style={{ flex: 1, minWidth: 200 }}>
            <span className="muted">{truncate(s.inputSummary, 70)}</span>
            <br />
            <span>{truncate(s.outputSummary, 90)}</span>
          </span>
          <span className="step-meta">
            <span>{s.tokensIn + s.tokensOut} tok</span>
            <span>{fmtUsd(s.costUsd)}</span>
            <span>{fmtMs(s.ms)}</span>
            <span className={`badge ${s.status === 'ok' ? 'b-ok' : s.status === 'revised' ? 'b-purple' : s.status === 'escalated' ? 'b-warn' : 'b-err'}`}>{s.status}</span>
          </span>
        </div>
      );
      return [row, ...render(s.seq, depth + 1)];
    });
  }

  return <div>{render(undefined, 0)}</div>;
}

export default function Runs() {
  const { state, dispatch } = useStore();
  const focusRun = state.runsFocus?.runId;
  const [selected, setSelected] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');

  const runId = selected ?? focusRun ?? state.runs[0]?._id ?? null;
  const run = state.runs.find(r => r._id === runId);
  const task = run ? state.tasks.find(t => t._id === run.taskId) : undefined;
  const steps = state.runSteps.filter(s => s.runId === runId);
  const runArtifacts = run ? state.artifacts.filter(a => a.runId === run._id) : [];

  const visibleRuns = state.runs.filter(r => taskFilter === 'all' || r.taskId === taskFilter);

  // Which agent spent the most today?
  const spendByAgent = useMemo(() => {
    const totals = new Map<string, { cost: number; tokens: number; steps: number }>();
    for (const s of state.runSteps) {
      const r = state.runs.find(rr => rr._id === s.runId);
      if (!r || !isToday(r.startedAt)) continue;
      const cur = totals.get(s.agentRole) ?? { cost: 0, tokens: 0, steps: 0 };
      cur.cost += s.costUsd; cur.tokens += s.tokensIn + s.tokensOut; cur.steps += 1;
      totals.set(s.agentRole, cur);
    }
    return [...totals.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [state.runSteps, state.runs]);

  return (
    <div>
      <h2>Runs</h2>
      <p className="sub">The trace IS the product proof. Every step: who did it, what went in, what came out, what it cost. Revised rows show agents catching each other.</p>

      <div className="counters">
        {spendByAgent.map(([role, t]) => (
          <div className="counter" key={role}>
            <div className="num" style={{ color: ROLE_COLORS[role as RunStep['agentRole']], fontSize: 22 }}>{fmtUsd(t.cost)}</div>
            <div className="lbl">{role} today · {t.steps} steps · {t.tokens.toLocaleString()} tok</div>
          </div>
        ))}
      </div>

      <div className="filters">
        <label className="muted">Run</label>
        <select value={runId ?? ''} onChange={e => setSelected(e.target.value)}>
          {visibleRuns.map(r => {
            const t = state.tasks.find(tt => tt._id === r.taskId);
            return <option key={r._id} value={r._id}>{r._id} · {t ? truncate(t.input, 44) : r.taskId}</option>;
          })}
        </select>
        <label className="muted">Task</label>
        <select value={taskFilter} onChange={e => setTaskFilter(e.target.value)}>
          <option value="all">all tasks</option>
          {state.tasks.map(t => <option key={t._id} value={t._id}>{t._id} · {truncate(t.input, 36)}</option>)}
        </select>
        <label className="muted">Agent</label>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">all agents</option>
          {Object.keys(ROLE_COLORS).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {run && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="queue-head">
            <b className="mono">{run._id}</b>
            <span className="muted">started {fmtDateTime(run.startedAt)}</span>
            <span className="muted">{run.finishedAt ? `finished ${fmtDateTime(run.finishedAt)}` : 'in flight'}</span>
            <span className="mono">{(run.tokensIn + run.tokensOut).toLocaleString()} tok</span>
            <span className="mono">{fmtUsd(run.costUsd)}</span>
            {run.success === true && <span className="badge b-ok">success</span>}
            {run.success === false && <span className="badge b-err">failed</span>}
            {run.error && <span className="muted" style={{ color: 'var(--red)' }}>{run.error}</span>}
            {task && (
              <a
                href="#ledger"
                style={{ marginLeft: 'auto' }}
                onClick={e => { e.preventDefault(); dispatch({ type: 'setTab', tab: 'ledger' }); }}
              >
                task {task._id} on ledger
              </a>
            )}
          </div>
          <StepTree steps={steps} roleFilter={roleFilter} demoMode={state.demoMode} />
          {steps.length === 0 && <div className="empty">No steps recorded for this run.</div>}
        </div>
      )}

      {runArtifacts.length > 0 && (
        <div>
          <h3>Artifacts from this run</h3>
          {runArtifacts.map(a => (
            <div className="queue-card" key={a._id}>
              <div className="queue-head">
                <span className="badge b-purple">{a.kind.replace(/_/g, ' ')}</span>
                <span className="mono muted">{a._id}</span>
                {a.deliveredVia && <span className="badge b-ok">delivered via {a.deliveredVia}</span>}
              </div>
              {state.demoMode && (a.kind === 'connection_note' || a.kind === 'dm_draft')
                ? <div className="draft-body muted">[message body hidden in demo mode]</div>
                : <div className="draft-body">{a.content}</div>}
              {a.sourceUrls && (
                <div className="src-urls">
                  <span className="muted">Sources:</span>
                  {a.sourceUrls.map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
