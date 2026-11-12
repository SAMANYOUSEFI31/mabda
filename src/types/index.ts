/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ContextType = 'Fact' | 'Decision' | 'Constraint';
export type ContextStatus = 'Confirmed' | 'Proposed' | 'Needs Review' | 'Superseded' | 'Archived';
export type ContextProvenance = 'Onboarding' | 'User Input' | 'AI Suggested' | 'Asset Derived' | 'Imported';
export type ThoughtKind = 'idea' | 'question' | 'assumption' | 'open_decision';

/** Where a suggestion came from — legacy source kinds remain readable for stored records. */
export interface ObjectSource {
  kind: 'mcp' | 'chat' | 'coach' | 'file' | 'note' | 'paste' | 'user' | 'asset';
  /** legacy external-source label, file name, … */
  label?: string;
  /** why the AI suggested it (shown in the inbox) */
  reason?: string;
  /** the exact passage of the source text this was taken from (verified to occur in it) */
  quote?: string;
  /** kind 'note': the note and the line (a hash of its text) the object was made from — ties a thinking item to its «✓ converted» mark */
  noteId?: string;
  /** stable Thought identity when this object was promoted from a persisted Thought */
  thoughtId?: string;
  lineKey?: string;
  at: string;
}

export type ThoughtStatus = 'open' | 'resolved';
export type ThoughtHistoryActor = 'user' | 'system';

/** A durable, actionable thought; its source Note is raw Material and may change independently. */
export interface Thought {
  id: string;
  workspaceId: string;
  nodeId: string;
  kind: ThoughtKind | null;
  text: string;
  status: ThoughtStatus;
  sourceNoteId?: string;
  sourceLine?: number;
  sourceLineKey?: string;
  sourceQuote?: string;
  inferred?: boolean;
  resolvedObjectId?: string;
  /** the knowledge this thought became was erased for good: the pointer is gone, the thought says «منبع حذف‌شده» */
  resolvedRemoved?: boolean;
  /** where it came from is no longer there: its line was removed from the note, or the note was deleted (the thought stays) */
  sourceState?: 'line_deleted' | 'note_deleted';
  aboutObjectIds?: string[];
  aboutNodeIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Only explicit semantic edits are recorded; presentation edits and reclassification do not create history. */
export interface ThoughtRevision {
  thoughtId: string;
  revision: number;
  beforeText: string;
  afterText: string;
  at: string;
}

export interface ThoughtDerivation {
  parentId: string;
  childId: string;
  createdAt: string;
}

export interface ThoughtHistoryEntry {
  kind: 'created' | 'revision' | 'reclassification' | 'resolved' | 'derived' | 'about_updated' | 'source_line_deleted' | 'source_note_deleted';
  at: string;
  actor: string;
  details: {
    beforeText?: string;
    afterText?: string;
    beforeKind?: ThoughtKind | null;
    afterKind?: ThoughtKind | null;
    parentIds?: string[];
    objectId?: string;
    sourceNoteId?: string;
    sourceQuote?: string;
  };
}

export interface ThoughtHistoryReport {
  thought: Thought;
  entries: ThoughtHistoryEntry[];
  derivedThoughts: Thought[];
  proposedObject?: ContextObject;
}

/** question, what was weighed (and why each rejected option was rejected), what is expected, and when to look back */
export interface DecisionRecord {
  question?: string;
  options?: Array<{ title: string; /** present = rejected; the reason it was */ rejectedReason?: string }>;
  expectation?: string;
  /** YYYY-MM-DD */
  reviewOn?: string;
  /** what the user expects to see in a Metric by a date — a statement to compare against, never a claim about cause */
  metricExpectation?: MetricExpectation;
}

/** «انتظار»: the Metric, which way it should go, an optional target, and the date by which it is looked at */
export interface MetricExpectation {
  metricId: string;
  direction: MetricDirection;
  targetValue?: number;
  /** YYYY-MM-DD */
  by: string;
}

/** a number the user follows (not a Context object, never a fact): `up` = higher is better */
export type MetricDirection = 'up' | 'down';
export interface Metric {
  id: string;
  workspaceId: string;
  name: string;
  unit: string;
  direction: MetricDirection;
  target?: number;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}
export type MeasurementSource = 'manual' | 'csv' | 'mcp' | 'demo';
/** one recorded value. Legacy external suggestions remain Proposed until the user confirms them. */
export interface Measurement {
  id: string;
  workspaceId: string;
  metricId: string;
  value: number;
  /** YYYY-MM-DD */
  at: string;
  note?: string;
  source: MeasurementSource;
  status: 'Confirmed' | 'Proposed';
  /** the decision being reviewed when the value was recorded (for future analysis; no meaning is derived from it here) */
  decisionId?: string;
  createdAt: string;
}
/** the user's verdict on a decision's expectation, written with «نتیجه چه شد؟» */
export type ExpectationVerdict = 'met' | 'partial' | 'missed';

export interface RedlineExample { kind: 'good' | 'bad'; text: string }

/** an edit of CONFIRMED knowledge that nobody approved yet: it sits on the object, and no AI, pack, export or engine ever reads it — they read the object's own (approved) text */
export interface ObjectDraft { title: string; content: string; examples?: RedlineExample[]; at: string; reason?: string }

export interface ContextObject {
  id: string;
  workspaceId: string;
  type: ContextType;
  status: ContextStatus;
  provenance: ContextProvenance;
  title: string;
  content: string;
  nodeId: string; // id of a TreeNode in the same workspace
  /** starts at 1; +1 on every edit of title/content/type (see server/db/repo.ts); a superseding object continues the number */
  version: number;
  supersededById?: string;
  /** set on objects that were SUGGESTED (Proposed): where from and when */
  source?: ObjectSource;
  /** the Gap item (spec requiredContext/suggestedContext `key`) this object fills; objects without it are matched by title (legacy data only) */
  slotKey?: string;
  /** how far the object's effect reaches: 'position' = its node and sub-nodes; 'global' = everywhere. Absent = the type's default (Constraint: global, Fact/Decision: position) */
  reach?: 'global' | 'position';
  /** up to three short «right / wrong» examples of a red line (a Constraint, or a Decision that reaches everywhere): they travel next to it into the AI request, the Context pack and the validator. Never on samples */
  examples?: RedlineExample[];
  /** the unapproved rewrite of this (Confirmed) object, if any. The text above is still the truth until it is approved */
  draft?: ObjectDraft;
  /** ISO date after which the object no longer applies (never injected, kept in history). Absent = no end */
  validUntil?: string;
  /** a Fact that is a working assumption: never «confirmed knowledge», even if its status is Confirmed. It is reviewed by `reviewBy` */
  assumption?: boolean;
  /** YYYY-MM-DD: when the assumption should be looked at again (shows in «این هفته» and «خانه») */
  reviewBy?: string;
  /** optional record of how a Decision was made (kept closed by default in the editor) */
  record?: DecisionRecord;
  /** one free axis across the tree: names the user picks («مخاطب سازمانی», «فصل پاییز»). Not a hierarchy */
  facets?: string[];
  /** an example that came with a starter or a template: shown grey as «نمونه», and NEVER seen by any AI or engine (repo.listObjects hides it) until the user writes her own over it */
  sample?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** what the UI hands over to be saved: the server assigns id, version and timestamps */
export type ContextDraft = Omit<ContextObject, 'id' | 'version' | 'createdAt' | 'updatedAt'> & Partial<Pick<ContextObject, 'id' | 'version' | 'createdAt' | 'updatedAt'>>;

export type RelationshipType = 'belongs_to' | 'depends_on' | 'supersedes' | 'derived_from' | 'overrides';

export interface ContextRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  createdAt: string;
}

export type ContextChangeKind =
  | 'created' | 'edited' | 'status_changed' | 'superseded' | 'archived'
  | 'proposal_accepted' | 'proposal_rejected' | 'contradiction_resolved' | 'imported' | 'review_accepted' | 'outcome_noted' | 'node_from_note' | 'node_deleted' | 'node_restored' | 'node_moved' | 'purged'
  | 'metric_created' | 'metric_edited' | 'metric_archived' | 'measurement_added' | 'measurement_proposed' | 'measurement_removed';
export type ContextChangeActor = 'user' | 'mcp' | 'chat' | 'coach' | 'import' | 'system';

/** One append-only record of what happened to a Context object. `reason` is for people only: it is never injected into a model prompt. */
export interface ContextChange {
  id: string;
  workspaceId: string;
  objectId: string;
  fromVersion: number;
  toVersion: number;
  kind: ContextChangeKind;
  actor: ContextChangeActor;
  /** e.g. a legacy external-source label or the file name */
  actorLabel?: string;
  reason?: string;
  /** only the fields that changed */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  at: string;
}

export interface TreeNode {
  id: string;
  label: string;
  parentId?: string;
  description: string;
  /** system nodes can only be renamed: no delete, no move */
  /** position among siblings */
  order?: number;
}

/** Free-form note on a node. Never injected into the model; «extract» turns it into Proposed objects. */
export interface Note {
  id: string;
  workspaceId: string;
  nodeId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Exactly which version of which object was injected into the model when an asset was produced. */
export interface UsedContextRef {
  id: string;
  version: number;
}

export interface UsedFileChunk {
  fileId: string;
  index: number;
}

export type FileStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface StoredFile {
  id: string;
  workspaceId: string;
  nodeId?: string;
  name: string;
  mime: string;
  sizeBytes: number;
  status: FileStatus;
  /** estimated tokens of the extracted text (this is what the monthly quota counts) */
  tokens: number;
  chunkCount: number;
  summary?: string;
  error?: string;
  createdAt: string;
}

export interface WorkstreamSpec {
  id: string;
  title: string;
  target: string;
  description: string;
  requiredContext: Array<{
    key: string;
    label: string;
    description: string;
    nodeId: string;
    dependsOn?: string[];
  }>;
  suggestedContext: Array<{
    key: string;
    label: string;
    description: string;
    nodeId: string;
  }>;
  optionalContext: Array<{
    key: string;
    label: string;
    description: string;
    nodeId: string;
  }>;
  deliverables: Array<DeliverableSpec>;
  /** the public framework this workstream follows (named, never quoted) */
  reference?: string;
  /** the kinds of space it is written for (audience.md); absent = work */
  purposes?: Array<'personal' | 'work' | 'project' | 'empty'>;
  /** rules every output of this workstream must obey; Confirmed Constraint objects are applied on top automatically */
  guardrails?: string[];
}

export type OutputBandId = 'short' | 'medium' | 'long';

export interface DeliverableSpec {
  id: string;
  title: string;
  type: 'Asset' | 'Deliverable';
  description: string;
  order: number;
  /** ids of other deliverables of the same spec that must exist before this one can be built (graph, no cycles) */
  dependsOn?: string[];
  /** length of the output; default depends on the type */
  outputBand?: OutputBandId;
  baseCreditCost: {
    fast: number;
    auto: number;
    critique: number;
    sensitive: number;
  };
  acceptanceCriteria: string[];
}

export interface GapItem {
  key: string;
  label: string;
  importance: 'required' | 'suggested' | 'optional';
  nodeId: string;
  status: 'missing' | 'ambiguous' | 'confirmed';
  question: string;
  suggestedAnswers: string[];
  dependsOn?: string[];
}

export interface ReadinessResult {
  score: number; // 0 to 100
  status: 'ready' | 'needs_work' | 'blocked';
  confirmedCount: number;
  totalRequired: number;
  gaps: GapItem[];
  summary: string;
}

/** how a contradiction was found: deterministic rule, or the decision layer's answer for a candidate pair */
export type ContradictionSource = 'rule' | 'semantic';

export interface Contradiction {
  source?: ContradictionSource;
  id: string;
  itemA: ContextObject;
  itemB: ContextObject;
  reason: string;
  suggestedResolution: string;
}

export type ExecutionMode = 'fast' | 'auto' | 'critique' | 'sensitive';

export interface GeneratedDeliverable {
  id: string;
  /** archived: out of the list (and of the stale count), still replayable; set only by the server */
  archivedAt?: string;
  workspaceId: string;
  workstreamId: string;
  deliverableId: string;
  title: string;
  content: string;
  executionMode: ExecutionMode;
  creditCost: number;
  /** the exact objects (id + version) injected into the model — Context Replay and the impact engine read this */
  usedContext: UsedContextRef[];
  /** knowledge this output was built from that was later erased for good (permanent delete): the output keeps its text; Replay says «N منبع حذف‌شده» */
  removedSources?: number;
  usedFileChunks?: UsedFileChunk[];
  /** staleness signature for which the one-time half-price rebuild was already used */
  halfPriceUsedFor?: string;
  /** made outside Mabda (for example a pasted answer): which AI, and the Context pack it was built from */
  source?: ObjectSource;
  sourcePackId?: string;
  /** per-criterion / per-guardrail validator results shown under the output */
  checks?: import('./ai').CheckResult[];
  critiqueFeedback?: {
    score: number;
    strengths: string[];
    improvementsMade: string[];
    checklistPassed: string[];
  };
  rebuildCount: number;
  createdAt: string;
  /** `content` is Markdown; blocks keep the per-block structure for Context/asset actions */
  blocks?: ContentBlock[];
  plan?: AiPlan;
  usage?: UsageSummary;
  /** the validator did not approve the final output (shown honestly) */
  validationFailed?: boolean;
}

export interface ContextSuggestion {
  id: string;
  type: ContextType;
  nodeId: string;
  title: string;
  content: string;
  reason: string;
}

import type { AiErrorInfo, AiPlan, ContentBlock, UsageSummary } from './ai';

export type ChatMode = 'discovery' | 'audit' | 'advisor';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  executionMode: 'auto' | 'deep';
  creditCost: number;
  suggestions?: ContextSuggestion[];
  /** structured answer (Markdown blocks); `content` is the same text as Markdown */
  blocks?: ContentBlock[];
  plan?: AiPlan;
  usage?: UsageSummary;
  /** set when the request failed — the UI shows it with a retry button instead of any answer text */
  error?: AiErrorInfo;
  streaming?: boolean;
  /** exact objects (id + version) injected for this answer — saved with an asset made from one of its blocks */
  usedContext?: UsedContextRef[];
  groundedNodeIds?: string[];
  groundedCount?: number;
  reasoningNotes?: string;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  chatMode: ChatMode;
  selectedNodeIds: string[]; // specific nodes selected for grounding, or empty for all
  /** node chat: grounded in this node (+ ancestors) and allowed to propose updates only inside its sub-tree */
  scopeNodeId?: string;
  messages: ChatMessage[];
}

export type PlanId = 'starter' | 'pro' | 'max';

export interface WorkspacePlan {
  id: PlanId;
  title: string;
  priceMonthlyUsd: number;
  creditsMonthly: number;
  workspaceLimit: number;
  dailyChatLimit: number;
  allowedModes: ExecutionMode[];
  /** may create and edit custom workstream specs */
  customSpecs: boolean;
  /** Context Coach sessions per day (separate from chat) */
  coachDailyLimit: number;
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  workspaceId: string;
  action: string;
  mode: ExecutionMode | 'chat_auto' | 'chat_deep' | 'file_processing' | 'note_extract' | 'gap_judge' | 'coach' | 'import_parse' | 'contradiction' | 'memory_import' | 'thread' | 'asset_extract';
  creditCost: number;
  inputTokens: number;
  outputTokens: number;
  estimatedAiCostUsd: number;
  status: 'completed' | 'refunded';
  /** real usage (absent on seed data) */
  cachedTokens?: number;
  thinkingTokens?: number;
  plan?: AiPlan;
  stages?: import('./ai').StageUsage[];
  /** Historical payer marker retained only to report pre-MVP entries correctly; new entries omit it. */
  byok?: boolean;
}

/** a saved Context pack: WHAT to include, resolved through the effective context at the chosen nodes (so scope is respected) */
export interface PackSelection {
  /** nodes the pack is FOR (empty = the whole tree) */
  nodeIds: string[];
  /** only objects with one of these facets (empty = any) */
  facets: string[];
  /** besides Confirmed (always), which other statuses are listed — always under «تأییدنشده, واقعیت نیست» */
  statuses: Array<'Proposed' | 'Needs Review'>;
  /** assumptions go in their own labelled section, with the rule */
  includeAssumptions: boolean;
  /** the sub-sections of the picked sections are read too (src/core/packScope.ts). Absent = no: a pack saved before this switch keeps what it had */
  withChildren?: boolean;
}
export interface SavedPack {
  id: string; workspaceId: string; name: string; selection: PackSelection; /** a short instruction for the AI that opens the pack */ instruction: string; createdAt: string; updatedAt: string;
  /** a saved «درخواست برای AI»: the kind of work and the user's one line (the template). Both absent = a plain pack. It is resolved afresh each time (src/core/aiRequest.ts) */
  kind?: 'question' | 'audit' | 'draft' | 'decision' | 'change_review' | 'free';
  template?: string;
}

export interface Workspace {
  /** what the space is for, chosen when it is made: it picks the starting tree and the wording (absent = work, as before) */
  purpose?: 'personal' | 'work' | 'project' | 'empty';
  /** the workspace is archived: hidden from the menu, nothing deleted; set only by the server («بایگانی») */
  archivedAt?: string;
  id: string;
  name: string;
  slug: string;
  description: string;
  planId: PlanId;
  creditsRemaining: number;
  todayChatCount: number;
  /** YYYY-MM-DD (Tehran) the count belongs to; a different day means the count is 0 */
  chatCountDay?: string;
  /** the built-in showcase workspace: never counted against the plan (workspaces, objects, files) or the account's usage; set only by the server */
  isDemo?: boolean;
  /** which built-in workstreams of the library this workspace shows. Absent = all of them (workspaces that existed before the library keep their behaviour); new workspaces start with none */
  enabledSpecIds?: string[];
  createdAt: string;
}
export * from './ai';
export * from './state';
