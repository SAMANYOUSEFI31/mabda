/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AiErrorInfo, AiPlan, AiStatus, AiStreamEvent, ContentBlock, ExecutionMode, GenerationResult, JobKind,
  StageName, StageUsage, Tier, UserMode,
} from '../types';

/**
 * Talks to /api/ai/*. There is NO local fallback: every failure is a structured AiClientError that the UI
 * shows with a retry button. The server limits (chat 30s, deliverable 120s) are the real timeouts;
 * the client adds a small margin so the server's structured error wins the race.
 */
const CLIENT_TIMEOUT_MS = { chat: 35_000, deliverable: 125_000, short: 25_000 } as const;

export class AiClientError extends Error {
  constructor(public readonly info: AiErrorInfo) {
    super(info.message);
    this.name = 'AiClientError';
  }
}

const USER_KEY = 'mabda_user_id';
/** Opaque browser-generated id; the server keys the BYOK vault by it until real accounts exist. */
export function getUserId(): string {
  let id = localStorage.getItem(USER_KEY);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = `u_${crypto.randomUUID().replace(/-/g, '')}`;
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

const headers = () => ({ 'Content-Type': 'application/json', 'x-mabda-user': getUserId() });

const networkError = (aborted: boolean, timedOut: boolean): AiClientError =>
  new AiClientError(
    timedOut
      ? { kind: 'timeout', message: 'پاسخ به‌موقع نرسید. دوباره تلاش کن.', retryable: true }
      : aborted
      ? { kind: 'aborted', message: 'درخواست لغو شد.', retryable: true }
      : { kind: 'provider', message: 'ارتباط با سرور برقرار نشد. اینترنت و اجرای سرور را بررسی کن و دوباره تلاش کن.', retryable: true },
  );

interface Guard { signal: AbortSignal; done: () => void; timedOut: () => boolean }
function guard(ms: number, external?: AbortSignal): Guard {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
  const onExt = () => ctl.abort();
  external?.addEventListener('abort', onExt, { once: true });
  return { signal: ctl.signal, timedOut: () => timedOut, done: () => { clearTimeout(timer); external?.removeEventListener('abort', onExt); } };
}

async function errorFromResponse(res: Response): Promise<AiClientError> {
  try {
    const body = await res.json();
    if (body?.error?.kind) return new AiClientError(body.error as AiErrorInfo);
  } catch { /* not JSON */ }
  return new AiClientError({ kind: 'provider', message: `خطای سرور (${res.status}). دوباره تلاش کن.`, retryable: res.status >= 500 });
}

/** Reads an NDJSON body, calling `onEvent` per line. Resolves with the `done` result or throws the `error` event. */
async function readStream(res: Response, onEvent: (e: AiStreamEvent) => void): Promise<GenerationResult> {
  if (!res.body) throw new AiClientError({ kind: 'provider', message: 'پاسخ سرور خالی بود.', retryable: true });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result: GenerationResult | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const ev = JSON.parse(line) as AiStreamEvent;
    if (ev.type === 'error') throw new AiClientError(ev.error);
    if (ev.type === 'done') result = ev.result;
    onEvent(ev);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  handle(buf);
  if (!result) throw new AiClientError({ kind: 'provider', message: 'پاسخ ناقص بود (ارتباط وسط کار قطع شد). دوباره تلاش کن.', retryable: true });
  return result;
}

async function post<T>(path: string, body: unknown, ms: number, external?: AbortSignal): Promise<T> {
  const g = guard(ms, external);
  try {
    const res = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: g.signal });
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof AiClientError) throw e;
    throw networkError(g.signal.aborted, g.timedOut());
  } finally { g.done(); }
}

export async function getAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  const g = guard(CLIENT_TIMEOUT_MS.short, signal);
  try {
    const res = await fetch('/api/ai/status', { headers: headers(), signal: g.signal });
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as AiStatus;
  } catch (e) {
    if (e instanceof AiClientError) throw e;
    throw networkError(g.signal.aborted, g.timedOut());
  } finally { g.done(); }
}

export async function putByokKey(apiKey: string): Promise<{ last4: string }> {
  const g = guard(CLIENT_TIMEOUT_MS.short);
  try {
    const res = await fetch('/api/ai/byok', { method: 'PUT', headers: headers(), body: JSON.stringify({ apiKey }), signal: g.signal });
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as { last4: string };
  } catch (e) {
    if (e instanceof AiClientError) throw e;
    throw networkError(g.signal.aborted, g.timedOut());
  } finally { g.done(); }
}
export async function deleteByokKey(): Promise<void> {
  const g = guard(CLIENT_TIMEOUT_MS.short);
  try {
    const res = await fetch('/api/ai/byok', { method: 'DELETE', headers: headers(), signal: g.signal });
    if (!res.ok) throw await errorFromResponse(res);
  } catch (e) {
    if (e instanceof AiClientError) throw e;
    throw networkError(g.signal.aborted, g.timedOut());
  } finally { g.done(); }
}

/** UI "execution mode" → router user mode (critique is the router's "deep"). */
export const toUserMode = (m: ExecutionMode): UserMode => (m === 'critique' ? 'deep' : m);

export interface PlanPreview { plan: AiPlan; decisionUsage?: StageUsage }

/** Ask the router what it would do (no generation) so credits can be shown before the run. */
export function previewPlan(params: { executionMode: ExecutionMode; jobKind: JobKind; text: string; workspaceId: string }, signal?: AbortSignal): Promise<PlanPreview> {
  // the server reads the workspace context itself (workspaceId)
  return post('/api/ai/plan', { userMode: toUserMode(params.executionMode), jobKind: params.jobKind, text: params.text, workspaceId: params.workspaceId }, CLIENT_TIMEOUT_MS.short, signal);
}

export interface ChatHandlers {
  onPlan?: (plan: AiPlan) => void;
  onBlock?: (block: ContentBlock) => void;
  onStage?: (stage: StageName, tier: Tier) => void;
}

/** Streams a chat answer as structured blocks. Rejects with AiClientError. */
export async function streamChat(
  params: {
    message: string;
    workspaceId: string;
    /** node chat: context = this node's sub-tree + ancestors; proposals only inside the sub-tree */
    scopeNodeId?: string;
    focusNodeIds?: string[];
    chatMode?: 'discovery' | 'audit' | 'advisor';
    deep: boolean;
    history?: Array<{ role: string; content: string }>;
  },
  handlers: ChatHandlers = {},
  signal?: AbortSignal,
): Promise<GenerationResult> {
  const g = guard(CLIENT_TIMEOUT_MS.chat, signal);
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST', headers: headers(), signal: g.signal,
      body: JSON.stringify({
        message: params.message, workspaceId: params.workspaceId, scopeNodeId: params.scopeNodeId, focusNodeIds: params.focusNodeIds ?? [],
        chatMode: params.chatMode, mode: params.deep ? 'deep' : 'auto', history: params.history ?? [],
      }),
    });
    if (!res.ok) throw await errorFromResponse(res);
    return await readStream(res, (e) => {
      if (e.type === 'plan') handlers.onPlan?.(e.plan);
      else if (e.type === 'block') handlers.onBlock?.(e.block);
      else if (e.type === 'stage') handlers.onStage?.(e.stage, e.tier);
    });
  } catch (e) {
    if (e instanceof AiClientError) throw e;
    throw networkError(g.signal.aborted, g.timedOut());
  } finally { g.done(); }
}

export interface GenerateHandlers {
  onPlan?: (plan: AiPlan) => void;
  onStage?: (stage: StageName, tier: Tier) => void;
}

export async function generateDeliverableApi(
  params: {
    deliverableId: string;
    deliverableTitle: string;
    deliverableType: 'Asset' | 'Deliverable';
    acceptanceCriteria: string[];
    workspaceId: string;
    /** node whose ancestor chain is the relevant context (default: content) */
    targetNodeId?: string;
    executionMode: ExecutionMode;
    rebuildNotes?: string;
    /** the plan previewed to the user (credits shown = credits charged) */
    preview?: PlanPreview;
  },
  handlers: GenerateHandlers = {},
  signal?: AbortSignal,
): Promise<GenerationResult> {
  const g = guard(CLIENT_TIMEOUT_MS.deliverable, signal);
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST', headers: headers(), signal: g.signal,
      body: JSON.stringify({
        deliverableId: params.deliverableId, deliverableTitle: params.deliverableTitle, deliverableType: params.deliverableType,
        acceptanceCriteria: params.acceptanceCriteria, workspaceId: params.workspaceId, targetNodeId: params.targetNodeId,
        userMode: toUserMode(params.executionMode), rebuildNotes: params.rebuildNotes,
        plan: params.preview?.plan, decisionUsage: params.preview?.decisionUsage,
      }),
    });
    if (!res.ok) throw await errorFromResponse(res);
    return await readStream(res, (e) => {
      if (e.type === 'plan') handlers.onPlan?.(e.plan);
      else if (e.type === 'stage') handlers.onStage?.(e.stage, e.tier);
    });
  } catch (e) {
    if (e instanceof AiClientError) throw e;
    throw networkError(g.signal.aborted, g.timedOut());
  } finally { g.done(); }
}

export const asAiError = (e: unknown): AiErrorInfo =>
  e instanceof AiClientError ? e.info : { kind: 'provider', message: 'خطای ناشناخته. دوباره تلاش کن.', retryable: true };
