import type {
  ChatSession, ContextObject, Measurement, Metric, ContextRelationship, GeneratedDeliverable, LedgerEntry, Note, StoredFile, TreeNode, Workspace, WorkstreamSpec, Thought,
} from './index';
import type { StaleAsset } from '../core/impactEngine';
import type { UsageSummary } from './ai';

/** GET /api/workspaces/:id/state — everything the screens read. The browser keeps no copy of its own. */
export interface WorkspaceState {
  workspace: Workspace;
  nodes: TreeNode[];
  objects: ContextObject[];
  /** examples from a starter or a template (grey, «نمونه»): display only — the engines and every AI path never get them */
  samples: ContextObject[];
  relationships: ContextRelationship[];
  notes: Note[];
  thoughts: Thought[];
  deliverables: GeneratedDeliverable[];
  ledger: LedgerEntry[];
  sessions: ChatSession[];
  specs: WorkstreamSpec[];
  files: StoredFile[];
  stale: StaleAsset[];
  /** decision-layer «مبهم» verdicts per object (valid for the version they carry) */
  judgments: Record<string, { version: number; ambiguous: boolean; reason: string }>;
  /** semantic contradiction judgements per exact (object, version) pair, with the user's resolution */
  pairJudgments: import('../core/contradictionCandidates').PairJudgment[];
  /** append-only change log (who changed what, why) */
  changes: import('./index').ContextChange[];
  /** recorded results (not Context objects): the metrics and every measurement, Proposed ones included (those are shown only as «اعداد پیشنهادی») */
  metrics: Metric[];
  measurements: Measurement[];
  /** declared positions on the boards (decision board: lane + rank; free zone: x/y, display only) */
  canvas: { decisions: CanvasItem[]; free: CanvasItem[] };
  /** when the weekly review was last finished (null = never) */
  weeklyReviewAt: string | null;
}

export interface CanvasItem { itemRef: string; lane?: string; rank?: number; x?: number; y?: number }

export interface ImpactInfo {
  count: number;
  assets: Array<{ id: string; title: string; reasons: string[] }>;
}

export interface FileChargeInfo {
  quota: number;
  usedBefore: number;
  remainingBefore: number;
  withinQuota: boolean;
  excessTokens: number;
  credits: number;
}

export interface FileQuotaInfo extends FileChargeInfo {
  period: string;
  used: number;
  plan: string;
}

export interface ProcessedFile {
  file: StoredFile;
  created: ContextObject[];
  charge: FileChargeInfo;
  creditCost: number;
  usage: UsageSummary;
  truncated: boolean;
  workspace: Workspace;
  quota: FileQuotaInfo;
}

export interface CoachResultInfo {
  questions: string[];
  ambiguities: Array<{ quote: string; why: string }>;
  proposals: Array<{ type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string }>;
}

export interface CoachQuota { used: number; limit: number; remaining: number }

export interface UsageInfo {
  planId: import('./index').PlanId;
  month: string;
  objects: number;
  fileTokens: number;
  judgmentsToday: number;
  coachToday: number;
}

export interface CostReportRowInfo {
  userId: string;
  workspaceId: string;
  name: string;
  planId: import('./index').PlanId;
  priceUsd: number;
  ourCostUsd: number;
  ratio: number;
  warn: boolean;
  lines: Array<{ category: 'judgments' | 'fileProcessing' | 'coach' | 'generation'; costUsd: number; calls: number }>;
}

export interface PackInfo {
  id: string;
  title: string;
  createdAt: string;
  markdown: string;
  tokens: number;
  chars: number;
  counts: { confirmed: number; proposed: number; gaps: number; guardrails: number };
}

export interface ImportParseResult {
  blocks: import('../core/answerParser').ParsedBlock[];
  method: 'headings' | 'ai' | 'raw';
  warning?: string;
  packId: string | null;
  packTitle: string | null;
  packSpecId: string | null;
  packDeliverableId: string | null;
  /** the Context versions the pack contained — the lineage of anything saved from this answer */
  usedContext: import('./index').UsedContextRef[];
  ledger: import('./index').LedgerEntry[];
}
