// In-memory data store. This is the seam where Convex gets wired in:
// when convex/_generated exists and VITE_CONVEX_URL (or repo-root .convex-url)
// is set at build time, replace the reducer reads with useQuery calls and the
// action functions with useMutation calls. The component tree only talks to
// this interface, so the swap does not touch tab code.
import React, { createContext, useContext, useMemo, useReducer } from 'react';
import type { User, UserProfile, Company, Job, Task, Run, RunStep, Artifact, Feedback, Id, AgentConfigStub } from './types';
import * as seed from './mock';

export const MOCK_MODE = true; // flipped off when Convex is wired

export interface State {
  users: User[];
  profiles: UserProfile[];
  companies: Company[];
  jobs: Job[];
  tasks: Task[];
  runs: Run[];
  runSteps: RunStep[];
  artifacts: Artifact[];
  feedback: Feedback[];
  agentConfigs: AgentConfigStub[];
  demoMode: boolean;
  selectedUserId: Id;
  activeTab: TabId;
  runsFocus?: { runId?: Id; taskId?: Id };
}

export type TabId = 'onboard' | 'queue' | 'pipeline' | 'ledger' | 'runs' | 'roster';

type Action =
  | { type: 'setTab'; tab: TabId; runsFocus?: State['runsFocus'] }
  | { type: 'setDemoMode'; on: boolean }
  | { type: 'setSelectedUser'; userId: Id }
  | { type: 'signup'; email: string }
  | { type: 'quickPath'; userId: Id; currentRole: string; targetRole: string; companies: string[] }
  | { type: 'feedback'; row: Feedback }
  | { type: 'jobState'; jobId: Id; state: Job['state'] }
  | { type: 'deleteMyData'; userId: Id }
  | { type: 'agentConfig'; role: AgentConfigStub['role']; patch: Partial<AgentConfigStub> };

let counter = 100;
const nid = (p: string) => `${p}${counter++}`;

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'setTab':
      return { ...state, activeTab: a.tab, runsFocus: a.runsFocus ?? state.runsFocus };
    case 'setDemoMode':
      return { ...state, demoMode: a.on };
    case 'setSelectedUser':
      return { ...state, selectedUserId: a.userId };
    case 'signup': {
      const existing = state.users.find(u => u.email.toLowerCase() === a.email.toLowerCase());
      if (existing) return { ...state, selectedUserId: existing._id };
      const user: User = {
        _id: nid('u'), email: a.email, signedUpAt: Date.now(), isTeam: false,
        demoMode: false, signupToken: `tok-${Math.random().toString(36).slice(2, 10)}`,
      };
      return { ...state, users: [...state.users, user], selectedUserId: user._id };
    }
    case 'quickPath': {
      const task: Task = {
        _id: nid('t'), userId: a.userId, kind: 'intake',
        input: `Quick path: ${a.currentRole} to ${a.targetRole}; targets ${a.companies.filter(Boolean).join(', ')}`,
        status: 'queued', createdAt: Date.now(),
      };
      return { ...state, tasks: [...state.tasks, task] };
    }
    case 'feedback':
      return { ...state, feedback: [...state.feedback, a.row] };
    case 'jobState':
      return { ...state, jobs: state.jobs.map(j => (j._id === a.jobId ? { ...j, state: a.state } : j)) };
    case 'deleteMyData':
      return {
        ...state,
        users: state.users.map(u => (u._id === a.userId ? { ...u, deleteRequestedAt: Date.now() } : u)),
      };
    case 'agentConfig':
      return {
        ...state,
        agentConfigs: state.agentConfigs.map(c =>
          c.role === a.role ? { ...c, ...a.patch, updatedAt: Date.now() } : c,
        ),
      };
    default:
      return state;
  }
}

const initial: State = {
  users: seed.users,
  profiles: seed.profiles,
  companies: seed.companies,
  jobs: seed.jobs,
  tasks: seed.tasks,
  runs: seed.runs,
  runSteps: seed.runSteps,
  artifacts: seed.artifacts,
  feedback: seed.feedback,
  agentConfigs: seed.agentConfigs,
  demoMode: localStorage.getItem('ca.demoMode') === '1',
  selectedUserId: 'u1',
  activeTab: 'onboard',
};

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}

// Convenience: create a Feedback row for tap verdicts.
export function makeFeedback(userId: Id, artifactId: Id, verdict: Feedback['verdict'], reason?: string, editDiff?: string): Feedback {
  return { _id: nid('f'), userId, artifactId, verdict, reason, editDiff, at: Date.now() };
}
