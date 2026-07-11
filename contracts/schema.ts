// contracts/schema.ts. FROZEN 2026-07-11 14:50 PDT. Sole editor: brain session. Additive changes only, announced on COORDINATION.md.
// Every entity is user-scoped. Bryan is tenant #1 via the same onboarding path as any user. No user-specific facts anywhere in code or prompts.
// Convex lane translates these into convex/schema.ts; all other lanes import these types and build against them.

export type Id = string;

// ---------- Tenancy ----------
export interface User {
  _id: Id;
  email: string;
  signedUpAt: number;
  firstUseAt?: number;          // set when first agent run produces an artifact
  firstUseKind?: 'intake' | 'export_upload' | 'resume_upload';
  firstRunId?: Id;
  isTeam: boolean;              // Bryan and teammates true; judge-facing signup count filters these out
  demoMode: boolean;            // masks PII in all UI when true
  telegramChatId?: string;      // bound via t.me/CareerAgencyBriefs_bot?start=<signupToken>
  signupToken: string;
  deleteRequestedAt?: number;   // delete-my-data
}

export interface UserProfile {
  _id: Id; userId: Id;
  name: string; headline?: string; locations: string[];
  goals: { targetTitles: string[]; compFloor?: number; remote: 'remote' | 'hybrid' | 'onsite' | 'flexible'; visaNeeded?: boolean; weeklyQuota?: number };
  hardFilters: string[];        // machine-checkable, auto-reject with logged reason
  softPrefs: string[];          // score-weighted
  stylePrefs: { style: 'plaza-serif' | 'modern-sans'; density: 'lean' | 'full'; summaryLines: 2 | 3 };
  preferenceRules: string[];    // learned from edits/feedback, fed to drafter
}

// ---------- Career context ----------
export interface Contact { _id: Id; userId: Id; firstName: string; lastName: string; profileUrl?: string; company: string; position: string; connectedOn?: string; warmth: 'first_degree' | 'former_colleague' | 'alumni' | 'cold'; }
export interface AnswerBankEntry { _id: Id; userId: Id; question: string; answer: string; source: 'linkedin_export' | 'onboarding' | 'application'; sensitive: boolean; }
export interface StarStory { _id: Id; userId: Id; title: string; text: string; competencies: string[]; sourceDoc: string; excerpt: string; }

// ---------- Jobs ----------
export interface Company { _id: Id; name: string; atsType: 'greenhouse' | 'lever' | 'ashby' | 'manual'; boardToken?: string; pollable: boolean; tier?: number; briefMd?: string; briefSourceUrls?: string[]; lastResearchedAt?: number; }
export interface TargetCompany { _id: Id; userId: Id; companyId: Id; }
export interface Job {
  _id: Id; userId: Id; companyId: Id;
  title: string; canonicalUrl: string; applyUrl: string;
  postedAt?: number; discoveredAt: number;
  location?: string; isRemote?: boolean; compRange?: string;
  fitScore?: number; caveats: string[];                       // never a bare number
  fitEvidence?: { jdLine: string; resumeLine: string }[];
  hardFilterResult?: { rejected: boolean; reason?: string };
  state: 'discovered' | 'assessed' | 'auto_rejected' | 'queued' | 'delivered' | 'applied' | 'screening' | 'interviewing' | 'closed' | 'ghosted';
}

// ---------- Work execution (the observability backbone; runSteps IS the trace) ----------
export interface Task {
  _id: Id; userId: Id;
  kind: 'intake' | 'pasted_message' | 'followup' | 'judge_assigned';
  input: string;                // e.g. jobId, pasted text, or instruction
  status: 'queued' | 'running' | 'delivered' | 'failed' | 'escalated';
  createdAt: number; completedAt?: number;
  jobId?: Id;
  escalation?: { reason: string; context: string };           // escalate with full context, never vanish
}
export interface Run { _id: Id; taskId: Id; userId: Id; startedAt: number; finishedAt?: number; costUsd: number; tokensIn: number; tokensOut: number; success?: boolean; error?: string; }
export interface RunStep {
  _id: Id; runId: Id; seq: number; parentSeq?: number;
  agentRole: 'manager' | 'scout' | 'researcher' | 'drafter' | 'pipeline' | 'reviewer';
  action: string;               // plan | delegate | fetch_board | fit_score | research | render_resume | draft_note | review | revise | compose_brief | deliver | gate_check
  inputSummary: string; outputSummary: string;
  tokensIn: number; tokensOut: number; costUsd: number; ms: number;
  status: 'ok' | 'error' | 'escalated' | 'revised';           // 'revised' rows are the Org L4 evidence
}
export interface Artifact {
  _id: Id; runId: Id; taskId: Id; userId: Id;
  kind: 'fit_report' | 'research_brief' | 'resume_pdf' | 'connection_note' | 'dm_draft' | 'delivery_brief';
  content: string;              // markdown/text; resume_pdf stores file path + variantId
  variantId?: string;
  gateResults?: { gate: string; pass: boolean; note?: string }[];
  sourceUrls?: string[];        // every person/company claim traceable
  deliveredVia?: 'telegram' | 'link'; deliveredAt?: number;
}
export interface Feedback { _id: Id; userId: Id; artifactId?: Id; jobId?: Id; verdict: 'approve' | 'edit' | 'skip' | 'thumbs_down'; editDiff?: string; reason?: string; at: number; }

// ---------- Invariants (enforced in code, cited on stage) ----------
// 1. Draft creation is autonomous; the human tap gates SEND only. connection_note <= 300 chars. No send tool exists for LinkedIn.
// 2. The only autonomous outbound is the delivery_brief to the submitter's OWN bound telegramChatId or their unique brief link.
// 3. Auto-rejected jobs never count as completed tasks. Failures stay visible. No em dashes in any artifact (lint replaces).
// 4. Sensitive AnswerBank entries are masked by default and always re-confirmed at use.
// 5. Every fit score ships with caveats[] and evidence; every claim about a person or company carries a source URL.
