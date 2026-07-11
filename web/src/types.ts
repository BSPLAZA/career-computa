// Re-export the FROZEN shared contract types. Do not redefine schema here.
export type {
  Id,
  User,
  UserProfile,
  Contact,
  AnswerBankEntry,
  StarStory,
  Company,
  TargetCompany,
  Job,
  Task,
  Run,
  RunStep,
  Artifact,
  Feedback,
} from '../../contracts/schema';

// STUB, NOT IN FROZEN SCHEMA: agent pause/quota config for the Roster tab.
// contracts/schema.ts has no config table yet. Reported to the brain; the shape
// below is a local stub only. Display-only until convex + worker wire it up.
export type AgentRole = 'manager' | 'scout' | 'researcher' | 'drafter' | 'pipeline' | 'reviewer';
export interface AgentConfigStub {
  role: AgentRole;
  paused: boolean;
  dailyQuota: number;
  updatedAt: number;
}
