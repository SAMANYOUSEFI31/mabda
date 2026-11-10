/** Shared types and helpers of the Repo domains (server/db/repo/*). */
import { isIsoDate } from '../../../src/core/metrics.ts';
import type { ContextChangeActor, ContextChangeKind, ContextObject, ContextProvenance, ContextStatus, ContextType, DecisionRecord, FileStatus, Metric, MetricExpectation, Note, ObjectDraft, ObjectSource, RedlineExample, StoredFile, Thought, ThoughtKind, TreeNode } from '../../../src/types/index.ts';
import crypto from 'node:crypto';

export interface Scope { userId: string; workspaceId: string }

export type RepoErrorCode = 'not_found' | 'invalid' | 'forbidden';
export class RepoError extends Error {
  constructor(public code: RepoErrorCode, message: string) { super(message); }
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
export const now = () => new Date().toISOString();

/** who did it and why — optional on every mutating call; the actor is otherwise inferred from the object's `source` (none = the user) */
export interface ChangeMeta { actor?: ContextChangeActor; label?: string; reason?: string; kind?: ContextChangeKind }

export interface ImpactResult { count: number; assets: Array<{ id: string; title: string; reasons: string[] }> }

export const CONTEXT_TYPES: ContextType[] = ['Fact', 'Decision', 'Constraint'];

export interface ObjectInput {
  type: ContextType; status?: ContextStatus; provenance: ContextProvenance; title: string; content: string; nodeId: string; source?: ObjectSource; slotKey?: string; reach?: ContextObject['reach']; validUntil?: string; assumption?: boolean; reviewBy?: string; record?: DecisionRecord; facets?: string[]; examples?: unknown;
}

/** reach / validUntil from client input: only valid values survive (anything else = the default) */
export const scopeFields = (i: { reach?: unknown; validUntil?: unknown }): Pick<ContextObject, 'reach' | 'validUntil'> => ({
  ...(i.reach === 'global' || i.reach === 'position' ? { reach: i.reach } : {}),
  ...(typeof i.validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.validUntil) ? { validUntil: i.validUntil } : {}),
});

/** the assumption flag, its review date and a decision record from client input (only valid, non-empty values survive) */
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const str = (v: unknown, max = 600) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
/** a decision's expectation of a Metric: a metric id, a direction, an optional finite target and the date it is looked at */
export function cleanExpectation(v: unknown): MetricExpectation | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const x = v as Record<string, unknown>;
  if (typeof x.metricId !== 'string' || !x.metricId || (x.direction !== 'up' && x.direction !== 'down') || typeof x.by !== 'string' || !isIsoDate(x.by)) return undefined;
  const target = typeof x.targetValue === 'number' && Number.isFinite(x.targetValue) ? x.targetValue : undefined;
  return { metricId: x.metricId, direction: x.direction, ...(target !== undefined ? { targetValue: target } : {}), by: x.by };
}
export function cleanRecord(r: unknown): DecisionRecord | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const x = r as Record<string, unknown>;
  const options = (Array.isArray(x.options) ? x.options : []).slice(0, 12).map((o) => {
    const t = str((o as { title?: unknown })?.title, 160);
    return t ? { title: t, ...(str((o as { rejectedReason?: unknown })?.rejectedReason) ? { rejectedReason: str((o as { rejectedReason?: unknown }).rejectedReason)! } : {}) } : null;
  }).filter((o): o is NonNullable<typeof o> => !!o);
  const out: DecisionRecord = { ...(str(x.question) ? { question: str(x.question)! } : {}), ...(options.length ? { options } : {}), ...(str(x.expectation) ? { expectation: str(x.expectation)! } : {}), ...(typeof x.reviewOn === 'string' && DATE.test(x.reviewOn) ? { reviewOn: x.reviewOn } : {}), ...(cleanExpectation(x.metricExpectation) ? { metricExpectation: cleanExpectation(x.metricExpectation)! } : {}) };
  return Object.keys(out).length ? out : undefined;
}
/** facets: trimmed, de-duplicated, short names; at most 8 per object (one free axis, no hierarchy) */
export function cleanFacets(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, 40) : '')).filter(Boolean))].slice(0, 8);
  return out.length ? out : undefined;
}
export const thinkingFields = (i: { type?: unknown; assumption?: unknown; reviewBy?: unknown; record?: unknown }): Pick<ContextObject, 'assumption' | 'reviewBy' | 'record'> => ({
  ...(i.assumption === true && i.type === 'Fact' ? { assumption: true } : {}),
  ...(typeof i.reviewBy === 'string' && DATE.test(i.reviewBy) && i.assumption === true && i.type === 'Fact' ? { reviewBy: i.reviewBy } : {}),
  ...(i.type === 'Decision' && cleanRecord(i.record) ? { record: cleanRecord(i.record) } : {}),
});

export const rowToObject = (r: Record<string, unknown>): ContextObject => ({
  id: r.id as string, workspaceId: r.workspace_id as string, type: r.type as ContextType, status: r.status as ContextStatus,
  provenance: r.provenance as ContextProvenance, title: r.title as string, content: r.content as string, nodeId: r.node_id as string,
  version: r.version as number, ...(r.source ? { source: JSON.parse(r.source as string) as ObjectSource } : {}), ...(r.slot_key ? { slotKey: r.slot_key as string } : {}), ...(r.facets ? { facets: JSON.parse(r.facets as string) as string[] } : {}), ...(r.sample ? { sample: true } : {}), ...(r.assumption ? { assumption: true } : {}), ...(r.review_by ? { reviewBy: r.review_by as string } : {}), ...(r.decision_record ? { record: JSON.parse(r.decision_record as string) as DecisionRecord } : {}), ...(r.reach ? { reach: r.reach as ContextObject['reach'] } : {}), ...(r.valid_until ? { validUntil: r.valid_until as string } : {}), ...(r.examples ? { examples: JSON.parse(r.examples as string) as RedlineExample[] } : {}), ...(r.draft ? { draft: JSON.parse(r.draft as string) as ObjectDraft } : {}), ...(r.superseded_by_id ? { supersededById: r.superseded_by_id as string } : {}),
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});
export const rowToNode = (r: Record<string, unknown>): TreeNode => ({
  id: r.id as string, label: r.label as string, description: r.description as string,
  ...(r.parent_id ? { parentId: r.parent_id as string } : {}), order: r.ord as number,
});
export const rowToNote = (r: Record<string, unknown>): Note => ({
  id: r.id as string, workspaceId: r.workspace_id as string, nodeId: r.node_id as string, content: r.content as string,
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});
export const rowToThought = (r: Record<string, unknown>, about?: { objectIds: string[]; nodeIds: string[] }): Thought => ({
  id: r.id as string, workspaceId: r.workspace_id as string, nodeId: r.node_id as string,
  kind: r.kind as ThoughtKind | null, text: r.text as string, status: r.status as Thought['status'],
  ...(r.source_note_id ? { sourceNoteId: r.source_note_id as string } : {}),
  ...(r.source_line !== null && r.source_line !== undefined ? { sourceLine: r.source_line as number } : {}),
  ...(r.source_line_key ? { sourceLineKey: r.source_line_key as string } : {}),
  ...(r.source_quote ? { sourceQuote: r.source_quote as string } : {}),
  ...(r.inferred ? { inferred: true } : {}),
  ...(r.resolved_object_id ? { resolvedObjectId: r.resolved_object_id as string } : {}),
  ...(r.resolved_removed ? { resolvedRemoved: true } : {}),
  ...(r.source_state ? { sourceState: r.source_state as 'line_deleted' | 'note_deleted' } : {}),
  ...(about?.objectIds?.length ? { aboutObjectIds: about.objectIds } : {}),
  ...(about?.nodeIds?.length ? { aboutNodeIds: about.nodeIds } : {}),
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});
export const rowToFile = (r: Record<string, unknown>, chunkCount: number): StoredFile => ({
  id: r.id as string, workspaceId: r.workspace_id as string, ...(r.node_id ? { nodeId: r.node_id as string } : {}),
  name: r.name as string, mime: r.mime as string, sizeBytes: r.size_bytes as number, status: r.status as FileStatus,
  tokens: r.tokens as number, chunkCount, ...(r.summary ? { summary: r.summary as string } : {}), ...(r.error ? { error: r.error as string } : {}),
  createdAt: r.created_at as string,
});

export interface StoredChunk { fileId: string; index: number; text: string; tokens: number }
