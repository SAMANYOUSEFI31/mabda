/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ChatSession, ObjectSource, ContextObject, ContextProvenance, ContextRelationship, ContextStatus, ContextType, GeneratedDeliverable, LedgerEntry,
  Note, StoredFile, TreeNode, Workspace, WorkstreamSpec,
} from '../types';
import type { ImportParseResult, PackInfo, McpTokenInfo, CostReportRowInfo, UsageInfo, CoachQuota, CoachResultInfo, FileChargeInfo, FileQuotaInfo, ImpactInfo, ProcessedFile, WorkspaceState } from '../types/state';
import type { StaleAsset } from '../core/impactEngine';
import type { UsageSummary } from '../types/ai';
import { getUserId } from './apiClient';

/**
 * The only way the UI reads or writes data. The server (SQLite) is the source of truth — there is no localStorage copy
 * and no offline fallback: a failure is a DataApiError the UI shows with a retry.
 */
export class DataApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryable: boolean) {
    super(message);
    this.name = 'DataApiError';
  }
}

const base = '/api';

async function call<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'x-mabda-user': getUserId(), ...extraHeaders },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new DataApiError('ارتباط با سرور برقرار نشد. اجرای سرور و اینترنت را بررسی کن و دوباره تلاش کن.', 0, true);
  }
  if (!res.ok) {
    let message = `خطای سرور (${res.status}). دوباره تلاش کن.`;
    try {
      const j = await res.json();
      if (typeof j?.error?.message === 'string') message = j.error.message;
    } catch { /* not JSON */ }
    throw new DataApiError(message, res.status, res.status >= 500);
  }
  return (await res.json()) as T;
}

const ws = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

export interface LegacyData {
  workspaces?: Workspace[];
  contextObjects?: ContextObject[];
  deliverables?: GeneratedDeliverable[];
  ledger?: LedgerEntry[];
  specs?: WorkstreamSpec[];
  sessions?: Record<string, ChatSession[]>;
}

const LEGACY_KEYS = ['mabda_workspaces', 'mabda_context_objects', 'mabda_deliverables', 'mabda_ledger', 'mabda_workstream_specs'] as const;
const read = <T,>(k: string): T | undefined => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : undefined; } catch { return undefined; } };

/** Data the old localStorage-based version left in this browser (sent once, then removed after the server confirms). */
export function readLegacyData(): LegacyData | undefined {
  const workspaces = read<Workspace[]>('mabda_workspaces');
  if (!workspaces?.length) return undefined;
  const sessions: Record<string, ChatSession[]> = {};
  for (const w of workspaces) {
    const s = read<ChatSession[]>(`mabda_chat_sessions_${w.id}`);
    if (s?.length) sessions[w.id] = s;
  }
  return {
    workspaces, contextObjects: read('mabda_context_objects'), deliverables: read('mabda_deliverables'), ledger: read('mabda_ledger'),
    specs: read('mabda_workstream_specs'), sessions,
  };
}

export function clearLegacyData(workspaceIds: string[]) {
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  for (const id of workspaceIds) localStorage.removeItem(`mabda_chat_sessions_${id}`);
}

export const dataApi = {
  async bootstrap(): Promise<Workspace[]> {
    const legacy = readLegacyData();
    const r = await call<{ workspaces: Workspace[]; imported: unknown }>('POST', '/bootstrap', legacy ? { legacy } : {});
    if (legacy && r.imported && !(r.imported as { skipped?: boolean }).skipped) clearLegacyData(legacy.workspaces?.map((w) => w.id) ?? []);
    else if (legacy && (r.imported as { skipped?: boolean } | null)?.skipped) clearLegacyData(legacy.workspaces?.map((w) => w.id) ?? []);
    return r.workspaces;
  },
  state: (id: string) => call<WorkspaceState>('GET', `${ws(id)}/state`),
  saveWorkspace: (w: Workspace) => call<Workspace>('PUT', ws(w.id), w),

  createNode: (id: string, input: { parentId: string; label: string; description?: string }) => call<{ node: TreeNode; nodes: TreeNode[] }>('POST', `${ws(id)}/nodes`, input),
  renameNode: (id: string, nodeId: string, patch: { label?: string; description?: string }) => call<{ nodes: TreeNode[] }>('PATCH', `${ws(id)}/nodes/${nodeId}`, patch),
  moveNode: (id: string, nodeId: string, parentId: string, index?: number) => call<{ nodes: TreeNode[] }>('POST', `${ws(id)}/nodes/${nodeId}/move`, { parentId, index }),
  deleteNode: (id: string, nodeId: string, transferTo?: string) =>
    call<{ nodes: TreeNode[]; objects: ContextObject[]; notes: Note[]; files: StoredFile[] }>('DELETE', `${ws(id)}/nodes/${nodeId}${transferTo ? `?transferTo=${encodeURIComponent(transferTo)}` : ''}`),

  createObject: (id: string, input: { type: ContextType; status?: ContextStatus; provenance: ContextProvenance; title: string; content: string; nodeId: string; source?: ObjectSource; slotKey?: string; reach?: ContextObject['reach']; validUntil?: string }) =>
    call<{ object: ContextObject }>('POST', `${ws(id)}/objects`, input),
  updateObject: (id: string, objectId: string, patch: Partial<Pick<ContextObject, 'type' | 'title' | 'content' | 'nodeId' | 'status' | 'provenance' | 'slotKey'>> & { reach?: ContextObject['reach'] | null; validUntil?: string | null; reason?: string }) =>
    call<{ object: ContextObject; impact: ImpactInfo; stale: StaleAsset[] }>('PATCH', `${ws(id)}/objects/${objectId}`, patch),
  supersedeObject: (id: string, objectId: string, input: { type: ContextType; status?: ContextStatus; provenance: ContextProvenance; title: string; content: string; nodeId: string; reason?: string }) =>
    call<{ object: ContextObject; previous: ContextObject; impact: ImpactInfo; relationships: ContextRelationship[]; stale: StaleAsset[] }>('POST', `${ws(id)}/objects/${objectId}/supersede`, input),

  objectVersions: (id: string, objectId: string) => call<{ versions: Array<{ version: number; type: string; title: string; content: string; createdAt: string }> }>('GET', `${ws(id)}/objects/${objectId}/versions`).then((r) => r.versions),

  createNote: (id: string, nodeId: string, content: string) => call<{ note: Note }>('POST', `${ws(id)}/notes`, { nodeId, content }),
  updateNote: (id: string, noteId: string, content: string) => call<{ note: Note }>('PATCH', `${ws(id)}/notes/${noteId}`, { content }),
  deleteNote: (id: string, noteId: string) => call<{ ok: true }>('DELETE', `${ws(id)}/notes/${noteId}`),
  extractDeliverable: (id: string, deliverableId: string) => call<{ created: ContextObject[]; found: number; skipped: number; ledger: LedgerEntry[] }>('POST', `${ws(id)}/deliverables/${deliverableId}/extract`, {}),
  extractNote: (id: string, noteId: string) => call<{ created: ContextObject[]; ledger: LedgerEntry; usage: UsageSummary }>('POST', `${ws(id)}/notes/${noteId}/extract`, {}),

  saveDeliverable: (id: string, d: GeneratedDeliverable) => call<{ deliverable: GeneratedDeliverable; stale: StaleAsset[] }>('PUT', `${ws(id)}/deliverables/${d.id}`, d),
  addLedger: (id: string, e: LedgerEntry) => call<{ entry: LedgerEntry }>('POST', `${ws(id)}/ledger`, e),
  saveSession: (id: string, s: ChatSession) => call<{ session: ChatSession }>('PUT', `${ws(id)}/sessions/${s.id}`, s),
  deleteSession: (id: string, sessionId: string) => call<{ ok: true }>('DELETE', `${ws(id)}/sessions/${sessionId}`),
  saveSpec: (id: string, s: WorkstreamSpec) => call<{ spec: WorkstreamSpec }>('PUT', `${ws(id)}/specs/${s.id}`, s),

  judgeAmbiguity: (id: string, objectIds: string[]) => call<{ judgments: WorkspaceState['judgments']; ledger: LedgerEntry[] }>('POST', `${ws(id)}/gap/judge`, { objectIds }),
  judgeContradictions: (id: string, objectIds?: string[]) => call<{ pairJudgments: WorkspaceState['pairJudgments']; ledger: LedgerEntry[]; judged: number; limited: boolean }>('POST', `${ws(id)}/contradictions/judge`, objectIds ? { objectIds } : {}),
  resolveContradiction: (id: string, input: { aId: string; bId: string; action: 'keep'; keepId: string } | { aId: string; bId: string; action: 'separate'; moveId: string; nodeId: string }) =>
    call<{ objects: ContextObject[]; relationships: ContextRelationship[]; pairJudgments: WorkspaceState['pairJudgments']; stale: StaleAsset[]; impact: ImpactInfo }>('POST', `${ws(id)}/contradictions/resolve`, input),
  changeLog: (id: string, f: { objectId?: string } = {}) => call<{ changes: import('../types').ContextChange[] }>('GET', `${ws(id)}/changes/log${f.objectId ? `?objectId=${encodeURIComponent(f.objectId)}` : ''}`),
  replaceWith: (id: string, proposalId: string, input: { replacesId: string; reason?: string }) =>
    call<{ objects: ContextObject[]; relationships: ContextRelationship[]; changes: import('../types').ContextChange[]; stale: StaleAsset[]; impact: ImpactInfo }>('POST', `${ws(id)}/objects/${proposalId}/replace`, input),
  resetDemo: () => call<{ workspaces: Workspace[]; workspaceId: string }>('POST', '/demo/reset', {}),
  weeklyReviewDone: (id: string) => call<{ weeklyReviewAt: string }>('POST', `${ws(id)}/weekly-review/done`, {}),
  canvasMove: (id: string, input: { objectId: string; lane: string; nodeId?: string; beforeId?: string; afterId?: string; reason?: string; confirmBackward?: boolean }) => call<CanvasBundle>('POST', `${ws(id)}/canvas/decisions/move`, input),
  canvasReset: (id: string) => call<CanvasBundle>('POST', `${ws(id)}/canvas/decisions/reset`, {}),
  canvasConnect: (id: string, input: { fromId: string; toId: string; type: 'depends_on' | 'supersedes'; reason?: string; confirmed?: boolean }) => call<CanvasBundle>('POST', `${ws(id)}/canvas/connect`, input),
  freeNoteCreate: (id: string, input: { content: string; x: number; y: number; nodeId?: string }) => call<CanvasBundle & { note: Note }>('POST', `${ws(id)}/canvas/free/notes`, input),
  freeNoteMove: (id: string, noteId: string, x: number, y: number) => call<{ canvas: CanvasBundle['canvas'] }>('PUT', `${ws(id)}/canvas/free/items/${noteId}`, { x, y }),
  freeReset: (id: string) => call<CanvasBundle>('POST', `${ws(id)}/canvas/free/reset`, {}),
  freeNoteToKnowledge: (id: string, noteId: string, type: 'Fact' | 'Decision' | 'Constraint') => call<CanvasBundle & { object: ContextObject }>('POST', `${ws(id)}/canvas/free/notes/${noteId}/to-knowledge`, { type }),
  setOverride: (id: string, objectId: string, targetId: string, reason: string) => call<{ relationships: ContextRelationship[]; changes: import('../types').ContextChange[] }>('POST', `${ws(id)}/objects/${objectId}/overrides`, { targetId, reason }),
  removeOverride: (id: string, objectId: string, targetId: string, reason?: string) => call<{ relationships: ContextRelationship[]; changes: import('../types').ContextChange[] }>('POST', `${ws(id)}/objects/${objectId}/overrides/remove`, { targetId, reason }),
  convertThinkingItem: (id: string, noteId: string, item: { kind: string; hash: string; text: string }, opts: { as?: 'fact' | 'decision'; reviewBy?: string } = {}) => call<{ object: ContextObject; objects: ContextObject[] }>('POST', `${ws(id)}/notes/${noteId}/items/convert`, { ...item, ...opts }),
  splitNote: (id: string, noteId: string) => call<{ nodes: TreeNode[]; created: TreeNode[]; notes: Note[] }>('POST', `${ws(id)}/notes/${noteId}/split`, {}),
  noteOutcome: (id: string, objectId: string, text: string) => call<{ change: import('../types').ContextChange; changes: import('../types').ContextChange[] }>('POST', `${ws(id)}/objects/${objectId}/outcome`, { text }),
  setDependencies: (id: string, objectId: string, dependsOn: string[]) => call<{ relationships: ContextRelationship[]; changes: import('../types').ContextChange[]; stale: StaleAsset[] }>('PUT', `${ws(id)}/objects/${objectId}/dependencies`, { dependsOn }),
  acceptReview: (id: string, objectId: string) => call<{ change: import('../types').ContextChange; changes: import('../types').ContextChange[]; stale: StaleAsset[] }>('POST', `${ws(id)}/objects/${objectId}/review-accept`, {}),
  importMemory: (id: string, input: { text: string; sourceLabel: string; mode?: 'text' | 'memory' }) => call<{ created: ContextObject[]; found: number; skipped: number; truncated: boolean; ledger: LedgerEntry[] }>('POST', `${ws(id)}/memory/import`, input),
  threadTurn: (id: string, nodeId: string, input: { message: string; history: Array<{ role: string; content: string }> }) =>
    call<{ blocks: import('../types/ai').ContentBlock[]; markdown: string; created: ContextObject[]; ledger: LedgerEntry[] }>('POST', `${ws(id)}/threads/${encodeURIComponent(nodeId)}/turn`, input),
  threadFinish: (id: string, nodeId: string, transcript: Array<{ role: string; content: string }>) =>
    call<{ note: Note; ledger: LedgerEntry[] }>('POST', `${ws(id)}/threads/${encodeURIComponent(nodeId)}/finish`, { transcript }),
  coachQuota: (id: string) => call<CoachQuota>('GET', `${ws(id)}/coach/quota`),
  coach: (id: string, input: { scope: 'onboarding' | 'node'; nodeId: string; text: string; history?: Array<{ role: 'user' | 'coach'; content: string }> }) =>
    call<{ result: CoachResultInfo; quota: CoachQuota; ledger: LedgerEntry[] }>('POST', `${ws(id)}/coach`, input),

  listMcpTokens: (id: string) => call<{ tokens: McpTokenInfo[]; allowed: boolean }>('GET', `${ws(id)}/mcp/tokens`),
  createMcpToken: (id: string, label: string) => call<{ id: string; token: string; last4: string }>('POST', `${ws(id)}/mcp/tokens`, { label }),
  revokeMcpToken: (id: string, tokenId: string) => call<{ tokens: McpTokenInfo[] }>('DELETE', `${ws(id)}/mcp/tokens/${tokenId}`),
  createPack: (id: string, input: { specId?: string; deliverableId?: string; nodeId?: string }) => call<PackInfo>('POST', `${ws(id)}/packs`, input),
  listPacks: (id: string) => call<{ packs: Array<{ id: string; title: string; tokens: number; createdAt: string }> }>('GET', `${ws(id)}/packs`).then((r) => r.packs),
  parseImport: (id: string, input: { text: string; packId?: string }) => call<ImportParseResult>('POST', `${ws(id)}/imports/parse`, input),

  usage: (id: string) => call<UsageInfo>('GET', `${ws(id)}/usage`),
  costReport: (month?: string) => call<{ month: string; rows: CostReportRowInfo[] }>('GET', `/admin/cost-report${month ? `?month=${month}` : ''}`),

  fileQuota: (id: string) => call<FileQuotaInfo>('GET', `${ws(id)}/files/quota`),
  uploadFile: (id: string, file: File, nodeId?: string) => {
    const form = new FormData();
    form.set('file', file);
    if (nodeId) form.set('nodeId', nodeId);
    return call<{ file: StoredFile; charge: FileChargeInfo; period: string; policy: 'ok' | 'credits' | 'own-key' | 'blocked' }>('POST', `${ws(id)}/files`, form);
  },
  processFile: (id: string, fileId: string) => call<ProcessedFile>('POST', `${ws(id)}/files/${fileId}/process`, {}),
  deleteFile: (id: string, fileId: string) => call<{ ok: true }>('DELETE', `${ws(id)}/files/${fileId}`),
};

export type { WorkspaceState, ImpactInfo };

/** what every board request returns: the pieces of workspace state that a board action can touch */
export interface CanvasBundle {
  objects: ContextObject[];
  relationships: ContextRelationship[];
  changes: import('../types').ContextChange[];
  notes: Note[];
  stale: StaleAsset[];
  canvas: { decisions: import('../types/state').CanvasItem[]; free: import('../types/state').CanvasItem[] };
}
