import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ObjectSource, ContextObject, ContextRelationship, ContextStatus, ContextType, GeneratedDeliverable, LedgerEntry, Note, StoredFile, TreeNode,
  Workspace, WorkstreamSpec, ChatSession, FileStatus, ContextProvenance,
} from '../../src/types/index.ts';
import { canCreateUnder, canDelete, canMove, canRename, nextOrder, reorderSiblings } from '../../src/core/nodeTree.ts';
import { computeStaleAssets, newlyStale } from '../../src/core/impactEngine.ts';
import type { StaleAsset } from '../../src/core/impactEngine.ts';
import { DEFAULT_TREE_NODES } from '../../src/core/specs.ts';
import { can, entitlementsOf, objectLimitMessage, objectsRemaining, workspaceLimitMessage } from '../../src/core/entitlements.ts';

/** Every query is scoped by these two ids. One local user for now; real accounts later only change how `userId` is found. */
export interface Scope { userId: string; workspaceId: string }

export type RepoErrorCode = 'not_found' | 'invalid' | 'forbidden';
export class RepoError extends Error {
  constructor(public code: RepoErrorCode, message: string) { super(message); }
}

export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
const now = () => new Date().toISOString();

export interface ImpactResult { count: number; assets: Array<{ id: string; title: string; reasons: string[] }> }

export interface ObjectInput {
  type: ContextType; status?: ContextStatus; provenance: ContextProvenance; title: string; content: string; nodeId: string; source?: ObjectSource; slotKey?: string;
}

const rowToObject = (r: Record<string, unknown>): ContextObject => ({
  id: r.id as string, workspaceId: r.workspace_id as string, type: r.type as ContextType, status: r.status as ContextStatus,
  provenance: r.provenance as ContextProvenance, title: r.title as string, content: r.content as string, nodeId: r.node_id as string,
  version: r.version as number, ...(r.source ? { source: JSON.parse(r.source as string) as ObjectSource } : {}), ...(r.slot_key ? { slotKey: r.slot_key as string } : {}), ...(r.superseded_by_id ? { supersededById: r.superseded_by_id as string } : {}),
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});
const rowToNode = (r: Record<string, unknown>): TreeNode => ({
  id: r.id as string, label: r.label as string, description: r.description as string,
  ...(r.parent_id ? { parentId: r.parent_id as string } : {}), isSystem: !!r.is_system, order: r.ord as number,
});
const rowToNote = (r: Record<string, unknown>): Note => ({
  id: r.id as string, workspaceId: r.workspace_id as string, nodeId: r.node_id as string, content: r.content as string,
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
  saveWorkspace(userId: string, ws: Workspace, opts: { skipLimit?: boolean } = {}): Workspace {
    return this.db.transaction(() => {
      const exists = this.db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(ws.id);
      if (!exists) {
        if (!opts.skipLimit && this.listWorkspaces(userId).length >= entitlementsOf(ws.planId).workspaces) throw new RepoError('forbidden', workspaceLimitMessage(ws.planId));
        this.db.prepare('INSERT INTO workspaces (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(ws.id, userId, ws.id, JSON.stringify(ws), ws.createdAt);
        this.seedSystemNodes({ userId, workspaceId: ws.id });
      } else {
        const r = this.db.prepare('UPDATE workspaces SET data = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(ws), ws.id, userId);
        if (!r.changes) throw new RepoError('forbidden', 'این فضای کاری مال شما نیست.');
      }
      return ws;
    })();
  }

  private seedSystemNodes(s: Scope) {
    const ins = this.db.prepare('INSERT OR IGNORE INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,1,?)');
    DEFAULT_TREE_NODES.forEach((n, i) => ins.run(n.id, s.userId, s.workspaceId, n.parentId ?? null, n.label, n.description, n.order ?? i));
  }

  assertWorkspace(s: Scope) {
    if (!this.getWorkspace(s.userId, s.workspaceId)) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
  }

  private planOf(s: Scope) { return this.getWorkspace(s.userId, s.workspaceId)?.planId ?? 'starter'; }

  /** active Context objects (Archived and Superseded do not count against the plan) */
  countActiveObjects(s: Scope): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM context_objects WHERE workspace_id = ? AND user_id = ? AND status NOT IN ('Archived','Superseded')").get(s.workspaceId, s.userId) as { n: number }).n;
  }

  /** how many more objects the plan allows right now (bulk creators — files, notes — stop here instead of failing) */
  objectSlots(s: Scope): number { return objectsRemaining(this.planOf(s), this.countActiveObjects(s)); }

  /** the change-impact engine is a plan entitlement */
  impactEnabled(s: Scope): boolean { return can(this.planOf(s), 'changeImpact'); }

  // ── tree nodes ───────────────────────────────────────────────────────────
  listNodes(s: Scope): TreeNode[] {
    return (this.db.prepare('SELECT * FROM tree_nodes WHERE workspace_id = ? AND user_id = ? ORDER BY ord, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToNode);
  }

  createNode(s: Scope, input: { parentId: string; label: string; description?: string }): TreeNode {
    const nodes = this.listNodes(s);
    const ok = canCreateUnder(nodes, input.parentId, input.label);
    if (!ok.ok) throw new RepoError('invalid', ok.reason);
    const node: TreeNode = { id: newId('nd'), label: input.label.trim(), description: input.description?.trim() ?? '', parentId: input.parentId, isSystem: false, order: nextOrder(nodes, input.parentId) };
    this.db.prepare('INSERT INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)')
      .run(node.id, s.userId, s.workspaceId, node.parentId, node.label, node.description, node.order);
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

  moveNode(s: Scope, id: string, parentId: string, index?: number): TreeNode[] {
    return this.db.transaction(() => {
      const nodes = this.listNodes(s);
      const ok = canMove(nodes, id, parentId);
      if (!ok.ok) throw new RepoError(ok.reason.includes('سیستمی') ? 'forbidden' : 'invalid', ok.reason);
      const upd = this.db.prepare('UPDATE tree_nodes SET parent_id = ?, ord = ? WHERE workspace_id = ? AND id = ?');
      const moved = nodes.map((n) => (n.id === id ? { ...n, parentId } : n));
      for (const o of reorderSiblings(moved, parentId, id, index ?? nextOrder(nodes, parentId))) {
        upd.run(parentId, o.order, s.workspaceId, o.id);
      }
      return this.listNodes(s);
    })();
  }

  /** Delete a user node: only if empty, or after moving objects, notes, files and child nodes to `transferTo`. */
  deleteNode(s: Scope, id: string, transferTo?: string): TreeNode[] {
    return this.db.transaction(() => {
      const nodes = this.listNodes(s);
      const objects = this.listObjects(s);
      const notes = this.listNotes(s);
      const ok = canDelete(nodes, id, objects, notes, transferTo);
      if (!ok.ok) throw new RepoError(ok.reason.includes('سیستمی') ? 'forbidden' : 'invalid', ok.reason);
      if (transferTo) {
        this.db.prepare('UPDATE context_objects SET node_id = ? WHERE workspace_id = ? AND node_id = ?').run(transferTo, s.workspaceId, id);
        this.db.prepare('UPDATE notes SET node_id = ? WHERE workspace_id = ? AND node_id = ?').run(transferTo, s.workspaceId, id);
        this.db.prepare('UPDATE files SET node_id = ? WHERE workspace_id = ? AND node_id = ?').run(transferTo, s.workspaceId, id);
        const kids = nodes.filter((n) => n.parentId === id);
        const base = nextOrder(nodes, transferTo);
        kids.forEach((k, i) => this.db.prepare('UPDATE tree_nodes SET parent_id = ?, ord = ? WHERE workspace_id = ? AND id = ?').run(transferTo, base + i, s.workspaceId, k.id));
      }
      this.db.prepare('DELETE FROM tree_nodes WHERE workspace_id = ? AND id = ?').run(s.workspaceId, id);
      return this.listNodes(s);
    })();
  }

  // ── context objects ─────────────────────────────────────────────────────
  listObjects(s: Scope): ContextObject[] {
    return (this.db.prepare('SELECT * FROM context_objects WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToObject);
  }

  getObject(s: Scope, id: string): ContextObject | undefined {
    const r = this.db.prepare('SELECT * FROM context_objects WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToObject(r) : undefined;
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
    this.db.prepare(`INSERT INTO context_objects (id, user_id, workspace_id, type, status, provenance, title, content, node_id, superseded_by_id, created_at, updated_at, version, source, slot_key)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.id, s.userId, s.workspaceId, o.type, o.status, o.provenance, o.title, o.content, o.nodeId, o.supersededById ?? null, o.createdAt, o.updatedAt, o.version, o.source ? JSON.stringify(o.source) : null, o.slotKey ?? null);
    this.snapshot(s, o, o.createdAt);
  }

  /** impact of a mutation = assets that are stale after it but were not before */
  private withImpact<T>(s: Scope, run: () => T): { value: T; impact: ImpactResult } {
    if (!this.impactEnabled(s)) return { value: run(), impact: { count: 0, assets: [] } };
    const dels = this.listDeliverables(s);
    const before = computeStaleAssets(dels, this.listObjects(s));
    const value = run();
    const after = computeStaleAssets(dels, this.listObjects(s));
    return { value, impact: this.describeImpact(newlyStale(before, after), dels) };
  }

  private describeImpact(list: StaleAsset[], dels: GeneratedDeliverable[]): ImpactResult {
    return { count: list.length, assets: list.map((a) => ({ id: a.deliverableId, title: dels.find((d) => d.id === a.deliverableId)?.title ?? a.deliverableId, reasons: a.reasons.map((r) => r.message) })) };
  }

  createObject(s: Scope, input: ObjectInput & { id?: string }): ContextObject {
    this.assertWorkspace(s);
    this.requireNode(s, input.nodeId);
    if (!input.title.trim()) throw new RepoError('invalid', 'عنوان لازم است.');
    if (!input.provenance) throw new RepoError('invalid', 'هیچ Objectی بدون منبع (provenance) ذخیره نمی‌شود.');
    if (this.objectSlots(s) <= 0) throw new RepoError('forbidden', objectLimitMessage(this.planOf(s)));
    const t = now();
    const o: ContextObject = { id: input.id ?? newId('ctx'), workspaceId: s.workspaceId, type: input.type, status: input.status ?? 'Confirmed', provenance: input.provenance, title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: 1, ...(input.source ? { source: input.source } : {}), ...(input.slotKey?.trim() ? { slotKey: input.slotKey.trim() } : {}), createdAt: t, updatedAt: t };
    this.db.transaction(() => this.insertObject(s, o))();
    return o;
  }

  /** Raw insert for the one-time localStorage import: keeps id, status, timestamps and version as they were. */
  importObject(s: Scope, o: ContextObject) {
    const node = this.listNodes(s).some((n) => n.id === o.nodeId) ? o.nodeId : 'business';
    this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM context_objects WHERE id = ?').get(o.id)) return;
      this.insertObject(s, { ...o, nodeId: node, version: o.version ?? 1 });
    })();
  }

  importRelationship(s: Scope, r: ContextRelationship) {
    this.db.prepare('INSERT OR IGNORE INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(r.id, s.userId, s.workspaceId, r.sourceId, r.targetId, r.type, r.createdAt);
  }

  /** Edit in place. title / content / type changes bump `version`; status or node moves do not. */
  updateObject(s: Scope, id: string, patch: Partial<Pick<ContextObject, 'type' | 'title' | 'content' | 'nodeId' | 'status' | 'provenance' | 'slotKey'>>): { object: ContextObject; impact: ImpactResult } {
    const cur = this.getObject(s, id);
    if (!cur) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (patch.nodeId) this.requireNode(s, patch.nodeId);
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const next: ContextObject = { ...cur, ...patch, title: (patch.title ?? cur.title).trim() || cur.title, updatedAt: now() };
      if (!next.slotKey?.trim()) delete next.slotKey; else next.slotKey = next.slotKey.trim();
      const contentChanged = next.title !== cur.title || next.content !== cur.content || next.type !== cur.type;
      if (contentChanged) next.version = cur.version + 1;
      this.db.prepare('UPDATE context_objects SET type=?, status=?, provenance=?, title=?, content=?, node_id=?, version=?, updated_at=?, slot_key=? WHERE id=? AND workspace_id=?')
        .run(next.type, next.status, next.provenance, next.title, next.content, next.nodeId, next.version, next.updatedAt, next.slotKey ?? null, id, s.workspaceId);
      if (contentChanged) this.snapshot(s, next, next.updatedAt);
      return next;
    })());
    return { object: value, impact };
  }

  /** A new object that replaces `oldId`: version = old + 1, relationship `supersedes`, old becomes Superseded (never deleted). */
  supersedeObject(s: Scope, oldId: string, input: ObjectInput): { object: ContextObject; previous: ContextObject; impact: ImpactResult } {
    const old = this.getObject(s, oldId);
    if (!old) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (old.status === 'Superseded') throw new RepoError('invalid', 'این مورد قبلاً جایگزین شده است.');
    this.requireNode(s, input.nodeId);
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const t = now();
      const created: ContextObject = { id: newId('ctx'), workspaceId: s.workspaceId, type: input.type, status: input.status ?? 'Confirmed', provenance: input.provenance, title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: old.version + 1, ...((input.slotKey ?? old.slotKey) ? { slotKey: (input.slotKey ?? old.slotKey)! } : {}), createdAt: t, updatedAt: t };
      this.insertObject(s, created);
      this.db.prepare("UPDATE context_objects SET status='Superseded', superseded_by_id=?, updated_at=? WHERE id=? AND workspace_id=?").run(created.id, t, oldId, s.workspaceId);
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(newId('rel'), s.userId, s.workspaceId, created.id, oldId, 'supersedes', t);
      return created;
    })());
    return { object: value, previous: this.getObject(s, oldId)!, impact };
  }

  listRelationships(s: Scope): ContextRelationship[] {
    return (this.db.prepare('SELECT * FROM context_relationships WHERE workspace_id = ? AND user_id = ? ORDER BY created_at').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ id: r.id as string, sourceId: r.source_id as string, targetId: r.target_id as string, type: r.type as ContextRelationship['type'], createdAt: r.created_at as string }));
  }

  // ── notes ─────────────────────────────────────────────────────────────────
  listNotes(s: Scope): Note[] {
    return (this.db.prepare('SELECT * FROM notes WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToNote);
  }

  getNote(s: Scope, id: string): Note | undefined {
    const r = this.db.prepare('SELECT * FROM notes WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToNote(r) : undefined;
  }

  createNote(s: Scope, nodeId: string, content: string): Note {
    this.assertWorkspace(s);
    this.requireNode(s, nodeId);
    const t = now();
    const n: Note = { id: newId('note'), workspaceId: s.workspaceId, nodeId, content, createdAt: t, updatedAt: t };
    this.db.prepare('INSERT INTO notes (id, user_id, workspace_id, node_id, content, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(n.id, s.userId, s.workspaceId, nodeId, content, t, t);
    return n;
  }

  updateNote(s: Scope, id: string, content: string): Note {
    const cur = this.getNote(s, id);
    if (!cur) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const t = now();
    this.db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ? AND workspace_id = ?').run(content, t, id, s.workspaceId);
    return { ...cur, content, updatedAt: t };
  }

  deleteNote(s: Scope, id: string) {
    this.db.prepare('DELETE FROM notes WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
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
    this.db.prepare('INSERT INTO deliverables (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(d.id, s.userId, s.workspaceId, JSON.stringify({ ...d, workspaceId: s.workspaceId }), d.createdAt);
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
    return (this.db.prepare('SELECT data FROM specs WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
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
    return rows.map((r) => {
      const ws = JSON.parse(r.data) as Workspace;
      const entries = (this.db.prepare('SELECT data FROM ledger WHERE workspace_id = ? AND user_id = ? AND created_at LIKE ?').all(r.id, r.user_id, `${month}%`) as Array<{ data: string }>).map((x) => JSON.parse(x.data) as LedgerEntry);
      return { userId: r.user_id, workspaceId: r.id, name: ws.name, planId: ws.planId, entries };
    });
  }

  // ── MCP tokens (one personal token per connection, per workspace) ─────────
  createMcpToken(s: Scope, label: string): { id: string; token: string; last4: string } {
    this.assertWorkspace(s);
    const token = `mbd_${crypto.randomBytes(32).toString('base64url')}`;
    const id = newId('mcp');
    this.db.prepare('INSERT INTO mcp_tokens (id, user_id, workspace_id, label, token_hash, last4, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, s.userId, s.workspaceId, label.trim() || 'AI', hashToken(token), token.slice(-4), now());
    return { id, token, last4: token.slice(-4) };
  }

  listMcpTokens(s: Scope): Array<{ id: string; label: string; last4: string; createdAt: string; lastUsedAt?: string; revokedAt?: string }> {
    return (this.db.prepare('SELECT * FROM mcp_tokens WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ id: r.id as string, label: r.label as string, last4: r.last4 as string, createdAt: r.created_at as string, ...(r.last_used_at ? { lastUsedAt: r.last_used_at as string } : {}), ...(r.revoked_at ? { revokedAt: r.revoked_at as string } : {}) }));
  }

  revokeMcpToken(s: Scope, id: string) {
    this.db.prepare('UPDATE mcp_tokens SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ? AND revoked_at IS NULL').run(now(), id, s.workspaceId, s.userId);
  }

  /** token → who it speaks for. Revoked tokens never resolve. */
  resolveMcpToken(token: string): { scope: Scope; tokenId: string; label: string } | null {
    if (!token.startsWith('mbd_')) return null;
    const r = this.db.prepare('SELECT id, user_id, workspace_id, label FROM mcp_tokens WHERE token_hash = ? AND revoked_at IS NULL').get(hashToken(token)) as { id: string; user_id: string; workspace_id: string; label: string } | undefined;
    if (!r) return null;
    this.db.prepare('UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?').run(now(), r.id);
    return { scope: { userId: r.user_id, workspaceId: r.workspace_id }, tokenId: r.id, label: r.label };
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

  // ── whole-workspace state + one-time legacy import ───────────────────────
  state(s: Scope) {
    this.assertWorkspace(s);
    const objects = this.listObjects(s);
    const deliverables = this.listDeliverables(s);
    return {
      workspace: this.getWorkspace(s.userId, s.workspaceId)!,
      nodes: this.listNodes(s), objects, relationships: this.listRelationships(s), notes: this.listNotes(s),
      deliverables, ledger: this.listLedger(s), sessions: this.listSessions(s), specs: this.listSpecs(s), files: this.listFiles(s),
      stale: this.impactEnabled(s) ? computeStaleAssets(deliverables, objects) : [],
      judgments: this.listJudgments(s),
    };
  }

  isImported(userId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM kv WHERE user_id = ? AND key = 'legacy_import'").get(userId);
  }

  markImported(userId: string, source: string) {
    this.db.prepare("INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, 'legacy_import', ?)").run(userId, JSON.stringify({ source, at: now() }));
  }
}
