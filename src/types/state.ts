import type {
  ChatSession, ContextObject, ContextRelationship, GeneratedDeliverable, LedgerEntry, Note, StoredFile, TreeNode, Workspace, WorkstreamSpec,
} from './index';
import type { StaleAsset } from '../core/impactEngine';
import type { UsageSummary } from './ai';

/** GET /api/workspaces/:id/state — everything the screens read. The browser keeps no copy of its own. */
export interface WorkspaceState {
  workspace: Workspace;
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  notes: Note[];
  deliverables: GeneratedDeliverable[];
  ledger: LedgerEntry[];
  sessions: ChatSession[];
  specs: WorkstreamSpec[];
  files: StoredFile[];
  stale: StaleAsset[];
  /** decision-layer «مبهم» verdicts per object (valid for the version they carry) */
  judgments: Record<string, { version: number; ambiguous: boolean; reason: string }>;
}

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
