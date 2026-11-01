/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ContextType = 'Fact' | 'Decision' | 'Constraint' | 'Asset';
export type ContextStatus = 'Confirmed' | 'Proposed' | 'Needs Review' | 'Superseded' | 'Archived';
export type ContextProvenance = 'Onboarding' | 'User Input' | 'AI Suggested' | 'Asset Derived' | 'Imported';

/** Where a suggestion came from — shown in the proposals inbox (which AI, when). */
export interface ObjectSource {
  kind: 'mcp' | 'chat' | 'coach' | 'file' | 'note' | 'paste' | 'user';
  /** MCP token label («Claude»), file name, … */
  label?: string;
  /** why the AI suggested it (shown in the inbox) */
  reason?: string;
  at: string;
}

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
  createdAt: string;
  updatedAt: string;
}

/** what the UI hands over to be saved: the server assigns id, version and timestamps */
export type ContextDraft = Omit<ContextObject, 'id' | 'version' | 'createdAt' | 'updatedAt'> & Partial<Pick<ContextObject, 'id' | 'version' | 'createdAt' | 'updatedAt'>>;

export type RelationshipType = 'belongs_to' | 'depends_on' | 'supersedes' | 'derived_from';

export interface ContextRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  createdAt: string;
}

export interface TreeNode {
  id: string;
  label: string;
  parentId?: string;
  description: string;
  /** system nodes can only be renamed: no delete, no move */
  isSystem?: boolean;
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

export interface Contradiction {
  id: string;
  itemA: ContextObject;
  itemB: ContextObject;
  reason: string;
  suggestedResolution: string;
}

export type ExecutionMode = 'fast' | 'auto' | 'critique' | 'sensitive';

export interface GeneratedDeliverable {
  id: string;
  workspaceId: string;
  workstreamId: string;
  deliverableId: string;
  title: string;
  content: string;
  executionMode: ExecutionMode;
  creditCost: number;
  /** the exact objects (id + version) injected into the model — Context Replay and the impact engine read this */
  usedContext: UsedContextRef[];
  usedFileChunks?: UsedFileChunk[];
  /** staleness signature for which the one-time half-price rebuild was already used */
  halfPriceUsedFor?: string;
  /** made outside Mabda (MCP client or pasted answer): which AI, and the Context pack it was built from */
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
  mode: ExecutionMode | 'chat_auto' | 'chat_deep' | 'file_processing' | 'note_extract' | 'gap_judge' | 'coach' | 'import_parse';
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
  byok?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  planId: PlanId;
  creditsRemaining: number;
  todayChatCount: number;
  /** YYYY-MM-DD (Tehran) the count belongs to; a different day means the count is 0 */
  chatCountDay?: string;
  createdAt: string;
}
export * from './ai';
export * from './state';
