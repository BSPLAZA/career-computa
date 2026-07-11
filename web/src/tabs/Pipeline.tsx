import { useStore } from '../store';
import { maskEmail, maskName } from '../util';
import type { Job } from '../types';

const STATES: Job['state'][] = [
  'discovered', 'assessed', 'auto_rejected', 'queued', 'delivered',
  'applied', 'screening', 'interviewing', 'closed', 'ghosted',
];

function fitClass(score?: number) {
  if (score === undefined) return '';
  return score >= 80 ? 'hi' : score >= 65 ? 'mid' : 'lo';
}

export default function Pipeline() {
  const { state, dispatch } = useStore();
  const jobs = state.jobs.filter(j => j.userId === state.selectedUserId);
  const profile = state.profiles.find(p => p.userId === state.selectedUserId);

  const counts = Object.fromEntries(STATES.map(s => [s, jobs.filter(j => j.state === s).length]));

  return (
    <div>
      <h2>Pipeline</h2>
      <p className="sub">Every job the agency has touched for this user, by state. Auto-rejects keep their reason; nothing silently disappears.</p>

      <div className="filters">
        <label className="muted">User</label>
        <select value={state.selectedUserId} onChange={e => dispatch({ type: 'setSelectedUser', userId: e.target.value })}>
          {state.users.map(u => (
            <option key={u._id} value={u._id}>
              {state.demoMode ? maskEmail(u.email) : u.email}{u.isTeam ? ' (team)' : ''}
            </option>
          ))}
        </select>
        {profile && (
          <span className="muted">
            {state.demoMode ? maskName(profile.name) : profile.name}: {profile.goals.targetTitles.join(', ')}
          </span>
        )}
      </div>

      <div className="counters">
        <div className="counter"><div className="num">{jobs.length}</div><div className="lbl">total discovered</div></div>
        <div className="counter"><div className="num">{jobs.filter(j => !['discovered', 'auto_rejected'].includes(j.state)).length}</div><div className="lbl">assessed and beyond</div></div>
        <div className="counter"><div className="num">{counts['auto_rejected']}</div><div className="lbl">auto rejected (reasons logged)</div></div>
        <div className="counter hero"><div className="num">{counts['delivered'] + counts['applied'] + counts['screening'] + counts['interviewing']}</div><div className="lbl">delivered or further</div></div>
        <div className="counter"><div className="num">{counts['interviewing']}</div><div className="lbl">interviewing</div></div>
      </div>

      <div className="board">
        {STATES.map(s => (
          <div className="board-col" key={s}>
            <h4>{s.replace(/_/g, ' ')} <span>{counts[s]}</span></h4>
            <div className="cards">
              {jobs.filter(j => j.state === s).map(j => {
                const co = state.companies.find(c => c._id === j.companyId);
                return (
                  <div className="job-card" key={j._id}>
                    <div className="jt">{j.title}</div>
                    <div className="muted">{co?.name} {j.location ? `· ${j.location}` : ''}</div>
                    {j.compRange && <div className="muted mono">{j.compRange}</div>}
                    {j.fitScore !== undefined && (
                      <div>fit <span className={`fit ${fitClass(j.fitScore)}`}>{j.fitScore}</span></div>
                    )}
                    {j.caveats.map((c, i) => <div className="caveat" key={i}>caveat: {c}</div>)}
                    {j.hardFilterResult?.rejected && <div className="reject-reason">{j.hardFilterResult.reason}</div>}
                    <div style={{ marginTop: 6 }}>
                      <a href={j.canonicalUrl} target="_blank" rel="noreferrer">posting</a>
                    </div>
                  </div>
                );
              })}
              {jobs.filter(j => j.state === s).length === 0 && <div className="muted" style={{ fontSize: 11, textAlign: 'center', padding: 6 }}>empty</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
