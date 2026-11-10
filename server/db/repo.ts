import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ObjectSource, ContextObject, ContextRelationship, ContextStatus, ContextType, GeneratedDeliverable, LedgerEntry, Note, StoredFile, TreeNode,
  Workspace, WorkstreamSpec, ChatSession, FileStatus, ContextProvenance, ContextChange, ContextChangeKind, ContextChangeActor, DecisionRecord, RedlineExample, ObjectDraft, PackSelection, SavedPack, Metric, Measurement, MetricExpectation, MetricDirection, MeasurementSource, ExpectationVerdict, Thought, ThoughtKind, ThoughtRevision,
} from '../../src/types/index.ts';
import { canCreateUnder, canDelete, canMove, canRename, defaultNodeId, movedNodeTree, nextOrder, resolveNodeId } from '../../src/core/nodeTree.ts';
import { planNodes } from '../../src/core/startTemplate.ts';
import type { StartTemplate } from '../../src/core/startTemplate.ts';
import { computeStaleAssets, newlyStale } from '../../src/core/impactEngine.ts';
import { actorOfSource, diffFields, statusChangeKind } from '../../src/core/changeLog.ts';
import { pairKey } from '../../src/core/contradictionCandidates.ts';
import type { PairJudgment } from '../../src/core/contradictionCandidates.ts';
import type { StaleAsset } from '../../src/core/impactEngine.ts';
import { DEFAULT_START, LIBRARY } from '../../src/core/specs.ts';
import { isIsoDate, parseMeasurementCsv } from '../../src/core/metrics.ts';
import { reasonAllowed } from '../../src/core/versionHistory.ts';
import { isFeatureKey } from '../../src/core/usage.ts';
import { isRequestKind, REQUEST_MAX_CHARS } from '../../src/core/aiRequest.ts';
import { overrideProblem } from '../../src/core/effectiveContext.ts';
import { canHaveExamples, cleanExamples } from '../../src/core/redlineExamples.ts';
import { can, entitlementsOf, objectLimitMessage, objectsRemaining, workspaceLimitMessage } from '../../src/core/entitlements.ts';
import { lineHash, parseThinking } from '../../src/core/thinkingMarkers.ts';
import { jaccard, normalizeFa, titleTokens } from '../../src/core/contextEngine.ts';

/** Every query is scoped by these two ids. One local user for now; real accounts later only change how `userId` is found. */
export interface Scope { userId: string; workspaceId: string }

export type RepoErrorCode = 'not_found' | 'invalid' | 'forbidden';
export class RepoError extends Error {
  constructor(public code: RepoErrorCode, message: string) { super(message); }
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
const now = () => new Date().toISOString();

/** who did it and why — optional on every mutating call; the actor is otherwise inferred from the object's `source` (none = the user) */
export interface ChangeMeta { actor?: ContextChangeActor; label?: string; reason?: string; kind?: ContextChangeKind }

export interface ImpactResult { count: number; assets: Array<{ id: string; title: string; reasons: string[] }> }

const CONTEXT_TYPES: ContextType[] = ['Fact', 'Decision', 'Constraint'];

export interface ObjectInput {
  type: ContextType; status?: ContextStatus; provenance: ContextProvenance; title: string; content: string; nodeId: string; source?: ObjectSource; slotKey?: string; reach?: ContextObject['reach']; validUntil?: string; assumption?: boolean; reviewBy?: string; record?: DecisionRecord; facets?: string[]; examples?: unknown;
}

/** reach / validUntil from client input: only valid values survive (anything else = the default) */
const scopeFields = (i: { reach?: unknown; validUntil?: unknown }): Pick<ContextObject, 'reach' | 'validUntil'> => ({
  ...(i.reach === 'global' || i.reach === 'position' ? { reach: i.reach } : {}),
  ...(typeof i.validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.validUntil) ? { validUntil: i.validUntil } : {}),
});

/** the assumption flag, its review date and a decision record from client input (only valid, non-empty values survive) */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max = 600) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
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
const thinkingFields = (i: { type?: unknown; assumption?: unknown; reviewBy?: unknown; record?: unknown }): Pick<ContextObject, 'assumption' | 'reviewBy' | 'record'> => ({
  ...(i.assumption === true && i.type === 'Fact' ? { assumption: true } : {}),
  ...(typeof i.reviewBy === 'string' && DATE.test(i.reviewBy) && i.assumption === true && i.type === 'Fact' ? { reviewBy: i.reviewBy } : {}),
  ...(i.type === 'Decision' && cleanRecord(i.record) ? { record: cleanRecord(i.record) } : {}),
});

const rowToObject = (r: Record<string, unknown>): ContextObject => ({
  id: r.id as string, workspaceId: r.workspace_id as string, type: r.type as ContextType, status: r.status as ContextStatus,
  provenance: r.provenance as ContextProvenance, title: r.title as string, content: r.content as string, nodeId: r.node_id as string,
  version: r.version as number, ...(r.source ? { source: JSON.parse(r.source as string) as ObjectSource } : {}), ...(r.slot_key ? { slotKey: r.slot_key as string } : {}), ...(r.facets ? { facets: JSON.parse(r.facets as string) as string[] } : {}), ...(r.sample ? { sample: true } : {}), ...(r.assumption ? { assumption: true } : {}), ...(r.review_by ? { reviewBy: r.review_by as string } : {}), ...(r.decision_record ? { record: JSON.parse(r.decision_record as string) as DecisionRecord } : {}), ...(r.reach ? { reach: r.reach as ContextObject['reach'] } : {}), ...(r.valid_until ? { validUntil: r.valid_until as string } : {}), ...(r.examples ? { examples: JSON.parse(r.examples as string) as RedlineExample[] } : {}), ...(r.draft ? { draft: JSON.parse(r.draft as string) as ObjectDraft } : {}), ...(r.superseded_by_id ? { supersededById: r.superseded_by_id as string } : {}),
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});
const rowToNode = (r: Record<string, unknown>): TreeNode => ({
  id: r.id as string, label: r.label as string, description: r.description as string,
  ...(r.parent_id ? { parentId: r.parent_id as string } : {}), order: r.ord as number,
});
const rowToNote = (r: Record<string, unknown>): Note => ({
  id: r.id as string, workspaceId: r.workspace_id as string, nodeId: r.node_id as string, content: r.content as string,
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});
const rowToThought = (r: Record<string, unknown>, about?: { objectIds: string[]; nodeIds: string[] }): Thought => ({
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
const rowToFile = (r: Record<string, unknown>, chunkCount: number): StoredFile => ({
  id: r.id as string, workspaceId: r.workspace_id as string, ...(r.node_id ? { nodeId: r.node_id as string } : {}),
  name: r.name as string, mime: r.mime as string, sizeBytes: r.size_bytes as number, status: r.status as FileStatus,
  tokens: r.tokens as number, chunkCount, ...(r.summary ? { summary: r.summary as string } : {}), ...(r.error ? { error: r.error as string } : {}),
  createdAt: r.created_at as string,
});

export interface StoredChunk { fileId: string; index: number; text: string; tokens: number }

export class Repo {
  constructor(readonly db: Database.Database) {}

  // ── workspaces ───────────────────────────────────────────────────────────
  listWorkspaces(userId: string): Workspace[] {
    return (this.db.prepare('SELECT data FROM workspaces WHERE user_id = ? ORDER BY created_at').all(userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  }

  getWorkspace(userId: string, id: string): Workspace | undefined {
    const r = this.db.prepare('SELECT data FROM workspaces WHERE user_id = ? AND id = ?').get(userId, id) as { data: string } | undefined;
    return r ? JSON.parse(r.data) : undefined;
  }

  /** Create or update the workspace row; a new workspace also gets the 5 system nodes. */
  saveWorkspace(userId: string, ws: Workspace, opts: { skipLimit?: boolean; demo?: boolean } = {}): Workspace {
    return this.db.transaction(() => {
      const exists = this.db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(ws.id);
      // `isDemo` is decided by the server only: a client can neither claim nor drop it
      const stored = exists ? this.getWorkspace(userId, ws.id) : undefined;
      ws = { ...ws, ...((opts.demo || stored?.isDemo) ? { isDemo: true } : { isDemo: undefined }) };
      if (!ws.isDemo) delete ws.isDemo;
      // archived is decided by the server only (a client save must not un-archive, nor archive)
      if (stored?.archivedAt) ws.archivedAt = stored.archivedAt; else delete ws.archivedAt;
      // only ids of the library survive, once, in library order
      if (ws.enabledSpecIds !== undefined) ws.enabledSpecIds = LIBRARY.map((x) => x.id).filter((id) => Array.isArray(ws.enabledSpecIds) && ws.enabledSpecIds.includes(id));
      if (!exists) {
        // the showcase workspace is not counted: it never uses up a plan's workspace allowance
        if (!opts.skipLimit && !ws.isDemo && this.listWorkspaces(userId).filter((w) => !w.isDemo && !w.archivedAt).length >= entitlementsOf(ws.planId).workspaces) throw new RepoError('forbidden', workspaceLimitMessage(ws.planId));
        this.db.prepare('INSERT INTO workspaces (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(ws.id, userId, ws.id, JSON.stringify(ws), ws.createdAt);
        this.seedStartNodes({ userId, workspaceId: ws.id });
      } else {
        const r = this.db.prepare('UPDATE workspaces SET data = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(ws), ws.id, userId);
        if (!r.changes) throw new RepoError('forbidden', 'این فضای کاری مال شما نیست.');
      }
      return ws;
    })();
  }

  /** the nodes of a start template (default: the ordinary starting point); none of them is locked */
  private seedStartNodes(s: Scope, template: StartTemplate = DEFAULT_START) {
    const ins = this.db.prepare('INSERT OR IGNORE INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)');
    for (const n of planNodes(template, [], undefined, (k) => k)) ins.run(n.id, s.userId, s.workspaceId, n.parentId ?? null, n.label, n.description, n.order);
  }
  /** an empty / absent node id means «the default place»; a given one must exist */
  private placeNode(s: Scope, nodeId: string | undefined): string {
    const nodes = this.listNodes(s);
    if (!nodeId) return defaultNodeId(nodes);
    if (!nodes.some((n) => n.id === nodeId)) throw new RepoError('invalid', 'گرهٔ مقصد وجود ندارد.');
    return nodeId;
  }

  /**
   * Deletes EVERYTHING that belongs to one workspace (every table that carries `workspace_id`, plus the weekly-review marker) and
   * seeds the five system nodes again. Retired token records remain historical metadata, not content. Used by the
   * showcase workspace's reset, which therefore always rebuilds from nothing.
   */
  resetWorkspaceData(s: Scope) {
    this.assertWorkspace(s);
    this.db.transaction(() => {
      const tables = (this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((t) => t.name);
      for (const t of tables) {
        if (t === 'workspaces' || t === 'mcp_tokens' || t === 'schema_migrations' || t === 'templates') continue; // (a template belongs to the user, not to the workspace it was saved from)
        const cols = (this.db.prepare(`PRAGMA table_info(${JSON.stringify(t)})`).all() as Array<{ name: string }>).map((c) => c.name);
        if (cols.includes('workspace_id')) this.db.prepare(`DELETE FROM ${JSON.stringify(t)} WHERE workspace_id = ?`).run(s.workspaceId);
      }
      this.db.prepare('DELETE FROM kv WHERE user_id = ? AND key = ?').run(s.userId, `weekly_review:${s.workspaceId}`);
      this.seedStartNodes(s);
    })();
  }

  /** run several writes as one unit (all or none) */
  transaction<T>(fn: () => T): T { return this.db.transaction(fn)(); }

  assertWorkspace(s: Scope) {
    if (!this.getWorkspace(s.userId, s.workspaceId)) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
  }

  private planOf(s: Scope) { return this.getWorkspace(s.userId, s.workspaceId)?.planId ?? 'starter'; }

  /** active Context objects (Archived and Superseded do not count against the plan) */
  countActiveObjects(s: Scope): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM context_objects WHERE workspace_id = ? AND user_id = ? AND (sample IS NULL OR sample = 0) AND status NOT IN ('Archived','Superseded')").get(s.workspaceId, s.userId) as { n: number }).n;
  }

  /** how many more objects the plan allows right now (bulk creators — files, notes — stop here instead of failing) */
  objectSlots(s: Scope): number { return this.isDemo(s) ? 1_000_000 : objectsRemaining(this.planOf(s), this.countActiveObjects(s)); }

  /** the showcase workspace (see Workspace.isDemo) */
  isDemo(s: Scope): boolean { return !!this.getWorkspace(s.userId, s.workspaceId)?.isDemo; }

  /** the change-impact engine is a plan entitlement */
  impactEnabled(s: Scope): boolean { return can(this.planOf(s), 'changeImpact'); }

  // ── tree nodes ───────────────────────────────────────────────────────────
  listNodes(s: Scope): TreeNode[] {
    return (this.db.prepare('SELECT * FROM tree_nodes WHERE workspace_id = ? AND user_id = ? ORDER BY ord, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToNode);
  }

  /** a node under `parentId`, or a new ROOT when `parentId` is empty (the tree may have several roots; the first one is the default place) */
  createNode(s: Scope, input: { parentId?: string; label: string; description?: string }): TreeNode {
    const nodes = this.listNodes(s);
    const parentId = input.parentId || undefined;
    const ok = parentId ? canCreateUnder(nodes, parentId, input.label) : input.label.trim() ? { ok: true as const } : { ok: false as const, reason: 'نام گره نمی‌تواند خالی باشد.' };
    if (!ok.ok) throw new RepoError('invalid', ok.reason);
    const node: TreeNode = { id: newId('nd'), label: input.label.trim(), description: input.description?.trim() ?? '', ...(parentId ? { parentId } : {}), order: nextOrder(nodes, parentId) };
    this.db.prepare('INSERT INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)')
        .run(node.id, s.userId, s.workspaceId, node.parentId ?? null, node.label, node.description, node.order);
    return node;
  }

  /** rename works for every node, system or not */
  updateNode(s: Scope, id: string, patch: { label?: string; description?: string }): TreeNode {
    const nodes = this.listNodes(s);
    const cur = nodes.find((n) => n.id === id);
    if (!cur) throw new RepoError('not_found', 'گره پیدا نشد.');
    const label = patch.label ?? cur.label;
    const ok = canRename(nodes, id, label);
    if (!ok.ok) throw new RepoError('invalid', ok.reason);
    const description = patch.description ?? cur.description;
    this.db.prepare('UPDATE tree_nodes SET label = ?, description = ? WHERE workspace_id = ? AND id = ?').run(label.trim(), description, s.workspaceId, id);
    return { ...cur, label: label.trim(), description };
  }

  /** `parentId` '' = the top level. Knowledge, notes, files, relations and history live in the nodes and go with them; the move is one record (`node:<id>`) with an optional reason. */
  moveNode(s: Scope, id: string, parentId: string, index?: number, reason?: string): TreeNode[] {
    return this.db.transaction(() => {
      const nodes = this.listNodes(s);
      const ok = canMove(nodes, id, parentId);
      if (!ok.ok) throw new RepoError('invalid', ok.reason);
      const to = parentId || undefined;
      const here = nodes.find((n) => n.id === id)!;
      const upd = this.db.prepare('UPDATE tree_nodes SET parent_id = ?, ord = ? WHERE workspace_id = ? AND id = ?');
      const moved = movedNodeTree(nodes, id, parentId, index);
      for (const n of moved.filter((item) => (item.parentId ?? undefined) === to)) upd.run(n.parentId ?? null, n.order, s.workspaceId, n.id);
      const label = (pid?: string | null) => (pid ? nodes.find((n) => n.id === pid)?.label ?? '' : 'سطح اصلی');
      if ((here.parentId ?? undefined) !== to) this.recordChange(s, { objectId: `node:${id}`, fromVersion: 0, toVersion: 0, kind: 'node_moved', meta: { actor: 'user', reason: reason?.trim() || `گرهٔ «${here.label}» از «${label(here.parentId)}» به «${label(to)}» رفت` }, before: { parent: label(here.parentId) }, after: { parent: label(to) } });
      return this.listNodes(s);
    })();
  }

  /** Delete a user node: only if empty, or after moving objects, notes, Thoughts, files and child nodes to `transferTo`. */
  deleteNode(s: Scope, id: string, transferTo?: string): TreeNode[] {
    return this.db.transaction(() => {
      const nodes = this.listNodes(s);
      const objects = this.listObjects(s);
      const notes = this.listNotes(s);
      const thoughts = this.listThoughts(s, { includeResolved: true });
      const files = this.listFiles(s);
      const ok = canDelete(nodes, id, objects, notes, transferTo, files, thoughts);
      if (!ok.ok) throw new RepoError(ok.reason.includes('سیستمی') ? 'forbidden' : 'invalid', ok.reason);
      const here = nodes.find((n) => n.id === id)!;
      const target = nodes.find((n) => n.id === transferTo);
      if (transferTo) {
        // nothing is lost or archived in silence: every piece of knowledge that moves gets a Change that says why (and where)
        for (const o of objects.filter((x) => x.nodeId === id)) this.recordChange(s, { objectId: o.id, fromVersion: o.version, toVersion: o.version, kind: 'edited', meta: { actor: 'user', reason: `گرهٔ «${here.label}» حذف شد؛ این دانش به «${target?.label ?? ''}» رفت` }, before: { nodeId: id }, after: { nodeId: transferTo } });
        this.db.prepare('UPDATE context_objects SET node_id = ? WHERE workspace_id = ? AND node_id = ?').run(transferTo, s.workspaceId, id);
        this.db.prepare('UPDATE notes SET node_id = ? WHERE workspace_id = ? AND node_id = ?').run(transferTo, s.workspaceId, id);
        this.db.prepare('UPDATE thoughts SET node_id = ? WHERE workspace_id = ? AND user_id = ? AND node_id = ?').run(transferTo, s.workspaceId, s.userId, id);
        this.db.prepare('UPDATE files SET node_id = ? WHERE workspace_id = ? AND node_id = ?').run(transferTo, s.workspaceId, id);
        const kids = nodes.filter((n) => n.parentId === id);
        const base = nextOrder(nodes, transferTo);
        kids.forEach((k, i) => this.db.prepare('UPDATE tree_nodes SET parent_id = ?, ord = ? WHERE workspace_id = ? AND id = ?').run(transferTo, base + i, s.workspaceId, k.id));
      }
      // the deletion itself is a record too (object id `node:<id>`: it is not in the knowledge feed, but it is there)
      const moved = { objects: objects.filter((x) => x.nodeId === id).length, notes: notes.filter((x) => x.nodeId === id).length, thoughts: thoughts.filter((x) => x.nodeId === id).length, files: files.filter((x) => x.nodeId === id).length, nodes: nodes.filter((n) => n.parentId === id).length };
      this.recordChange(s, { objectId: `node:${id}`, fromVersion: 0, toVersion: 0, kind: 'node_deleted', meta: { actor: 'user', reason: target ? `گرهٔ «${here.label}» حذف شد؛ ${moved.objects} دانش، ${moved.notes} یادداشت، ${moved.thoughts} فکر، ${moved.files} فایل و ${moved.nodes} زیربخش به «${target.label}» رفت` : `گرهٔ خالی «${here.label}» حذف شد` }, before: { label: here.label }, after: {} });
      this.db.prepare('DELETE FROM tree_nodes WHERE workspace_id = ? AND id = ?').run(s.workspaceId, id);
      return this.listNodes(s);
    })();
  }

  // ── context objects ─────────────────────────────────────────────────────
  private setDraft(s: Scope, id: string, draft: ObjectDraft | null) {
    this.db.prepare('UPDATE context_objects SET draft = ? WHERE id = ? AND workspace_id = ?').run(draft ? JSON.stringify(draft) : null, id, s.workspaceId);
  }

  /** «تأیید»: the draft REPLACES the text — a normal confirmed edit (version + 1, a milestone in the history, the reason the user gave) */
  approveDraft(s: Scope, id: string, meta?: ChangeMeta): { object: ContextObject; impact: ImpactResult } {
    const cur = this.getObjectAny(s, id);
    if (!cur?.draft) throw new RepoError('not_found', 'پیش‌نویسی برای تأیید نیست.');
    const d = cur.draft;
    this.setDraft(s, id, null);
    return this.updateObject(s, id, { title: d.title, content: d.content, examples: d.examples ?? null }, { ...meta, reason: meta?.reason ?? d.reason });
  }

  /** «رد»: the draft is thrown away; the approved text never changed */
  rejectDraft(s: Scope, id: string): ContextObject {
    const cur = this.getObjectAny(s, id);
    if (!cur?.draft) throw new RepoError('not_found', 'پیش‌نویسی برای رد نیست.');
    this.setDraft(s, id, null);
    return this.getObjectAny(s, id)!;
  }

  /**
   * THE one door to the user's knowledge for every AI path and every engine (injection, packs, Gap, Readiness,
   * contradictions, the validator, impact …): SAMPLES ARE NOT HERE. A sample (starter / template example) is only visible
   * through `listSampleObjects`, which only the UI's state reads.
   */
  listObjects(s: Scope): ContextObject[] {
    return (this.db.prepare('SELECT * FROM context_objects WHERE workspace_id = ? AND user_id = ? AND (sample IS NULL OR sample = 0) ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToObject);
  }

  /** the examples that came with a starter / template — for display only (grey, «نمونه») */
  listSampleObjects(s: Scope): ContextObject[] {
    return (this.db.prepare('SELECT * FROM context_objects WHERE workspace_id = ? AND user_id = ? AND sample = 1 ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToObject);
  }

  /** hides samples (same door as `listObjects`) */
  getObject(s: Scope, id: string): ContextObject | undefined {
    const o = this.getObjectAny(s, id);
    return o && !o.sample ? o : undefined;
  }

  /** includes samples: only for the editor of an example (replacing it makes it the user's own) and for deleting examples */
  getObjectAny(s: Scope, id: string): ContextObject | undefined {
    const r = this.db.prepare('SELECT * FROM context_objects WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToObject(r) : undefined;
  }

  /**
   * An example from a starter or a template: grey in the UI, invisible to every AI path and engine, no cap, no Change.
   * Applying the same starter twice does not duplicate it (same node + title).
   */
  createSample(s: Scope, input: { id?: string; at?: string; type: ContextType; title: string; content: string; nodeId: string; facets?: string[]; slotKey?: string }): ContextObject | undefined {
    this.assertWorkspace(s);
    this.requireNode(s, input.nodeId);
    const dup = this.db.prepare('SELECT 1 FROM context_objects WHERE workspace_id = ? AND user_id = ? AND node_id = ? AND title = ? AND sample = 1').get(s.workspaceId, s.userId, input.nodeId, input.title.trim());
    if (dup) return undefined;
    const t = input.at ?? now();
    const o: ContextObject = { id: input.id ?? newId('smp'), workspaceId: s.workspaceId, type: input.type, status: 'Confirmed', provenance: 'User Input', title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: 1, sample: true, ...(input.slotKey?.trim() ? { slotKey: input.slotKey.trim() } : {}), ...(cleanFacets(input.facets) ? { facets: cleanFacets(input.facets) } : {}), createdAt: t, updatedAt: t };
    this.insertObject(s, o);
    return o;
  }

  /** remove the examples (all, or only those in some nodes) — they were never knowledge, so nothing is archived */
  deleteSamples(s: Scope, nodeIds?: string[]): number {
    const ids = (this.db.prepare('SELECT id, node_id FROM context_objects WHERE workspace_id = ? AND user_id = ? AND sample = 1').all(s.workspaceId, s.userId) as Array<{ id: string; node_id: string }>).filter((r) => !nodeIds || nodeIds.includes(r.node_id)).map((r) => r.id);
    this.db.transaction(() => {
      for (const id of ids) {
        this.db.prepare('DELETE FROM context_object_versions WHERE object_id = ? AND workspace_id = ?').run(id, s.workspaceId);
        this.db.prepare('DELETE FROM context_objects WHERE id = ? AND workspace_id = ? AND sample = 1').run(id, s.workspaceId);
      }
    })();
    return ids.length;
  }

  listVersions(s: Scope, objectId: string): Array<{ version: number; type: string; title: string; content: string; createdAt: string }> {
    return (this.db.prepare('SELECT * FROM context_object_versions WHERE object_id = ? AND workspace_id = ? AND user_id = ? ORDER BY version DESC').all(objectId, s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ version: r.version as number, type: r.type as string, title: r.title as string, content: r.content as string, createdAt: r.created_at as string }));
  }

  private snapshot(s: Scope, o: Pick<ContextObject, 'id' | 'version' | 'type' | 'title' | 'content'>, at: string) {
    this.db.prepare('INSERT OR REPLACE INTO context_object_versions (object_id, version, user_id, workspace_id, type, title, content, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(o.id, o.version, s.userId, s.workspaceId, o.type, o.title, o.content, at);
  }

  private requireNode(s: Scope, nodeId: string) {
    if (!this.listNodes(s).some((n) => n.id === nodeId)) throw new RepoError('invalid', 'گرهٔ مقصد وجود ندارد.');
  }

  private insertObject(s: Scope, o: ContextObject) {
    this.db.prepare(`INSERT INTO context_objects (id, user_id, workspace_id, type, status, provenance, title, content, node_id, superseded_by_id, created_at, updated_at, version, source, slot_key, reach, valid_until, assumption, review_by, decision_record, facets, sample, examples, draft)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.id, s.userId, s.workspaceId, o.type, o.status, o.provenance, o.title, o.content, o.nodeId, o.supersededById ?? null, o.createdAt, o.updatedAt, o.version, o.source ? JSON.stringify(o.source) : null, o.slotKey ?? null, o.reach ?? null, o.validUntil ?? null, o.assumption ? 1 : null, o.reviewBy ?? null, o.record ? JSON.stringify(o.record) : null, o.facets ? JSON.stringify(o.facets) : null, o.sample ? 1 : null, o.examples ? JSON.stringify(o.examples) : null, o.draft ? JSON.stringify(o.draft) : null);
    this.snapshot(s, o, o.createdAt);
  }

  /** impact of a mutation = assets that are stale after it but were not before */
  private withImpact<T>(s: Scope, run: () => T): { value: T; impact: ImpactResult } {
    if (!this.impactEnabled(s)) return { value: run(), impact: { count: 0, assets: [] } };
    const dels = this.listDeliverables(s);
    const before = this.computeStale(s, dels);
    const value = run();
    const after = this.computeStale(s, dels);
    return { value, impact: this.describeImpact(newlyStale(before, after), dels) };
  }

  /** stale assets with every reason: changed versions AND decisions they rest on (depends_on) that changed unreviewed */
  computeStale(s: Scope, dels: GeneratedDeliverable[] = this.listDeliverables(s)): StaleAsset[] {
    return computeStaleAssets(dels.filter((d) => !d.archivedAt), this.listObjects(s), { relationships: this.listRelationships(s), changes: this.listChanges(s) });
  }

  private describeImpact(list: StaleAsset[], dels: GeneratedDeliverable[]): ImpactResult {
    return { count: list.length, assets: list.map((a) => ({ id: a.deliverableId, title: dels.find((d) => d.id === a.deliverableId)?.title ?? a.deliverableId, reasons: a.reasons.map((r) => r.message) })) };
  }

  createObject(s: Scope, input: ObjectInput & { id?: string }, meta?: ChangeMeta): ContextObject {
    this.assertWorkspace(s);
    if (input.source?.kind === 'mcp') throw new RepoError('invalid', 'این نوع منشأ فقط برای خواندن داده‌های تاریخی پشتیبانی می‌شود.');
    input = { ...input, nodeId: this.placeNode(s, input.nodeId) };
    if (!input.title.trim()) throw new RepoError('invalid', 'عنوان لازم است.');
    if (!CONTEXT_TYPES.includes(input.type)) throw new RepoError('invalid', 'نوع Context باید واقعیت، تصمیم یا خط قرمز باشد؛ خروجی‌ها Context نیستند.');
    if (!input.provenance) throw new RepoError('invalid', 'هیچ Objectی بدون منبع (provenance) ذخیره نمی‌شود.');
    const promotedThought = input.source?.thoughtId ? this.getThought(s, input.source.thoughtId) : undefined;
    if (input.source?.thoughtId && !promotedThought) throw new RepoError('not_found', 'فکر مبدأ پیدا نشد.');
    if (promotedThought) {
      if (promotedThought.status !== 'open') throw new RepoError('invalid', 'این فکر قبلاً به نتیجه رسیده است.');
      if (input.status && input.status !== 'Proposed') throw new RepoError('forbidden', 'فکر فقط می‌تواند دانش پیشنهادی بسازد؛ تأیید با کاربر است.');
      if (promotedThought.kind === 'assumption' && input.type !== 'Fact') throw new RepoError('invalid', 'فرض فقط به‌صورت واقعیتِ برچسب‌خورده به دانش می‌رود.');
      if (promotedThought.kind === 'open_decision' && input.type !== 'Decision') throw new RepoError('invalid', 'تصمیم باز فقط به‌صورت تصمیم به دانش می‌رود.');
      const source = {
        ...input.source!,
        kind: promotedThought.sourceNoteId ? 'note' as const : 'user' as const,
        thoughtId: promotedThought.id,
        ...(promotedThought.sourceNoteId ? { noteId: promotedThought.sourceNoteId } : {}),
        ...(promotedThought.sourceLineKey ? { lineKey: promotedThought.sourceLineKey } : {}),
        quote: promotedThought.text,
      };
      if (!promotedThought.sourceNoteId) { delete source.noteId; delete source.lineKey; }
      input = {
        ...input, status: 'Proposed',
        source,
        ...(promotedThought.kind === 'assumption' ? { assumption: true } : {}),
      };
    }
    if (this.objectSlots(s) <= 0) throw new RepoError('forbidden', objectLimitMessage(this.planOf(s)));
    const t = now();
    const o: ContextObject = { id: input.id ?? newId('ctx'), workspaceId: s.workspaceId, type: input.type, status: input.status ?? 'Confirmed', provenance: input.provenance, title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: 1, ...(input.source ? { source: input.source } : {}), ...(input.slotKey?.trim() ? { slotKey: input.slotKey.trim() } : {}), ...scopeFields(input), ...thinkingFields(input), ...(cleanFacets(input.facets) ? { facets: cleanFacets(input.facets) } : {}), ...(canHaveExamples({ type: input.type, reach: scopeFields(input).reach }) && cleanExamples(input.examples) ? { examples: cleanExamples(input.examples) } : {}), createdAt: t, updatedAt: t };
    this.db.transaction(() => {
      this.insertObject(s, o);
      this.recordChange(s, { objectId: o.id, fromVersion: 0, toVersion: 1, kind: o.provenance === 'Imported' ? 'imported' : 'created', meta, after: { type: o.type, title: o.title, nodeId: o.nodeId, status: o.status }, source: o.source });
      if (promotedThought) this.resolveThought(s, promotedThought.id, { objectId: o.id });
    })();
    return o;
  }

  /** Raw insert for the one-time localStorage import: keeps id, status, timestamps and version as they were. */
  importObject(s: Scope, o: ContextObject, opts: { silent?: boolean } = {}) {
    const node = resolveNodeId(this.listNodes(s), o.nodeId);
    // old localStorage data may carry the retired «Asset» type
    const type = CONTEXT_TYPES.includes(o.type) ? o.type : 'Fact';
    this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM context_objects WHERE id = ?').get(o.id)) return;
      this.insertObject(s, { ...o, type, nodeId: node, version: o.version ?? 1 });
      if (!opts.silent) this.recordChange(s, { objectId: o.id, fromVersion: 0, toVersion: o.version ?? 1, kind: 'created', meta: { actor: 'system', label: 'ورود داده‌های قدیمی' }, at: o.createdAt, after: { type, title: o.title, nodeId: node, status: o.status } });
    })();
  }

  // ── raw inserts that keep ids, versions and timestamps as given — used by the showcase workspace's builder only ──
  importNode(s: Scope, n: TreeNode) {
    this.db.prepare('INSERT OR REPLACE INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)').run(n.id, s.userId, s.workspaceId, n.parentId ?? null, n.label, n.description, n.order ?? 0);
  }

  importVersion(s: Scope, v: { objectId: string; version: number; type: string; title: string; content: string; at: string }) {
    this.db.prepare('INSERT OR REPLACE INTO context_object_versions (object_id, version, user_id, workspace_id, type, title, content, created_at) VALUES (?,?,?,?,?,?,?,?)').run(v.objectId, v.version, s.userId, s.workspaceId, v.type, v.title, v.content, v.at);
  }

  importChange(s: Scope, c: ContextChange) {
    this.db.prepare('INSERT OR REPLACE INTO context_changes (id,user_id,workspace_id,object_id,from_version,to_version,kind,actor,actor_label,reason,before,after,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(c.id, s.userId, s.workspaceId, c.objectId, c.fromVersion, c.toVersion, c.kind, c.actor, c.actorLabel ?? null, c.reason ?? null, c.before ? JSON.stringify(c.before) : null, c.after ? JSON.stringify(c.after) : null, c.at);
  }

  importNote(s: Scope, n: Note) {
    this.db.transaction(() => {
      this.db.prepare('INSERT OR REPLACE INTO notes (id, user_id, workspace_id, node_id, content, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(n.id, s.userId, s.workspaceId, n.nodeId, n.content, n.createdAt, n.updatedAt);
      this.syncNoteThoughts(s, n, true);
    })();
  }

  importFile(s: Scope, f: { id: string; nodeId: string; name: string; mime: string; rawText: string; summary: string; tokens: number; createdAt: string; chunks: Array<{ index: number; text: string; tokens: number }> }) {
    this.db.prepare("INSERT OR REPLACE INTO files (id, user_id, workspace_id, node_id, name, mime, size_bytes, status, tokens, raw_text, summary, created_at) VALUES (?,?,?,?,?,?,?,'ready',?,?,?,?)")
      .run(f.id, s.userId, s.workspaceId, f.nodeId, f.name, f.mime, Buffer.byteLength(f.rawText), f.tokens, f.rawText, f.summary, f.createdAt);
    this.saveChunks(s, f.id, f.chunks);
  }

  importSpec(s: Scope, spec: WorkstreamSpec, createdAt: string) {
    this.db.prepare('INSERT OR REPLACE INTO specs (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(spec.id, s.userId, s.workspaceId, JSON.stringify(spec), createdAt);
  }

  importRelationship(s: Scope, r: ContextRelationship) {
    this.db.prepare('INSERT OR IGNORE INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(r.id, s.userId, s.workspaceId, r.sourceId, r.targetId, r.type, r.createdAt);
  }

  /** Edit in place. title / content / type changes bump `version`; status or node moves do not. */
  updateObject(s: Scope, id: string, patch: Partial<Pick<ContextObject, 'type' | 'title' | 'content' | 'nodeId' | 'status' | 'provenance' | 'slotKey' | 'reach' | 'validUntil'>> & { reach?: unknown; validUntil?: unknown; assumption?: unknown; reviewBy?: unknown; record?: unknown; facets?: unknown; examples?: unknown; /** keep a change of the text as a DRAFT (only for Confirmed knowledge); the approved text stays the truth */ asDraft?: boolean }, meta?: ChangeMeta): { object: ContextObject; impact: ImpactResult } {
    const cur = this.getObjectAny(s, id); // an example can be edited: writing over it makes it the user's own
    if (!cur) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (patch.asDraft && cur.status === 'Confirmed' && !cur.sample) {
      // the TEXT (title, text, examples) of confirmed knowledge becomes a draft; the rest of the patch (where it lives, status, reach …) applies as before
      const title = typeof patch.title === 'string' ? patch.title.trim() || cur.title : cur.title;
      const content = typeof patch.content === 'string' ? patch.content : cur.content;
      const examples = 'examples' in patch ? cleanExamples(patch.examples) : cur.draft?.examples ?? cur.examples;
      const same = title === cur.title && content === cur.content && JSON.stringify(examples ?? null) === JSON.stringify(cur.examples ?? null);
      const { title: _t, content: _c, examples: _e, asDraft: _d, ...rest } = patch;
      void _t; void _c; void _e; void _d;
      this.setDraft(s, id, same ? null : { title, content, ...(examples ? { examples } : {}), at: now(), ...(meta?.reason ? { reason: meta.reason } : {}) });
      return this.updateObject(s, id, rest, { ...meta, reason: undefined });
    }
    // writing the text directly replaces it AND whatever draft was waiting (a draft never survives a direct replace)
    if (cur.draft && ('content' in patch || 'title' in patch)) this.setDraft(s, id, null);
    if (patch.nodeId) this.requireNode(s, patch.nodeId);
    if (patch.type && !CONTEXT_TYPES.includes(patch.type)) throw new RepoError('invalid', 'نوع Context باید واقعیت، تصمیم یا خط قرمز باشد.');
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const next: ContextObject = { ...cur, ...(patch as Partial<ContextObject>), title: (patch.title ?? cur.title).trim() || cur.title, updatedAt: now() };
      if (!next.slotKey?.trim()) delete next.slotKey; else next.slotKey = next.slotKey.trim();
      // scope: only when the patch mentions it (null / '' clears); invalid values are ignored
      delete next.reach; delete next.validUntil;
      const sc = scopeFields('reach' in patch ? patch : cur), sd = scopeFields('validUntil' in patch ? patch : cur);
      if (sc.reach) next.reach = sc.reach;
      if (sd.validUntil) next.validUntil = sd.validUntil;
      // assumption (a Fact only), its review date, a Decision's record: only when the patch mentions them (null / false clears)
      delete next.assumption; delete next.reviewBy; delete next.record;
      const th = thinkingFields({ type: next.type, assumption: 'assumption' in patch ? patch.assumption : cur.assumption, reviewBy: 'reviewBy' in patch ? patch.reviewBy : cur.reviewBy, record: 'record' in patch ? patch.record : cur.record });
      Object.assign(next, th);
      // facets: only when the patch mentions them (null / [] clears)
      delete next.facets;
      const fc = cleanFacets('facets' in patch ? patch.facets : cur.facets);
      if (fc) next.facets = fc;
      // examples of a red line: only when the patch mentions them (null / [] clears); only a red line keeps them
      delete next.examples;
      const ex = cleanExamples('examples' in patch ? patch.examples : cur.examples);
      if (ex && canHaveExamples(next)) next.examples = ex;
      // an example the user edits (text, type, status) is hers from now on; it enters every engine and AI path only then
      delete next.sample;
      const stillSample = !!cur.sample && next.title === cur.title && next.content === cur.content && next.type === cur.type && next.status === cur.status && JSON.stringify(next.examples ?? null) === JSON.stringify(cur.examples ?? null);
      if (stillSample) next.sample = true;
      else if (cur.sample && this.objectSlots(s) <= 0) throw new RepoError('forbidden', objectLimitMessage(this.planOf(s)));
      const contentChanged = (!!next.assumption !== !!cur.assumption) || JSON.stringify(next.record ?? null) !== JSON.stringify(cur.record ?? null) || next.title !== cur.title || next.content !== cur.content || next.type !== cur.type || JSON.stringify(next.examples ?? null) !== JSON.stringify(cur.examples ?? null) || next.reach !== cur.reach || next.validUntil !== cur.validUntil;
      if (contentChanged) next.version = cur.version + 1;
      this.db.prepare('UPDATE context_objects SET type=?, status=?, provenance=?, title=?, content=?, node_id=?, version=?, updated_at=?, slot_key=?, reach=?, valid_until=?, assumption=?, review_by=?, decision_record=?, facets=?, sample=?, examples=? WHERE id=? AND workspace_id=?')
        .run(next.type, next.status, next.provenance, next.title, next.content, next.nodeId, next.version, next.updatedAt, next.slotKey ?? null, next.reach ?? null, next.validUntil ?? null, next.assumption ? 1 : null, next.reviewBy ?? null, next.record ? JSON.stringify(next.record) : null, next.facets ? JSON.stringify(next.facets) : null, next.sample ? 1 : null, next.examples ? JSON.stringify(next.examples) : null, id, s.workspaceId);
      if (contentChanged) this.snapshot(s, next, next.updatedAt);
      // one record for a status transition, one for everything else that changed (edit / move / slot) — never silent
      const st = diffFields({ status: cur.status }, { status: next.status }, ['status']);
      if (st) this.recordChange(s, { objectId: id, fromVersion: cur.version, toVersion: cur.version, kind: statusChangeKind(cur.status, next.status), meta, before: st.before, after: st.after });
      const rest = diffFields(cur, next, ['type', 'title', 'content', 'nodeId', 'slotKey', 'provenance', 'reach', 'validUntil', 'assumption', 'reviewBy', 'record', 'facets', 'examples']);
      // a reason belongs to an edit of CONFIRMED knowledge; a draft (Proposed / Needs Review …) carries none (src/core/versionHistory.ts)
      if (rest) this.recordChange(s, { objectId: id, fromVersion: cur.version, toVersion: next.version, kind: meta?.kind ?? 'edited', meta: reasonAllowed(cur.status) ? meta : { ...meta, reason: undefined }, before: rest.before, after: rest.after });
      return next;
    })());
    return { object: value, impact };
  }

  /** A new object that replaces `oldId`: version = old + 1, relationship `supersedes`, old becomes Superseded (never deleted). */
  supersedeObject(s: Scope, oldId: string, input: ObjectInput, meta?: ChangeMeta): { object: ContextObject; previous: ContextObject; impact: ImpactResult } {
    const old = this.getObject(s, oldId);
    if (!old) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (old.status === 'Superseded') throw new RepoError('invalid', 'این مورد قبلاً جایگزین شده است.');
    this.requireNode(s, input.nodeId);
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const t = now();
      const created: ContextObject = { id: newId('ctx'), workspaceId: s.workspaceId, type: input.type, status: input.status ?? 'Confirmed', provenance: input.provenance, title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: old.version + 1, ...((input.slotKey ?? old.slotKey) ? { slotKey: (input.slotKey ?? old.slotKey)! } : {}), ...scopeFields({ reach: input.reach ?? old.reach, validUntil: input.validUntil ?? old.validUntil }), ...thinkingFields({ type: input.type, assumption: input.assumption ?? old.assumption, reviewBy: input.reviewBy ?? old.reviewBy, record: input.record ?? old.record }), ...(canHaveExamples({ type: input.type, reach: input.reach ?? old.reach }) && cleanExamples(input.examples ?? old.examples) ? { examples: cleanExamples(input.examples ?? old.examples) } : {}), createdAt: t, updatedAt: t };
      this.insertObject(s, created);
      this.db.prepare("UPDATE context_objects SET status='Superseded', superseded_by_id=?, updated_at=? WHERE id=? AND workspace_id=?").run(created.id, t, oldId, s.workspaceId);
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(newId('rel'), s.userId, s.workspaceId, created.id, oldId, 'supersedes', t);
      this.carryDependencies(s, oldId, created.id);
      this.recordChange(s, { objectId: oldId, fromVersion: old.version, toVersion: created.version, kind: 'superseded', meta, before: { status: old.status }, after: { status: 'Superseded', supersededById: created.id }, source: created.source });
      this.recordChange(s, { objectId: created.id, fromVersion: old.version, toVersion: created.version, kind: 'created', meta: { ...meta, reason: undefined }, after: { type: created.type, title: created.title, nodeId: created.nodeId, status: created.status, supersedes: oldId }, source: created.source });
      return created;
    })());
    return { object: value, previous: this.getObject(s, oldId)!, impact };
  }

  // ── Change log (append-only; `reason` is for people and is never injected into a model) ──
  recordChange(s: Scope, c: { objectId: string; fromVersion: number; toVersion: number; kind: ContextChangeKind; meta?: ChangeMeta; before?: Record<string, unknown>; after?: Record<string, unknown>; source?: ObjectSource; at?: string }) {
    const inferred = actorOfSource(c.source);
    const actor = c.meta?.actor ?? inferred.actor;
    const label = c.meta?.label ?? (c.meta?.actor ? undefined : inferred.label);
    this.db.prepare('INSERT INTO context_changes (id,user_id,workspace_id,object_id,from_version,to_version,kind,actor,actor_label,reason,before,after,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(newId('chg'), s.userId, s.workspaceId, c.objectId, c.fromVersion, c.toVersion, c.kind, actor, label ?? null, c.meta?.reason?.trim() || null, c.before ? JSON.stringify(c.before) : null, c.after ? JSON.stringify(c.after) : null, c.at ?? now());
  }

  listChanges(s: Scope, f: { objectId?: string; since?: string; limit?: number; includeNodes?: boolean } = {}): ContextChange[] {
    const where = ['workspace_id = ?', 'user_id = ?']; const args: unknown[] = [s.workspaceId, s.userId];
    if (!f.includeNodes) where.push("object_id NOT LIKE 'node:%' AND object_id NOT LIKE 'metric:%'"); // records about a node or a metric (not a Context object) are read only on request
    if (f.objectId) { where.push('object_id = ?'); args.push(f.objectId); }
    if (f.since) { where.push('at >= ?'); args.push(f.since); }
    const rows = this.db.prepare(`SELECT * FROM context_changes WHERE ${where.join(' AND ')} ORDER BY at, rowid LIMIT ?`).all(...args, f.limit ?? 5000) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string, workspaceId: r.workspace_id as string, objectId: r.object_id as string, fromVersion: r.from_version as number, toVersion: r.to_version as number,
      kind: r.kind as ContextChangeKind, actor: r.actor as ContextChangeActor, ...(r.actor_label ? { actorLabel: r.actor_label as string } : {}), ...(r.reason ? { reason: r.reason as string } : {}),
      ...(r.before ? { before: JSON.parse(r.before as string) } : {}), ...(r.after ? { after: JSON.parse(r.after as string) } : {}), at: r.at as string,
    }));
  }

  /** «بدون تغییر بپذیر»: the user looked at an object whose dependency changed and keeps it as it is. */
  acceptReview(s: Scope, objectId: string, meta?: ChangeMeta): ContextChange {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'review_accepted', meta: { actor: 'user', ...meta } });
    const all = this.listChanges(s, { objectId });
    return all[all.length - 1];
  }

  // ── boards («بوم»): declared position. lane/rank mean something (status column, explicit priority); x/y are display only ──
  listCanvasItems(s: Scope, view: 'decisions' | 'free'): Array<{ itemRef: string; lane?: string; rank?: number; x?: number; y?: number }> {
    return (this.db.prepare('SELECT * FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = ?').all(s.workspaceId, s.userId, view) as Array<Record<string, unknown>>)
      .map((r) => ({ itemRef: r.item_ref as string, ...(r.lane ? { lane: r.lane as string } : {}), ...(r.rank !== null ? { rank: r.rank as number } : {}), ...(r.x !== null ? { x: r.x as number } : {}), ...(r.y !== null ? { y: r.y as number } : {}) }));
  }

  saveCanvasItem(s: Scope, view: 'decisions' | 'free', itemRef: string, v: { lane?: string; rank?: number; x?: number; y?: number }) {
    this.db.prepare(`INSERT INTO canvas_view_items (user_id, workspace_id, view, item_ref, lane, rank, x, y) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(workspace_id, view, item_ref) DO UPDATE SET lane = COALESCE(excluded.lane, lane), rank = COALESCE(excluded.rank, rank), x = COALESCE(excluded.x, x), y = COALESCE(excluded.y, y)`)
      .run(s.userId, s.workspaceId, view, itemRef, v.lane ?? null, v.rank ?? null, v.x ?? null, v.y ?? null);
  }

  removeCanvasItem(s: Scope, view: 'decisions' | 'free', itemRef: string) {
    this.db.prepare('DELETE FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = ? AND item_ref = ?').run(s.workspaceId, s.userId, view, itemRef);
  }

  clearCanvas(s: Scope, view: 'decisions' | 'free') {
    this.db.prepare('DELETE FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = ?').run(s.workspaceId, s.userId, view);
  }

  /** an explicit priority inside a column IS meaning, so it is a Change (kind edited, field `rank`); the position of free notes is not */
  setRank(s: Scope, objectId: string, rank: number, lane: string, meta?: ChangeMeta) {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    const before = this.listCanvasItems(s, 'decisions').find((i) => i.itemRef === `obj:${objectId}`)?.rank;
    this.db.transaction(() => {
      this.saveCanvasItem(s, 'decisions', `obj:${objectId}`, { lane, rank });
      this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'edited', meta, before: { rank: before ?? null }, after: { rank } });
    })();
  }

  // ── depends_on (docs/spine.md): read by decisionGraph and impactEngine ──────────
  dependenciesOf(s: Scope, objectId: string): string[] {
    return this.listRelationships(s).filter((r) => r.type === 'depends_on' && r.sourceId === objectId).map((r) => r.targetId);
  }

  /** Replaces the set of objects `objectId` depends on. Cycles are allowed (a «concurrent decision»); a self-dependency is not. */
  setDependencies(s: Scope, objectId: string, dependsOn: string[], meta?: ChangeMeta): { relationships: ContextRelationship[]; change?: ContextChange } {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    const want = [...new Set(dependsOn)].sort();
    if (want.length > 20) throw new RepoError('invalid', 'یک مورد حداکثر به ۲۰ مورد دیگر وابسته می‌شود.');
    for (const id of want) {
      if (id === objectId) throw new RepoError('invalid', 'یک مورد نمی‌تواند به خودش وابسته باشد.');
      const t = this.getObject(s, id);
      if (!t) throw new RepoError('not_found', 'یکی از مورد‌های وابستگی پیدا نشد.');
      if (t.status === 'Superseded' || t.status === 'Archived') throw new RepoError('invalid', 'به مورد جایگزین‌شده یا بایگانی‌شده نمی‌شود وابسته شد.');
    }
    const have = this.dependenciesOf(s, objectId).sort();
    if (have.join('|') === want.join('|')) return { relationships: this.listRelationships(s) };
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM context_relationships WHERE workspace_id = ? AND user_id = ? AND type = 'depends_on' AND source_id = ?").run(s.workspaceId, s.userId, objectId);
      const t = now();
      for (const id of want) this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, objectId, id, 'depends_on', t);
      this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'edited', meta, before: { dependsOn: have }, after: { dependsOn: want } });
    })();
    const all = this.listChanges(s, { objectId });
    return { relationships: this.listRelationships(s), change: all[all.length - 1] };
  }

  /**
   * «نتیجه چه شد؟»: the answer to a due decision is a Change (kind `outcome_noted`); the text is for people, never for a model.
   * With a metric expectation the user's verdict (met / partial / missed) is written into the Change, with the metric and the
   * last confirmed number it was read against — the data a later analysis would need, nothing derived from it here.
   */
  noteOutcome(s: Scope, objectId: string, text: string, meta?: ChangeMeta, verdict?: ExpectationVerdict): ContextChange {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (o.type !== 'Decision') throw new RepoError('invalid', 'نتیجه فقط برای تصمیم ثبت می‌شود.');
    if (verdict !== undefined && verdict !== 'met' && verdict !== 'partial' && verdict !== 'missed') throw new RepoError('invalid', 'داوری معتبر نیست.');
    const t = text.trim();
    if (!t && !verdict) throw new RepoError('invalid', 'نتیجه را بنویس.');
    const exp = o.record?.metricExpectation;
    const last = verdict && exp ? this.listMeasurements(s, { metricId: exp.metricId, status: 'Confirmed' }).filter((m) => m.at <= exp.by).at(-1) : undefined;
    const VERDICT_FA = { met: 'به انتظار رسید', partial: 'نیمه', missed: 'نرسید' } as const;
    this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'outcome_noted', meta: { ...meta, reason: (t || (verdict ? VERDICT_FA[verdict] : '')).slice(0, 1000) },
      ...(verdict ? { after: { verdict, ...(exp ? { metricId: exp.metricId } : {}), ...(last ? { measurementId: last.id, value: last.value, valueAt: last.at } : {}) } } : {}) });
    const all = this.listChanges(s, { objectId });
    return all[all.length - 1];
  }

  /**
   * «تبدیل به گره»: every `##` section of a note becomes a child node of the note's node, holding that section as its
   * own note. The original note is untouched. One Change per new node (object id `node:<id>`), so the record is there.
   */
  nodesFromNote(s: Scope, noteId: string, sections: Array<{ title: string; body: string }>, meta?: ChangeMeta): TreeNode[] {
    const note = this.getNote(s, noteId);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const clean = sections.map((x) => ({ title: x.title.trim().slice(0, 80), body: x.body.trim() })).filter((x) => x.title).slice(0, 12);
    if (clean.length < 2) throw new RepoError('invalid', 'برای تبدیل به گره دست‌کم دو تیتر ## لازم است.');
    return this.db.transaction(() => {
      const created: TreeNode[] = [];
      for (const sec of clean) {
        const node = this.createNode(s, { parentId: note.nodeId, label: sec.title });
        if (sec.body) this.createNote(s, node.id, sec.body);
        this.recordChange(s, { objectId: `node:${node.id}`, fromVersion: 0, toVersion: 0, kind: 'node_from_note', meta: { ...meta, reason: meta?.reason ?? 'بخش بزرگ‌شدهٔ یادداشت به گره تبدیل شد؛ متن اصلی یادداشت می‌ماند.' }, after: { nodeId: node.id, parentId: note.nodeId, noteId, title: sec.title } });
        created.push(node);
      }
      return created;
    })();
  }

  // ── overrides (docs/spine.md): a child-node object switches an ancestor-node object off for its sub-tree; read by effectiveContext ──
  overridesOf(s: Scope, objectId: string): string[] {
    return this.listRelationships(s).filter((r) => r.type === 'overrides' && r.sourceId === objectId).map((r) => r.targetId);
  }
  /** `byId` (in a descendant node) overrides `targetId` (in an ancestor node). The reason is required and lives in the Change. */
  setOverride(s: Scope, byId: string, targetId: string, meta?: ChangeMeta): { relationships: ContextRelationship[]; change?: ContextChange } {
    const by = this.getObject(s, byId), target = this.getObject(s, targetId);
    const problem = overrideProblem(by, target, this.listNodes(s));
    if (problem) throw new RepoError('invalid', problem);
    if (by!.status === 'Superseded' || by!.status === 'Archived' || target!.status === 'Superseded' || target!.status === 'Archived') throw new RepoError('invalid', 'مورد جایگزین‌شده یا بایگانی‌شده را نمی‌شود کنار گذاشت یا جایگزین کرد.');
    if (!meta?.reason?.trim()) throw new RepoError('invalid', 'برای کنار گذاشتن یک خط قرمز یا تصمیم، دلیل لازم است.');
    const have = this.overridesOf(s, byId).sort();
    if (have.includes(targetId)) return { relationships: this.listRelationships(s) };
    const want = [...have, targetId].sort();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, byId, targetId, 'overrides', now());
      this.recordChange(s, { objectId: byId, fromVersion: by!.version, toVersion: by!.version, kind: 'edited', meta, before: { overrides: have }, after: { overrides: want } });
    })();
    const all = this.listChanges(s, { objectId: byId });
    return { relationships: this.listRelationships(s), change: all[all.length - 1] };
  }
  removeOverride(s: Scope, byId: string, targetId: string, meta?: ChangeMeta): { relationships: ContextRelationship[] } {
    const by = this.getObject(s, byId);
    if (!by) throw new RepoError('not_found', 'Context پیدا نشد.');
    const have = this.overridesOf(s, byId).sort();
    if (!have.includes(targetId)) return { relationships: this.listRelationships(s) };
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM context_relationships WHERE workspace_id = ? AND user_id = ? AND type = 'overrides' AND source_id = ? AND target_id = ?").run(s.workspaceId, s.userId, byId, targetId);
      this.recordChange(s, { objectId: byId, fromVersion: by.version, toVersion: by.version, kind: 'edited', meta, before: { overrides: have }, after: { overrides: have.filter((x) => x !== targetId) } });
    })();
    return { relationships: this.listRelationships(s) };
  }

  /** when an object is replaced, whatever rested on it (and whatever it rested on) now points at the replacement too; old edges stay as history */
  private carryDependencies(s: Scope, fromId: string, toId: string) {
    const t = now();
    const rels = this.listRelationships(s).filter((r) => r.type === 'depends_on');
    const has = new Set(rels.map((r) => `${r.sourceId}>${r.targetId}`));
    const add = (a: string, b: string) => {
      if (a === b || has.has(`${a}>${b}`)) return;
      has.add(`${a}>${b}`);
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, a, b, 'depends_on', t);
    };
    for (const r of rels) {
      if (r.targetId === fromId) add(r.sourceId, toId);
      if (r.sourceId === fromId) add(toId, r.targetId);
    }
  }

  listRelationships(s: Scope): ContextRelationship[] {
    return (this.db.prepare('SELECT * FROM context_relationships WHERE workspace_id = ? AND user_id = ? ORDER BY created_at').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ id: r.id as string, sourceId: r.source_id as string, targetId: r.target_id as string, type: r.type as ContextRelationship['type'], createdAt: r.created_at as string }));
  }

  // ── notes & thoughts ────────────────────────────────────────────────────────
  listThoughts(s: Scope, opts: { includeResolved?: boolean } = {}): Thought[] {
    const status = opts.includeResolved ? '' : " AND status = 'open'";
    const rows = this.db.prepare(`SELECT * FROM thoughts WHERE workspace_id = ? AND user_id = ?${status} ORDER BY created_at, id`).all(s.workspaceId, s.userId) as Array<Record<string, unknown>>;
    const aboutMap = new Map<string, { objectIds: string[]; nodeIds: string[] }>();
    const aboutRows = this.db.prepare('SELECT thought_id, target_kind, target_id FROM thought_about WHERE workspace_id = ? AND user_id = ?').all(s.workspaceId, s.userId) as Array<{ thought_id: string; target_kind: string; target_id: string }>;
    for (const a of aboutRows) {
      let cur = aboutMap.get(a.thought_id);
      if (!cur) { cur = { objectIds: [], nodeIds: [] }; aboutMap.set(a.thought_id, cur); }
      if (a.target_kind === 'object') cur.objectIds.push(a.target_id);
      else if (a.target_kind === 'node') cur.nodeIds.push(a.target_id);
    }
    return rows.map((r) => rowToThought(r, aboutMap.get(r.id as string)));
  }

  getThought(s: Scope, id: string): Thought | undefined {
    const r = this.db.prepare('SELECT * FROM thoughts WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    if (!r) return undefined;
    let about: { objectIds: string[]; nodeIds: string[] } | undefined;
    const aboutRows = this.db.prepare('SELECT target_kind, target_id FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').all(id, s.workspaceId, s.userId) as Array<{ target_kind: string; target_id: string }>;
    about = {
      objectIds: aboutRows.filter((a) => a.target_kind === 'object').map((a) => a.target_id),
      nodeIds: aboutRows.filter((a) => a.target_kind === 'node').map((a) => a.target_id),
    };
    return rowToThought(r, about);
  }

  insertThought(s: Scope, input: { id?: string; nodeId: string; kind: ThoughtKind | null; text: string; sourceNoteId?: string; sourceLine?: number; sourceLineKey?: string; sourceQuote?: string; inferred?: boolean; status?: Thought['status']; resolvedObjectId?: string; at?: string; about?: Array<{ kind: 'object' | 'node'; id: string }> }): Thought {
    if (!input.text.trim()) throw new RepoError('invalid', 'متن فکر لازم است.');
    this.requireNode(s, input.nodeId);
    if (input.sourceNoteId && !this.getNote(s, input.sourceNoteId)) throw new RepoError('not_found', 'یادداشت منبع پیدا نشد.');
    const at = input.at ?? now();
    const thought: Thought = {
      id: input.id ?? newId('thought'), workspaceId: s.workspaceId, nodeId: input.nodeId, kind: input.kind,
      text: input.text, status: input.status ?? 'open',
      ...(input.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
      ...(input.sourceLine !== undefined ? { sourceLine: input.sourceLine } : {}),
      ...(input.sourceLineKey ? { sourceLineKey: input.sourceLineKey } : {}),
      ...(input.sourceQuote ? { sourceQuote: input.sourceQuote } : {}),
      ...(input.inferred ? { inferred: true } : {}),
      ...(input.resolvedObjectId ? { resolvedObjectId: input.resolvedObjectId } : {}),
      createdAt: at, updatedAt: at,
    };
    this.db.prepare(`INSERT INTO thoughts (id,user_id,workspace_id,node_id,kind,text,status,source_note_id,source_line,source_line_key,source_quote,inferred,resolved_object_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(thought.id, s.userId, s.workspaceId, thought.nodeId, thought.kind, thought.text, thought.status,
      thought.sourceNoteId ?? null, thought.sourceLine ?? null, thought.sourceLineKey ?? null, thought.sourceQuote ?? null, thought.inferred ? 1 : 0,
      thought.resolvedObjectId ?? null, thought.createdAt, thought.updatedAt);

    this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(newId('th_ev'), thought.id, s.userId, s.workspaceId, 'created', null, thought.text, 'user', at);

    const insAbout = this.db.prepare('INSERT OR IGNORE INTO thought_about (thought_id,target_kind,target_id,user_id,workspace_id,created_at) VALUES (?,?,?,?,?,?)');
    if (input.about?.length) {
      for (const target of input.about) insAbout.run(thought.id, target.kind, target.id, s.userId, s.workspaceId, at);
    } else if (input.text.includes('@«')) {
      const TOKEN = /@«([^»\n]+)»/g;
      const matches = [...input.text.matchAll(TOKEN)];
      if (matches.length > 0) {
        const objects = this.listObjects(s);
        const nodes = this.listNodes(s);
        for (const m of matches) {
          const k = normalizeFa(m[1].replace(/\s+/g, ' ').trim());
          const wsObjs = objects.filter((o) => normalizeFa(o.title.replace(/\s+/g, ' ').trim()) === k);
          if (wsObjs.length === 1) {
            insAbout.run(thought.id, 'object', wsObjs[0].id, s.userId, s.workspaceId, at);
            continue;
          }
          if (wsObjs.length > 1) continue;
          const wsNodes = nodes.filter((n) => normalizeFa(n.label.replace(/\s+/g, ' ').trim()) === k);
          if (wsNodes.length === 1) {
            insAbout.run(thought.id, 'node', wsNodes[0].id, s.userId, s.workspaceId, at);
          }
        }
      }
    }

    return this.getThought(s, thought.id)!;
  }

  /**
   * Note lines ↔ Thoughts (docs/spine.md → «یادداشت ماده است، فکر هویت دارد»). A note line is matched to a Thought in this order:
   *   1. the same line with the same text (or the same text moved to another line) — nothing changes except where it sits;
   *   2. an EDITED line: an open, unconverted Thought of this note whose anchor (its line, its original words) is close to the new
   *      line — the same line and ≥ 25% shared words, or ≥ 50% shared words anywhere — is REVISED (same id; a purely cosmetic
   *      change records no revision), never duplicated;
   *   3. a resolved (converted) Thought that matches the same way is left alone: editing the note neither changes it nor makes a twin;
   *   4. only a line that matches nothing makes a new Thought.
   * A Thought whose line is gone stays OPEN (it is the user's) with `sourceState = 'line_deleted'`; it is never closed or erased in silence.
   */
  private syncNoteThoughts(s: Scope, note: Note, deterministicIds = false): void {
    const current = this.db.prepare('SELECT * FROM thoughts WHERE workspace_id = ? AND user_id = ? AND source_note_id = ? ORDER BY source_line,id').all(s.workspaceId, s.userId, note.id) as Array<Record<string, unknown>>;
    const anchored = current.filter((t) => t.source_line !== null).map((r) => rowToThought(r));
    const used = new Set<string>();
    const pairs = parseThinking(note.content).map((item, ordinal) => ({ item, ordinal, thought: undefined as Thought | undefined, edited: false }));
    for (const p of pairs) { // 1. exact
      const hit = anchored.find((t) => !used.has(t.id) && t.sourceLine === p.item.line && t.sourceLineKey === p.item.hash)
        ?? anchored.find((t) => !used.has(t.id) && t.sourceLineKey === p.item.hash);
      if (hit) { used.add(hit.id); p.thought = hit; }
    }
    const words = (x: string) => titleTokens(x);
    for (const p of pairs) { // 2 & 3. an edited line
      if (p.thought) continue;
      let best: { t: Thought; sim: number; gap: number } | undefined;
      for (const t of anchored) {
        if (used.has(t.id)) continue;
        const sim = Math.max(jaccard(words(p.item.text), words(t.sourceQuote ?? t.text)), jaccard(words(p.item.text), words(t.text)));
        const near = t.sourceLine === p.item.line;
        if (!((near && sim >= 0.25) || sim >= 0.5)) continue;
        const gap = Math.abs((t.sourceLine ?? 0) - p.item.line);
        if (!best || sim > best.sim || (sim === best.sim && gap < best.gap)) best = { t, sim, gap };
      }
      if (best) { used.add(best.t.id); p.thought = best.t; p.edited = true; }
    }
    const at = now();
    for (const p of pairs) {
      const { item, thought } = p;
      if (!thought) { // 4. really new
        this.insertThought(s, {
          ...(deterministicIds && current.length === 0 ? { id: `imported_thought_${note.id}_${p.ordinal}` } : {}), nodeId: note.nodeId, kind: item.kind, text: item.text, sourceNoteId: note.id,
          sourceLine: item.line, sourceLineKey: item.hash, sourceQuote: item.text, inferred: item.inferred,
          at: note.createdAt,
        });
        continue;
      }
      if (p.edited) {
        if (thought.status === 'open') this.reviseThought(s, thought.id, item.text); // same id; cosmetic changes record nothing
        this.db.prepare('UPDATE thoughts SET kind = ?, inferred = ?, source_line = ?, source_line_key = ?, source_quote = ?, source_state = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
          .run(thought.status === 'open' ? item.kind : thought.kind, thought.status === 'open' ? (item.inferred ? 1 : 0) : (thought.inferred ? 1 : 0), item.line, item.hash, item.text, at, thought.id, s.workspaceId, s.userId);
        continue;
      }
      if (thought.kind !== item.kind || thought.inferred !== item.inferred || thought.sourceLine !== item.line || thought.sourceState) {
        this.db.prepare('UPDATE thoughts SET kind = ?, inferred = ?, source_line = ?, source_state = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
          .run(item.kind, item.inferred ? 1 : 0, item.line, at, thought.id, s.workspaceId, s.userId);
      }
    }
    for (const t of anchored) { // the line is gone: the thought stays, open, and says so
      if (used.has(t.id) || t.sourceState === 'line_deleted') continue;
      this.db.prepare("UPDATE thoughts SET source_state = 'line_deleted', updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?").run(at, t.id, s.workspaceId, s.userId);
      this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(newId('th_ev'), t.id, s.userId, s.workspaceId, 'source_line_deleted', null, null, 'user', at);
    }
  }

  /**
   * Erase thoughts for good: the row, every revision, every event, what they were about and their derivation links — and the pointer
   * knowledge keeps to them (`source.thoughtId`). Used by «حذف یادداشت با فکرهایش» and by the permanent delete of knowledge.
   */
  eraseThoughts(s: Scope, ids: string[]): number {
    const set = [...new Set(ids)];
    if (!set.length) return 0;
    const w = s.workspaceId, u = s.userId;
    let n = 0;
    this.db.transaction(() => {
      for (const id of set) {
        n += this.db.prepare('DELETE FROM thoughts WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u).changes;
        this.db.prepare('DELETE FROM thought_revisions WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u);
        this.db.prepare('DELETE FROM thought_events WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u);
        this.db.prepare('DELETE FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u);
        this.db.prepare('DELETE FROM thought_derivations WHERE workspace_id = ? AND user_id = ? AND (parent_id = ? OR child_id = ?)').run(w, u, id, id);
      }
      // knowledge that came from an erased thought keeps its own text but not the pointer
      for (const o of this.db.prepare("SELECT id, source FROM context_objects WHERE workspace_id = ? AND user_id = ? AND source LIKE '%thoughtId%'").all(w, u) as Array<{ id: string; source: string }>) {
        const src = JSON.parse(o.source) as ObjectSource;
        if (!src.thoughtId || !set.includes(src.thoughtId)) continue;
        const { thoughtId: _t, ...rest } = src;
        this.db.prepare('UPDATE context_objects SET source = ? WHERE id = ? AND workspace_id = ?').run(JSON.stringify(rest), o.id, w);
      }
    })();
    return n;
  }

  reviseThought(s: Scope, id: string, text: string): { thought: Thought; revisions: ThoughtRevision[] } {
    const cur = this.getThought(s, id);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    if (!text.trim()) throw new RepoError('invalid', 'متن فکر لازم است.');
    const at = now();
    if (lineHash(cur.text) !== lineHash(text)) {
      const nextRevision = (this.db.prepare('SELECT COALESCE(MAX(revision),0)+1 AS n FROM thought_revisions WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as { n: number }).n;
      this.db.prepare('INSERT INTO thought_revisions (thought_id,revision,user_id,workspace_id,before_text,after_text,at) VALUES (?,?,?,?,?,?,?)')
        .run(id, nextRevision, s.userId, s.workspaceId, cur.text, text, at);
      this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(newId('th_ev'), id, s.userId, s.workspaceId, 'revised', cur.text, text, 'user', at);
    }
    if (text.includes('@«')) {
      const TOKEN = /@«([^»\n]+)»/g;
      const matches = [...text.matchAll(TOKEN)];
      if (matches.length > 0) {
        const objects = this.listObjects(s);
        const nodes = this.listNodes(s);
        const insAbout = this.db.prepare('INSERT OR IGNORE INTO thought_about (thought_id,target_kind,target_id,user_id,workspace_id,created_at) VALUES (?,?,?,?,?,?)');
        for (const m of matches) {
          const k = normalizeFa(m[1].replace(/\s+/g, ' ').trim());
          const wsObjs = objects.filter((o) => normalizeFa(o.title.replace(/\s+/g, ' ').trim()) === k);
          if (wsObjs.length === 1) {
            insAbout.run(id, 'object', wsObjs[0].id, s.userId, s.workspaceId, at);
            continue;
          }
          if (wsObjs.length > 1) continue;
          const wsNodes = nodes.filter((n) => normalizeFa(n.label.replace(/\s+/g, ' ').trim()) === k);
          if (wsNodes.length === 1) {
            insAbout.run(id, 'node', wsNodes[0].id, s.userId, s.workspaceId, at);
          }
        }
      }
    }
    this.db.prepare('UPDATE thoughts SET text = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(text, at, id, s.workspaceId, s.userId);
    return { thought: this.getThought(s, id)!, revisions: this.listThoughtRevisions(s, id) };
  }

  reclassifyThought(s: Scope, id: string, kind: ThoughtKind): Thought {
    const cur = this.getThought(s, id);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const at = now();
    this.db.prepare('UPDATE thoughts SET kind = ?, inferred = 0, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
      .run(kind, at, id, s.workspaceId, s.userId);
    this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(newId('th_ev'), id, s.userId, s.workspaceId, 'reclassified', cur.kind, kind, 'user', at);
    return this.getThought(s, id)!;
  }

  setThoughtAbout(s: Scope, thoughtId: string, targets: Array<{ kind: 'object' | 'node'; id: string }>): Thought {
    const cur = this.getThought(s, thoughtId);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const at = now();
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(thoughtId, s.workspaceId, s.userId);
      const ins = this.db.prepare('INSERT OR IGNORE INTO thought_about (thought_id, target_kind, target_id, user_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const t of targets) {
        ins.run(thoughtId, t.kind, t.id, s.userId, s.workspaceId, at);
      }
      this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(newId('th_ev'), thoughtId, s.userId, s.workspaceId, 'about_updated', null, JSON.stringify(targets), 'user', at);
    })();
    return this.getThought(s, thoughtId)!;
  }

  getThoughtAbout(s: Scope, thoughtId: string): { objectIds: string[]; nodeIds: string[] } {
    const rows = this.db.prepare('SELECT target_kind, target_id FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').all(thoughtId, s.workspaceId, s.userId) as Array<{ target_kind: string; target_id: string }>;
    return {
      objectIds: rows.filter((r) => r.target_kind === 'object').map((r) => r.target_id),
      nodeIds: rows.filter((r) => r.target_kind === 'node').map((r) => r.target_id),
    };
  }

  listThoughtsAbout(s: Scope, objectId: string): Thought[] {
    const targetThoughtIds = (this.db.prepare("SELECT thought_id FROM thought_about WHERE target_kind = 'object' AND target_id = ? AND workspace_id = ? AND user_id = ?").all(objectId, s.workspaceId, s.userId) as Array<{ thought_id: string }>).map((r) => r.thought_id);
    const seen = new Set(targetThoughtIds);
    const all = this.listThoughts(s, { includeResolved: true });
    const obj = this.getObject(s, objectId);
    if (obj) {
      const token = `@«${obj.title}»`;
      for (const t of all) {
        if (!seen.has(t.id) && t.text.includes(token)) {
          seen.add(t.id);
        }
      }
    }
    return [...seen].map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
  }

  listThoughtsInScope(s: Scope, nodeIds: string[]): Thought[] {
    const set = new Set(nodeIds);
    const all = this.listThoughts(s, { includeResolved: true });
    const objects = this.listObjects(s);
    const nodes = this.listNodes(s);
    return all.filter((t) => {
      if (set.has(t.nodeId)) return true;
      if (t.aboutNodeIds?.some((id) => set.has(id))) return true;
      const at = new Map(objects.map((o) => [o.id, o.nodeId]));
      if (t.aboutObjectIds?.some((id) => { const n = at.get(id); return !!n && set.has(n); })) return true;
      return false;
    });
  }

  deriveThought(s: Scope, input: { parentIds: string[]; nodeId: string; kind: ThoughtKind; text: string }): { thought: Thought; derivedFrom: string[] } {
    const parents = [...new Set(input.parentIds)];
    if (!parents.length) throw new RepoError('invalid', 'فکر تازه باید دست‌کم یک فکر مبدأ داشته باشد.');
    const parentThoughts = parents.map((id) => this.getThought(s, id));
    if (parentThoughts.some((t) => !t)) throw new RepoError('not_found', 'یکی از فکرهای مبدأ پیدا نشد.');
    this.requireNode(s, input.nodeId);
    return this.db.transaction(() => {
      const child = this.insertThought(s, { nodeId: input.nodeId, kind: input.kind, text: input.text });
      const at = now();
      const edge = this.db.prepare('INSERT INTO thought_derivations (parent_id,child_id,user_id,workspace_id,created_at) VALUES (?,?,?,?,?)');
      for (const parentId of parents) edge.run(parentId, child.id, s.userId, s.workspaceId, at);
      return { thought: child, derivedFrom: parents };
    })();
  }

  listThoughtRevisions(s: Scope, thoughtId: string): ThoughtRevision[] {
    return (this.db.prepare('SELECT thought_id,revision,before_text,after_text,at FROM thought_revisions WHERE thought_id = ? AND workspace_id = ? AND user_id = ? ORDER BY revision').all(thoughtId, s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ thoughtId: r.thought_id as string, revision: r.revision as number, beforeText: r.before_text as string, afterText: r.after_text as string, at: r.at as string }));
  }

  listThoughtParents(s: Scope, thoughtId: string): string[] {
    return (this.db.prepare('SELECT parent_id FROM thought_derivations WHERE child_id = ? AND workspace_id = ? AND user_id = ? ORDER BY created_at,parent_id').all(thoughtId, s.workspaceId, s.userId) as Array<{ parent_id: string }>).map((r) => r.parent_id);
  }

  listDerivedThoughts(s: Scope, thoughtId: string): Thought[] {
    const childIds = (this.db.prepare('SELECT child_id FROM thought_derivations WHERE parent_id = ? AND workspace_id = ? AND user_id = ? ORDER BY created_at').all(thoughtId, s.workspaceId, s.userId) as Array<{ child_id: string }>).map((r) => r.child_id);
    return childIds.map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
  }

  getThoughtSources(s: Scope, thoughtId: string): { note?: Note; parents: Thought[]; quote?: string; inferred?: boolean } {
    const thought = this.getThought(s, thoughtId);
    if (!thought) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const note = thought.sourceNoteId ? this.getNote(s, thought.sourceNoteId) : undefined;
    const parents = this.listThoughtParents(s, thoughtId).map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
    return {
      note,
      parents,
      quote: thought.sourceQuote,
      inferred: thought.inferred,
    };
  }

  getProposedKnowledgeFromThought(s: Scope, thoughtId: string): ContextObject | undefined {
    const thought = this.getThought(s, thoughtId);
    if (thought?.resolvedObjectId) {
      const obj = this.getObject(s, thought.resolvedObjectId);
      if (obj) return obj;
    }
    const objects = this.listObjects(s);
    return objects.find((o) => o.source?.thoughtId === thoughtId);
  }

  getSynthesisLineage(s: Scope, thoughtId: string): { thought: Thought; parentThoughts: Thought[] } {
    const thought = this.getThought(s, thoughtId);
    if (!thought) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const parentThoughts = this.listThoughtParents(s, thoughtId).map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
    return { thought, parentThoughts };
  }

  splitThought(s: Scope, parentId: string, children: Array<{ text: string; kind: ThoughtKind; nodeId?: string }>): { parent: Thought; children: Thought[] } {
    const parent = this.getThought(s, parentId);
    if (!parent) throw new RepoError('not_found', 'فکر مبدأ پیدا نشد.');
    if (!children.length) throw new RepoError('invalid', 'دست‌کم یک فکر تازه برای تفکیک لازم است.');
    const created: Thought[] = [];
    this.db.transaction(() => {
      for (const c of children) {
        const derived = this.deriveThought(s, {
          parentIds: [parentId],
          nodeId: c.nodeId ?? parent.nodeId,
          kind: c.kind,
          text: c.text,
        });
        created.push(derived.thought);
      }
    })();
    return { parent: this.getThought(s, parentId)!, children: created };
  }

  getThoughtHistory(s: Scope, thoughtId: string): import('../../src/types/index.ts').ThoughtHistoryReport {
    const thought = this.getThought(s, thoughtId);
    if (!thought) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const revisions = this.listThoughtRevisions(s, thoughtId);
    const events = (this.db.prepare('SELECT event_kind, before_value, after_value, actor, at FROM thought_events WHERE thought_id = ? AND workspace_id = ? AND user_id = ? ORDER BY at').all(thoughtId, s.workspaceId, s.userId) as Array<{ event_kind: string; before_value: string | null; after_value: string | null; actor: string; at: string }>);
    const parents = this.listThoughtParents(s, thoughtId).map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
    const derivedThoughts = this.listDerivedThoughts(s, thoughtId);
    const proposedObject = this.getProposedKnowledgeFromThought(s, thoughtId);

    const entries: import('../../src/types/index.ts').ThoughtHistoryEntry[] = [
      {
        kind: 'created',
        at: thought.createdAt,
        actor: 'user',
        details: {
          afterText: thought.text,
          afterKind: thought.kind,
          sourceNoteId: thought.sourceNoteId,
          sourceQuote: thought.sourceQuote,
          parentIds: parents.map((p) => p.id),
        },
      },
    ];

    for (const r of revisions) {
      entries.push({
        kind: 'revision',
        at: r.at,
        actor: 'user',
        details: { beforeText: r.beforeText, afterText: r.afterText },
      });
    }

    for (const ev of events) {
      if (ev.event_kind === 'reclassified') {
        entries.push({
          kind: 'reclassification',
          at: ev.at,
          actor: ev.actor,
          details: { beforeKind: ev.before_value as ThoughtKind, afterKind: ev.after_value as ThoughtKind },
        });
      } else if (ev.event_kind === 'source_line_deleted' || ev.event_kind === 'source_note_deleted') {
        entries.push({ kind: ev.event_kind, at: ev.at, actor: ev.actor, details: {} });
      } else if (ev.event_kind === 'resolved') {
        entries.push({
          kind: 'resolved',
          at: ev.at,
          actor: ev.actor,
          details: { objectId: ev.after_value ?? undefined },
        });
      }
    }

    entries.sort((a, b) => a.at.localeCompare(b.at));

    return {
      thought,
      entries,
      derivedThoughts,
      proposedObject,
    };
  }

  resolveThought(s: Scope, id: string, resolution: { objectId?: string; nodeId?: string }): Thought {
    const cur = this.getThought(s, id);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    if (resolution.objectId) {
      const object = this.getObject(s, resolution.objectId);
      if (!object || object.status !== 'Proposed') throw new RepoError('invalid', 'فکر فقط با دانش پیشنهادی می‌تواند تبدیل شود.');
    } else if (resolution.nodeId) this.requireNode(s, resolution.nodeId);
    else throw new RepoError('invalid', 'نتیجهٔ تبدیل فکر مشخص نیست.');
    const at = now();
    this.db.prepare("UPDATE thoughts SET status = 'resolved', resolved_object_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?")
      .run(resolution.objectId ?? null, at, id, s.workspaceId, s.userId);
    this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(newId('th_ev'), id, s.userId, s.workspaceId, 'resolved', 'open', resolution.objectId ?? resolution.nodeId, 'user', at);
    return this.getThought(s, id)!;
  }

  listNotes(s: Scope): Note[] {
    return (this.db.prepare('SELECT * FROM notes WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToNote);
  }

  getNote(s: Scope, id: string): Note | undefined {
    const r = this.db.prepare('SELECT * FROM notes WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToNote(r) : undefined;
  }

  createNote(s: Scope, nodeId: string, content: string): Note {
    this.assertWorkspace(s);
    nodeId = this.placeNode(s, nodeId);
    const t = now();
    const n: Note = { id: newId('note'), workspaceId: s.workspaceId, nodeId, content, createdAt: t, updatedAt: t };
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO notes (id, user_id, workspace_id, node_id, content, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(n.id, s.userId, s.workspaceId, nodeId, content, t, t);
      this.syncNoteThoughts(s, n);
    })();
    return n;
  }

  updateNote(s: Scope, id: string, content: string): Note {
    const cur = this.getNote(s, id);
    if (!cur) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const t = now();
    const updated = { ...cur, content, updatedAt: t };
    this.db.transaction(() => {
      this.db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ? AND workspace_id = ?').run(content, t, id, s.workspaceId);
      this.syncNoteThoughts(s, updated);
    })();
    return updated;
  }

  /** a thought changes its SECTION (dragged into another section's frame on the free canvas); the text and the place stay */
  moveNoteToNode(s: Scope, id: string, nodeId: string): Note {
    const cur = this.getNote(s, id);
    if (!cur) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    if (!this.listNodes(s).some((n) => n.id === nodeId)) throw new RepoError('not_found', 'بخش پیدا نشد.');
    this.db.transaction(() => {
      this.db.prepare('UPDATE notes SET node_id = ? WHERE id = ? AND workspace_id = ?').run(nodeId, id, s.workspaceId);
      this.db.prepare('UPDATE thoughts SET node_id = ? WHERE source_note_id = ? AND source_line IS NOT NULL AND workspace_id = ? AND user_id = ?').run(nodeId, id, s.workspaceId, s.userId);
    })();
    return { ...cur, nodeId };
  }

  /** «برگرداندن»: the note comes back with its own id, text, dates and (if it had one) its place on the free canvas */
  restoreNote(s: Scope, n: Note, pos?: { x?: number; y?: number }): Note {
    this.assertWorkspace(s);
    if (this.getNote(s, n.id)) return this.getNote(s, n.id)!;
    const nodeId = this.placeNode(s, n.nodeId);
    const restored = { ...n, content: String(n.content ?? ''), nodeId, workspaceId: s.workspaceId };
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO notes (id, user_id, workspace_id, node_id, content, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(n.id, s.userId, s.workspaceId, nodeId, restored.content, n.createdAt, n.updatedAt);
      this.syncNoteThoughts(s, restored);
    })();
    if (pos && (pos.x !== undefined || pos.y !== undefined)) this.saveCanvasItem(s, 'free', `note:${n.id}`, pos);
    return restored;
  }
  /** where a note sits on the free canvas (so a delete can be undone completely) */
  notePosition(s: Scope, id: string): { x?: number; y?: number } | undefined {
    const r = this.db.prepare("SELECT x, y FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = 'free' AND item_ref = ?").get(s.workspaceId, s.userId, `note:${id}`) as { x: number | null; y: number | null } | undefined;
    return r ? { ...(r.x !== null ? { x: r.x } : {}), ...(r.y !== null ? { y: r.y } : {}) } : undefined;
  }

  /** how many OPEN thoughts a note holds (what the delete dialog tells the user: «N فکر باز دارد؛ می‌مانند») */
  countOpenThoughtsOf(s: Scope, noteId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM thoughts WHERE workspace_id = ? AND user_id = ? AND source_note_id = ? AND status = 'open'").get(s.workspaceId, s.userId, noteId) as { n: number }).n;
  }

  /**
   * Deleting a note: its thoughts are the user's, so by default they STAY (open ones say «یادداشت حذف شد»). With `removeThoughts`
   * the OPEN ones go too (converted ones are knowledge now and always stay).
   */
  deleteNote(s: Scope, id: string, opts: { removeThoughts?: boolean } = {}): { keptThoughts: number; removedThoughts: number } {
    let removed = 0, kept = 0;
    this.db.transaction(() => {
      const mine = this.db.prepare('SELECT id, status FROM thoughts WHERE workspace_id = ? AND user_id = ? AND source_note_id = ?').all(s.workspaceId, s.userId, id) as Array<{ id: string; status: string }>;
      const open = mine.filter((t) => t.status === 'open').map((t) => t.id);
      if (opts.removeThoughts) removed = this.eraseThoughts(s, open);
      const at = now();
      for (const t of mine) {
        if (opts.removeThoughts && open.includes(t.id)) continue;
        this.db.prepare("UPDATE thoughts SET source_state = 'note_deleted', updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?").run(at, t.id, s.workspaceId, s.userId);
        if (t.status === 'open') {
          kept++;
          this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(newId('th_ev'), t.id, s.userId, s.workspaceId, 'source_note_deleted', null, null, 'user', at);
        }
      }
      this.db.prepare("DELETE FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = 'free' AND item_ref = ?").run(s.workspaceId, s.userId, `note:${id}`);
      this.db.prepare('DELETE FROM notes WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
    })();
    return { keptThoughts: kept, removedThoughts: removed };
  }

  // ── JSON collections (assets, ledger, chats, specs) ──────────────────────
  listDeliverables(s: Scope): GeneratedDeliverable[] {
    return (this.db.prepare('SELECT data FROM deliverables WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  }

  getDeliverable(s: Scope, id: string): GeneratedDeliverable | undefined {
    const r = this.db.prepare('SELECT data FROM deliverables WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as { data: string } | undefined;
    return r ? JSON.parse(r.data) : undefined;
  }

  saveDeliverable(s: Scope, d: GeneratedDeliverable): GeneratedDeliverable {
    this.assertWorkspace(s);
    const own = this.db.prepare('SELECT user_id, workspace_id FROM deliverables WHERE id = ?').get(d.id) as { user_id: string; workspace_id: string } | undefined;
    if (own && (own.user_id !== s.userId || own.workspace_id !== s.workspaceId)) throw new RepoError('forbidden', 'دسترسی ندارید.');
    const archivedAt = (this.getDeliverable(s, d.id) as GeneratedDeliverable | undefined)?.archivedAt;
    const keep = { ...d, workspaceId: s.workspaceId, ...(archivedAt ? { archivedAt } : {}) };
    if (!archivedAt) delete keep.archivedAt;
    this.db.prepare('INSERT INTO deliverables (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(d.id, s.userId, s.workspaceId, JSON.stringify(keep), d.createdAt);
    return d;
  }

  listLedger(s: Scope): LedgerEntry[] {
    return (this.db.prepare('SELECT data FROM ledger WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  }

  addLedger(s: Scope, e: LedgerEntry): LedgerEntry {
    this.assertWorkspace(s);
    this.db.prepare('INSERT OR REPLACE INTO ledger (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(e.id, s.userId, s.workspaceId, JSON.stringify({ ...e, workspaceId: s.workspaceId }), e.timestamp);
    return e;
  }

  listSessions(s: Scope): ChatSession[] {
    return (this.db.prepare('SELECT data FROM chat_sessions WHERE workspace_id = ? AND user_id = ? ORDER BY updated_at DESC').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  }

  saveSession(s: Scope, c: ChatSession): ChatSession {
    this.assertWorkspace(s);
    this.db.prepare('INSERT INTO chat_sessions (id, user_id, workspace_id, data, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE user_id = excluded.user_id')
      .run(c.id, s.userId, s.workspaceId, JSON.stringify({ ...c, workspaceId: s.workspaceId }), c.updatedAt);
    return c;
  }

  deleteSession(s: Scope, id: string) {
    this.db.prepare('DELETE FROM chat_sessions WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
  }

  listSpecs(s: Scope): WorkstreamSpec[] {
    return (this.db.prepare('SELECT data FROM specs WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  }

  saveSpec(s: Scope, spec: WorkstreamSpec): WorkstreamSpec {
    this.assertWorkspace(s);
    this.db.prepare('INSERT INTO specs (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(spec.id, s.userId, s.workspaceId, JSON.stringify(spec), now());
    return spec;
  }

  // ── files ───────────────────────────────────────────────────────────────
  private chunkCount(fileId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM file_chunks WHERE file_id = ?').get(fileId) as { n: number }).n;
  }

  createFile(s: Scope, f: { name: string; mime: string; sizeBytes: number; nodeId?: string; rawText: string; tokens: number }): StoredFile {
    this.assertWorkspace(s);
    if (f.nodeId) this.requireNode(s, f.nodeId);
    const id = newId('file');
    const t = now();
    this.db.prepare('INSERT INTO files (id, user_id, workspace_id, node_id, name, mime, size_bytes, status, tokens, raw_text, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, s.userId, s.workspaceId, f.nodeId ?? null, f.name, f.mime, f.sizeBytes, 'uploaded', f.tokens, f.rawText, t);
    return this.getFile(s, id)!;
  }

  getFile(s: Scope, id: string): StoredFile | undefined {
    const r = this.db.prepare('SELECT * FROM files WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToFile(r, this.chunkCount(id)) : undefined;
  }

  getFileText(s: Scope, id: string): string | undefined {
    const r = this.db.prepare('SELECT raw_text FROM files WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as { raw_text: string | null } | undefined;
    return r?.raw_text ?? undefined;
  }

  listFiles(s: Scope): StoredFile[] {
    return (this.db.prepare('SELECT * FROM files WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map((r) => rowToFile(r, this.chunkCount(r.id as string)));
  }

  setFileStatus(s: Scope, id: string, status: FileStatus, extra: { summary?: string; error?: string } = {}) {
    this.db.prepare('UPDATE files SET status = ?, summary = COALESCE(?, summary), error = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
      .run(status, extra.summary ?? null, extra.error ?? null, id, s.workspaceId, s.userId);
  }

  saveChunks(s: Scope, fileId: string, chunks: Array<{ index: number; text: string; tokens: number }>) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM file_chunks WHERE file_id = ? AND workspace_id = ?').run(fileId, s.workspaceId);
      const ins = this.db.prepare('INSERT INTO file_chunks (file_id, idx, user_id, workspace_id, text, tokens) VALUES (?,?,?,?,?,?)');
      for (const c of chunks) ins.run(fileId, c.index, s.userId, s.workspaceId, c.text, c.tokens);
    })();
  }

  /** chunks of READY files only (a file that failed or is still processing is never injected) */
  listReadyChunks(s: Scope): StoredChunk[] {
    return (this.db.prepare(`SELECT c.file_id, c.idx, c.text, c.tokens FROM file_chunks c JOIN files f ON f.id = c.file_id
      WHERE c.workspace_id = ? AND c.user_id = ? AND f.status = 'ready' ORDER BY c.file_id, c.idx`).all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ fileId: r.file_id as string, index: r.idx as number, text: r.text as string, tokens: r.tokens as number }));
  }

  deleteFile(s: Scope, id: string) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM file_chunks WHERE file_id = ? AND workspace_id = ?').run(id, s.workspaceId);
      this.db.prepare('DELETE FROM files WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
    })();
  }

  fileUsage(s: Scope, period: string): number {
    const r = this.db.prepare('SELECT tokens FROM file_usage WHERE workspace_id = ? AND period = ? AND user_id = ?').get(s.workspaceId, period, s.userId) as { tokens: number } | undefined;
    return r?.tokens ?? 0;
  }

  addFileUsage(s: Scope, period: string, tokens: number): number {
    this.db.prepare('INSERT INTO file_usage (user_id, workspace_id, period, tokens) VALUES (?,?,?,?) ON CONFLICT(workspace_id, period) DO UPDATE SET tokens = tokens + excluded.tokens').run(s.userId, s.workspaceId, period, tokens);
    return this.fileUsage(s, period);
  }

  // ── decision-layer judgments + daily counters ───────────────────────────
  /** latest judgment per object, valid only for the version it was made on */
  listJudgments(s: Scope): Record<string, { version: number; ambiguous: boolean; reason: string }> {
    const out: Record<string, { version: number; ambiguous: boolean; reason: string }> = {};
    const rows = this.db.prepare("SELECT object_id, version, ambiguous, reason FROM context_judgments WHERE workspace_id = ? AND user_id = ? AND kind = 'ambiguity' ORDER BY version").all(s.workspaceId, s.userId) as Array<Record<string, unknown>>;
    for (const r of rows) out[r.object_id as string] = { version: r.version as number, ambiguous: !!r.ambiguous, reason: r.reason as string };
    return out;
  }

  saveJudgment(s: Scope, objectId: string, version: number, j: { ambiguous: boolean; reason: string }) {
    this.db.prepare("INSERT OR REPLACE INTO context_judgments (object_id, version, kind, user_id, workspace_id, ambiguous, reason, created_at) VALUES (?,?,'ambiguity',?,?,?,?,?)")
      .run(objectId, version, s.userId, s.workspaceId, j.ambiguous ? 1 : 0, j.reason, now());
  }

  dailyUsage(s: Scope, day: string, kind: string): number {
    return (this.db.prepare('SELECT count FROM daily_usage WHERE workspace_id = ? AND day = ? AND kind = ? AND user_id = ?').get(s.workspaceId, day, kind, s.userId) as { count: number } | undefined)?.count ?? 0;
  }

  addDailyUsage(s: Scope, day: string, kind: string, n = 1): number {
    this.db.prepare('INSERT INTO daily_usage (user_id, workspace_id, day, kind, count) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id, day, kind) DO UPDATE SET count = count + excluded.count').run(s.userId, s.workspaceId, day, kind, n);
    return this.dailyUsage(s, day, kind);
  }

  /** manager ledger input: every workspace (any user) with the ledger rows of one month */
  ledgerByWorkspaceForMonth(month: string): Array<{ userId: string; workspaceId: string; name: string; planId: Workspace['planId']; entries: LedgerEntry[] }> {
    const rows = this.db.prepare('SELECT user_id, id, data FROM workspaces ORDER BY user_id, created_at').all() as Array<{ user_id: string; id: string; data: string }>;
    return rows.filter((r) => !(JSON.parse(r.data) as Workspace).isDemo).map((r) => {
      const ws = JSON.parse(r.data) as Workspace;
      const entries = (this.db.prepare('SELECT data FROM ledger WHERE workspace_id = ? AND user_id = ? AND created_at LIKE ?').all(r.id, r.user_id, `${month}%`) as Array<{ data: string }>).map((x) => JSON.parse(x.data) as LedgerEntry);
      return { userId: r.user_id, workspaceId: r.id, name: ws.name, planId: ws.planId, entries };
    });
  }

  // ── semantic contradictions: one judgement per exact (object, version) pair + the user's resolution ──
  listPairJudgments(s: Scope): PairJudgment[] {
    return (this.db.prepare('SELECT * FROM contradiction_judgments WHERE workspace_id = ? AND user_id = ?').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ key: r.pair_key as string, aVersion: r.a_version as number, bVersion: r.b_version as number, conflict: !!r.conflict, reason: r.reason as string, resolution: (r.resolution as string | null) ?? null }));
  }

  /** `a` and `b` are stored in key order (smaller id first) so versions line up with core's isFresh */
  savePairJudgment(s: Scope, a: ContextObject, b: ContextObject, j: { conflict: boolean; reason: string; resolution?: string }) {
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    this.db.prepare('INSERT OR REPLACE INTO contradiction_judgments (user_id, workspace_id, pair_key, a_id, a_version, b_id, b_version, conflict, reason, resolution, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(s.userId, s.workspaceId, pairKey(a.id, b.id), lo.id, lo.version, hi.id, hi.version, j.conflict ? 1 : 0, j.reason, j.resolution ?? null, now());
  }

  /** «keep» — the other object becomes Superseded by the kept one (never deleted); the history stays. */
  supersedeBy(s: Scope, loserId: string, winnerId: string, meta?: ChangeMeta): { loser: ContextObject; impact: ImpactResult } {
    const loser = this.getObject(s, loserId);
    const winner = this.getObject(s, winnerId);
    if (!loser || !winner) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (loserId === winnerId) throw new RepoError('invalid', 'دو مورد یکی نیستند.');
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const t = now();
      this.db.prepare("UPDATE context_objects SET status='Superseded', superseded_by_id=?, updated_at=? WHERE id=? AND workspace_id=?").run(winnerId, t, loserId, s.workspaceId);
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, winnerId, loserId, 'supersedes', t);
      this.carryDependencies(s, loserId, winnerId);
      this.recordChange(s, { objectId: loserId, fromVersion: loser.version, toVersion: loser.version, kind: meta?.kind ?? 'contradiction_resolved', meta, before: { status: loser.status }, after: { status: 'Superseded', supersededById: winnerId } });
      if (winner.status !== 'Confirmed') {
        this.db.prepare("UPDATE context_objects SET status='Confirmed', updated_at=? WHERE id=? AND workspace_id=?").run(t, winnerId, s.workspaceId);
        this.recordChange(s, { objectId: winnerId, fromVersion: winner.version, toVersion: winner.version, kind: statusChangeKind(winner.status, 'Confirmed'), meta, before: { status: winner.status }, after: { status: 'Confirmed' } });
      }
      return this.getObject(s, loserId)!;
    })());
    return { loser: value, impact };
  }

  // ── Context packs (what was copied for an outside AI — the lineage of its pasted answer) ──
  savePack(s: Scope, p: { title: string; specId?: string; deliverableId?: string; refs: Array<{ id: string; version: number }>; tokens: number }, id: string = newId('pack')): { id: string; createdAt: string } {
    const createdAt = now();
    this.db.prepare('INSERT INTO context_packs (id, user_id, workspace_id, title, spec_id, deliverable_id, refs, tokens, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, s.userId, s.workspaceId, p.title, p.specId ?? null, p.deliverableId ?? null, JSON.stringify(p.refs), p.tokens, createdAt);
    return { id, createdAt };
  }

  getPack(s: Scope, id: string): { id: string; title: string; specId?: string; deliverableId?: string; refs: Array<{ id: string; version: number }>; tokens: number; createdAt: string } | undefined {
    const r = this.db.prepare('SELECT * FROM context_packs WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? { id: r.id as string, title: r.title as string, ...(r.spec_id ? { specId: r.spec_id as string } : {}), ...(r.deliverable_id ? { deliverableId: r.deliverable_id as string } : {}), refs: JSON.parse(r.refs as string), tokens: r.tokens as number, createdAt: r.created_at as string } : undefined;
  }

  listPacks(s: Scope, limit = 10) {
    return (this.db.prepare('SELECT id, title, tokens, created_at FROM context_packs WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?').all(s.workspaceId, s.userId, limit) as Array<Record<string, unknown>>)
      .map((r) => ({ id: r.id as string, title: r.title as string, tokens: r.tokens as number, createdAt: r.created_at as string }));
  }

  // ── templates: the user's own node / workstream, reusable in any of her workspaces (examples, never knowledge) ──
  listTemplates(userId: string): Array<{ id: string; kind: 'node' | 'workstream'; name: string; payload: unknown; createdAt: string }> {
    return (this.db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC, id').all(userId) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, kind: r.kind as 'node' | 'workstream', name: r.name as string, payload: JSON.parse(r.payload as string), createdAt: r.created_at as string }));
  }
  saveTemplate(s: Scope, kind: 'node' | 'workstream', name: string, payload: unknown, at?: string, id?: string) {
    const n = name.trim().slice(0, 80);
    if (!n) throw new RepoError('invalid', 'نام قالب لازم است.');
    const tid = id ?? newId('tpl');
    this.db.prepare('INSERT OR REPLACE INTO templates (id, user_id, workspace_id, kind, name, payload, created_at) VALUES (?,?,?,?,?,?,?)').run(tid, s.userId, s.workspaceId, kind, n, JSON.stringify(payload), at ?? now());
    return tid;
  }
  deleteTemplate(userId: string, id: string) { this.db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId); }

  // ── metrics («شاخص‌ها»): recorded results. NOT Context objects, never facts. Every write leaves a Change (object_id `metric:<id>`);
  //    a legacy externally-suggested number is `Proposed` and invisible to charts, counts and packs until the user confirms it ──
  private rowToMetric(r: Record<string, unknown>): Metric {
    return { id: r.id as string, workspaceId: r.workspace_id as string, name: r.name as string, unit: (r.unit as string) ?? '', direction: r.direction as MetricDirection, ...(r.target !== null && r.target !== undefined ? { target: r.target as number } : {}), ...(r.archived ? { archived: true } : {}), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
  }
  private rowToMeasurement(r: Record<string, unknown>): Measurement {
    return { id: r.id as string, workspaceId: r.workspace_id as string, metricId: r.metric_id as string, value: r.value as number, at: r.at as string, ...(r.note ? { note: r.note as string } : {}), source: r.source as MeasurementSource, status: r.status as Measurement['status'], ...(r.decision_id ? { decisionId: r.decision_id as string } : {}), createdAt: r.created_at as string };
  }
  listMetrics(s: Scope): Metric[] {
    return (this.db.prepare('SELECT * FROM metrics WHERE workspace_id = ? AND user_id = ? ORDER BY created_at, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map((r) => this.rowToMetric(r));
  }
  getMetric(s: Scope, id: string): Metric | undefined {
    const r = this.db.prepare('SELECT * FROM metrics WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? this.rowToMetric(r) : undefined;
  }
  private cleanMetricFields(i: { name?: unknown; unit?: unknown; direction?: unknown; target?: unknown }, cur?: Metric) {
    const name = i.name === undefined ? cur?.name : typeof i.name === 'string' ? i.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (!name) throw new RepoError('invalid', 'نام شاخص لازم است.');
    const direction = i.direction === undefined ? cur?.direction : i.direction;
    if (direction !== 'up' && direction !== 'down') throw new RepoError('invalid', 'مشخص کن بالاتر بهتر است یا پایین‌تر.');
    const unit = i.unit === undefined ? cur?.unit ?? '' : typeof i.unit === 'string' ? i.unit.trim().slice(0, 20) : '';
    const target = i.target === undefined ? cur?.target : i.target === null || i.target === '' ? undefined : typeof i.target === 'number' && Number.isFinite(i.target) ? i.target : (() => { throw new RepoError('invalid', 'هدف باید عدد باشد.'); })();
    return { name, unit, direction: direction as MetricDirection, target };
  }
  createMetric(s: Scope, i: { id?: string; name?: unknown; unit?: unknown; direction?: unknown; target?: unknown; at?: string }, meta?: ChangeMeta): Metric {
    this.assertWorkspace(s);
    const f = this.cleanMetricFields(i);
    if (this.listMetrics(s).some((m) => !m.archived && m.name.toLowerCase() === f.name.toLowerCase())) throw new RepoError('invalid', 'شاخصی با این نام هست.');
    const id = i.id ?? newId('met'); const t = i.at ?? now();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO metrics (id, user_id, workspace_id, name, unit, direction, target, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, s.userId, s.workspaceId, f.name, f.unit, f.direction, f.target ?? null, null, t, t);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 0, toVersion: 1, kind: 'metric_created', meta: { actor: 'user', ...meta }, after: { name: f.name, unit: f.unit, direction: f.direction, ...(f.target !== undefined ? { target: f.target } : {}) }, at: t });
    })();
    return this.getMetric(s, id)!;
  }
  updateMetric(s: Scope, id: string, patch: { name?: unknown; unit?: unknown; direction?: unknown; target?: unknown }, meta?: ChangeMeta): Metric {
    const cur = this.getMetric(s, id);
    if (!cur) throw new RepoError('not_found', 'شاخص پیدا نشد.');
    const f = this.cleanMetricFields(patch, cur);
    const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
    for (const k of ['name', 'unit', 'direction', 'target'] as const) if ((cur[k] ?? null) !== (f[k] ?? null)) { before[k] = cur[k] ?? null; after[k] = f[k] ?? null; }
    if (!Object.keys(after).length) return cur;
    const diff = { before, after };
    this.db.transaction(() => {
      this.db.prepare('UPDATE metrics SET name=?, unit=?, direction=?, target=?, updated_at=? WHERE id=? AND workspace_id=? AND user_id=?').run(f.name, f.unit, f.direction, f.target ?? null, now(), id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 1, toVersion: 1, kind: 'metric_edited', meta: { actor: 'user', ...meta }, before: diff.before, after: diff.after });
    })();
    return this.getMetric(s, id)!;
  }
  /** archived, never deleted: its numbers and the decisions that pointed at it stay readable */
  archiveMetric(s: Scope, id: string, meta?: ChangeMeta): Metric {
    const cur = this.getMetric(s, id);
    if (!cur) throw new RepoError('not_found', 'شاخص پیدا نشد.');
    if (cur.archived) return cur;
    this.db.transaction(() => {
      this.db.prepare('UPDATE metrics SET archived = 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(now(), id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 1, toVersion: 1, kind: 'metric_archived', meta: { actor: 'user', ...meta } });
    })();
    return this.getMetric(s, id)!;
  }

  listMeasurements(s: Scope, f: { metricId?: string; status?: Measurement['status'] } = {}): Measurement[] {
    const where = ['workspace_id = ?', 'user_id = ?']; const args: unknown[] = [s.workspaceId, s.userId];
    if (f.metricId) { where.push('metric_id = ?'); args.push(f.metricId); }
    if (f.status) { where.push('status = ?'); args.push(f.status); }
    return (this.db.prepare(`SELECT * FROM measurements WHERE ${where.join(' AND ')} ORDER BY at, created_at, id`).all(...args) as Array<Record<string, unknown>>).map((r) => this.rowToMeasurement(r));
  }
  getMeasurement(s: Scope, id: string): Measurement | undefined {
    const r = this.db.prepare('SELECT * FROM measurements WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? this.rowToMeasurement(r) : undefined;
  }
  /** One number; historical MCP measurements are read-only and can only enter through legacy data import. */
  addMeasurement(s: Scope, i: { id?: string; metricId: string; value: unknown; at?: string; note?: unknown; source?: Exclude<MeasurementSource, 'mcp'>; decisionId?: string; createdAt?: string }, meta?: ChangeMeta): Measurement {
    const metric = this.getMetric(s, i.metricId);
    if (!metric) throw new RepoError('not_found', 'شاخص پیدا نشد.');
    if (metric.archived) throw new RepoError('invalid', 'این شاخص بایگانی شده است.');
    if (typeof i.value !== 'number' || !Number.isFinite(i.value)) throw new RepoError('invalid', 'مقدار باید عدد باشد.');
    const source: MeasurementSource = i.source ?? 'manual';
    if ((source as string) === 'mcp') throw new RepoError('invalid', 'این نوع منشأ فقط برای خواندن داده‌های تاریخی پشتیبانی می‌شود.');
    const at = i.at ?? now().slice(0, 10);
    if (!isIsoDate(at)) throw new RepoError('invalid', 'تاریخ معتبر نیست.');
    const status: Measurement['status'] = 'Confirmed';
    const note = typeof i.note === 'string' && i.note.trim() ? i.note.trim().slice(0, 300) : undefined;
    const id = i.id ?? newId('msr'); const created = i.createdAt ?? now();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO measurements (id, user_id, workspace_id, metric_id, value, at, note, source, status, decision_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, s.userId, s.workspaceId, i.metricId, i.value, at, note ?? null, source, status, i.decisionId ?? null, created);
      this.recordChange(s, { objectId: `metric:${i.metricId}`, fromVersion: 1, toVersion: 1, kind: 'measurement_added', meta: { actor: 'user', ...meta }, after: { measurementId: id, value: i.value, at, source, ...(i.decisionId ? { decisionId: i.decisionId } : {}) }, at: created });
    })();
    return this.getMeasurement(s, id)!;
  }
  /** pasted CSV → numbers in one transaction; lines that cannot be read are returned, never guessed */
  addMeasurementsCsv(s: Scope, text: string, meta?: ChangeMeta): { added: Measurement[]; errors: ReturnType<typeof parseMeasurementCsv>['errors'] } {
    const parsed = parseMeasurementCsv(text, this.listMetrics(s), now().slice(0, 10));
    const added = this.db.transaction(() => parsed.rows.map((r) => this.addMeasurement(s, { metricId: r.metricId, value: r.value, at: r.at, note: r.note, source: 'csv' }, meta)))();
    return { added, errors: parsed.errors };
  }
  /** «تأیید عدد»: a Proposed number becomes the user's own */
  confirmMeasurement(s: Scope, id: string, meta?: ChangeMeta): Measurement {
    const m = this.getMeasurement(s, id);
    if (!m) throw new RepoError('not_found', 'عدد پیدا نشد.');
    if (m.status === 'Confirmed') return m;
    this.db.transaction(() => {
      this.db.prepare("UPDATE measurements SET status = 'Confirmed' WHERE id = ? AND workspace_id = ? AND user_id = ?").run(id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${m.metricId}`, fromVersion: 1, toVersion: 1, kind: 'measurement_added', meta: { actor: 'user', ...meta }, after: { measurementId: id, value: m.value, at: m.at, source: m.source, confirmed: true } });
    })();
    return this.getMeasurement(s, id)!;
  }
  removeMeasurement(s: Scope, id: string, meta?: ChangeMeta) {
    const m = this.getMeasurement(s, id);
    if (!m) throw new RepoError('not_found', 'عدد پیدا نشد.');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM measurements WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${m.metricId}`, fromVersion: 1, toVersion: 1, kind: 'measurement_removed', meta: { actor: 'user', ...meta }, before: { measurementId: id, value: m.value, at: m.at, status: m.status } });
    })();
  }

  // ── saved packs: a named selection (docs/spine.md → «بستهٔ ذخیره‌شده»); resolved by server/db/packs.ts ──
  private cleanSelection(s: Scope, sel: Partial<PackSelection> | undefined): PackSelection {
    const nodes = new Set(this.listNodes(s).map((n) => n.id));
    return {
      nodeIds: [...new Set((Array.isArray(sel?.nodeIds) ? sel!.nodeIds : []).filter((n): n is string => typeof n === 'string' && nodes.has(n)))].slice(0, 40),
      facets: cleanFacets(sel?.facets) ?? [],
      statuses: (['Proposed', 'Needs Review'] as const).filter((st) => Array.isArray(sel?.statuses) && (sel!.statuses as string[]).includes(st)),
      includeAssumptions: sel?.includeAssumptions !== false,
      withChildren: sel?.withChildren === true,
    };
  }
  private rowToPack(r: Record<string, unknown>): SavedPack {
    return { id: r.id as string, workspaceId: r.workspace_id as string, name: r.name as string, selection: JSON.parse(r.selection as string) as PackSelection, instruction: (r.instruction as string) ?? '', createdAt: r.created_at as string, updatedAt: r.updated_at as string, ...(isRequestKind(r.kind) ? { kind: r.kind, template: (r.template as string) ?? '' } : {}) };
  }
  listSavedPacks(s: Scope): SavedPack[] {
    return (this.db.prepare('SELECT * FROM saved_packs WHERE workspace_id = ? AND user_id = ? ORDER BY updated_at DESC, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map((r) => this.rowToPack(r));
  }
  getSavedPack(s: Scope, id: string): SavedPack | undefined {
    const r = this.db.prepare('SELECT * FROM saved_packs WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? this.rowToPack(r) : undefined;
  }
  saveSavedPack(s: Scope, input: { id?: string; name: string; selection?: Partial<PackSelection>; instruction?: string; kind?: unknown; template?: unknown }): SavedPack {
    this.assertWorkspace(s);
    const name = input.name?.trim().slice(0, 80);
    if (!name) throw new RepoError('invalid', 'نام بسته لازم است.');
    const selection = JSON.stringify(this.cleanSelection(s, input.selection));
    const instruction = (input.instruction ?? '').trim().slice(0, 1000);
    const kind = isRequestKind(input.kind) ? input.kind : null;
    const template = kind ? String(input.template ?? '').trim().slice(0, REQUEST_MAX_CHARS) : null;
    const t = now();
    if (input.id) {
      const r = this.db.prepare('UPDATE saved_packs SET name = ?, selection = ?, instruction = ?, kind = ?, template = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(name, selection, instruction, kind, template, t, input.id, s.workspaceId, s.userId);
      if (!r.changes) throw new RepoError('not_found', 'بسته پیدا نشد.');
      return this.getSavedPack(s, input.id)!;
    }
    const id = newId('pk');
    this.db.prepare('INSERT INTO saved_packs (id, user_id, workspace_id, name, selection, instruction, kind, template, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, s.userId, s.workspaceId, name, selection, instruction, kind, template, t, t);
    return this.getSavedPack(s, id)!;
  }
  /** a pack that is still being built: cleaned the way a saved one is, never stored (the live preview) */
  draftSavedPack(s: Scope, input: { selection?: Partial<PackSelection>; instruction?: string; kind?: unknown; template?: unknown }): Pick<SavedPack, 'selection' | 'instruction' | 'kind' | 'template'> {
    const kind = isRequestKind(input.kind) ? input.kind : undefined;
    return { selection: this.cleanSelection(s, input.selection), instruction: (input.instruction ?? '').trim().slice(0, 1000), ...(kind ? { kind, template: String(input.template ?? '').trim().slice(0, REQUEST_MAX_CHARS) } : {}) };
  }
  /** the demo builder: raw insert with explicit timestamps */
  importSavedPack(s: Scope, p: SavedPack) {
    this.db.prepare('INSERT OR REPLACE INTO saved_packs (id, user_id, workspace_id, name, selection, instruction, kind, template, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(p.id, s.userId, s.workspaceId, p.name, JSON.stringify(this.cleanSelection(s, p.selection)), p.instruction, p.kind ?? null, p.kind ? (p.template ?? '') : null, p.createdAt, p.updatedAt);
  }
  deleteSavedPack(s: Scope, id: string) {
    this.db.prepare('DELETE FROM saved_packs WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
  }

  // ── usage counters: a KEY from the catalog, a number and a time — never any user data ──
  bumpUsage(userId: string, feature: unknown): void {
    if (!isFeatureKey(feature)) throw new RepoError('invalid', 'امکان ناشناخته.');
    const t = now();
    this.db.prepare('INSERT INTO usage_events (user_id, feature, count, last_at) VALUES (?,?,1,?) ON CONFLICT(user_id, feature) DO UPDATE SET count = count + 1, last_at = excluded.last_at').run(userId, feature, t);
  }
  listUsage(userId: string): Array<{ feature: string; count: number; lastAt: string }> {
    return (this.db.prepare('SELECT feature, count, last_at FROM usage_events WHERE user_id = ? ORDER BY count DESC, feature').all(userId) as Array<Record<string, unknown>>).map((r) => ({ feature: r.feature as string, count: r.count as number, lastAt: r.last_at as string }));
  }

  // ── whole-workspace state + one-time legacy import ───────────────────────
  state(s: Scope) {
    this.assertWorkspace(s);
    const objects = this.listObjects(s);
    const deliverables = this.listDeliverables(s);
    return {
      workspace: this.getWorkspace(s.userId, s.workspaceId)!,
      nodes: this.listNodes(s), objects, samples: this.listSampleObjects(s), relationships: this.listRelationships(s), notes: this.listNotes(s), thoughts: this.listThoughts(s, { includeResolved: true }),
      deliverables, ledger: this.listLedger(s), sessions: this.listSessions(s), specs: this.listSpecs(s), files: this.listFiles(s),
      stale: this.impactEnabled(s) ? this.computeStale(s, deliverables.filter((d) => !d.archivedAt)) : [],
      judgments: this.listJudgments(s),
      pairJudgments: this.listPairJudgments(s),
      changes: this.listChanges(s),
      metrics: this.listMetrics(s), measurements: this.listMeasurements(s),
      canvas: { decisions: this.listCanvasItems(s, 'decisions'), free: this.listCanvasItems(s, 'free') },
      weeklyReviewAt: this.weeklyReviewAt(s),
    };
  }

  /** when the weekly review («این هفته») was last finished (null = never) */
  weeklyReviewAt(s: Scope): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE user_id = ? AND key = ?').get(s.userId, `weekly_review:${s.workspaceId}`) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as { at: string }).at : null;
  }

  markWeeklyReview(s: Scope): string {
    const at = now();
    this.db.prepare('INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, ?, ?)').run(s.userId, `weekly_review:${s.workspaceId}`, JSON.stringify({ at }));
    return at;
  }

  isImported(userId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM kv WHERE user_id = ? AND key = 'legacy_import'").get(userId);
  }

  markImported(userId: string, source: string) {
    this.db.prepare("INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, 'legacy_import', ?)").run(userId, JSON.stringify({ source, at: now() }));
  }
}
