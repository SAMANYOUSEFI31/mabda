import type { ContextObject, GeneratedDeliverable, TreeNode, Workspace } from '../../src/types/index.ts';
import { containsAny, needlesOf, nodeRemovalPlan, scrubLines } from '../../src/core/removal.ts';
import type { NodeRemovalPlan, RemovalMode } from '../../src/core/removal.ts';
import { defaultNodeId } from '../../src/core/nodeTree.ts';
import { RepoError, newId } from './repo.ts';
import type { Repo, Scope } from './repo.ts';

/**
 * Archive, delete, permanent delete, undo (docs/removal.md). Everything here is one transaction and says what it did.
 *  · archive  — the thing is hidden, history stays, it comes back with «برگردان»
 *  · delete   — a small, throwaway thing; the CLIENT keeps a copy for «برگرداندن» (notes, packs, templates, sessions); a node
 *               delete is stored as a removal batch that the server can undo
 *  · permanent delete — only from the archive; no trace of the text in any table (see `purgeObject`)
 */

const now = () => new Date().toISOString();
/** after an erase for good: the write-ahead log is folded into the file and emptied, so the old pages do not linger in it */
const flushErased = (repo: Repo) => { try { repo.db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* an in-memory database has no log */ } };
const rows = <T = Record<string, unknown>>(repo: Repo, sql: string, ...args: unknown[]) => repo.db.prepare(sql).all(...args) as T[];

// ───────────────────────────── permanent delete of one piece of knowledge ─────────────────────────────

export interface PurgeImpact {
  title: string;
  status: string;
  versions: number;
  changes: number;
  relationships: number;
  /** outputs built from it: they keep their own text; its name will show as «حذف‌شده» */
  usedIn: Array<{ id: string; title: string }>;
  /** pointers to this knowledge that become «منبع حذف‌شده» (they are never erased: the thoughts were only ABOUT it or became it) */
  pointers: { thoughtsAbout: number; thoughtsConverted: number };
  /** other places that say the same words — she picks which to clean (files cannot be edited: they are listed so she knows) */
  copies: {
    notes: Array<{ id: string; nodeLabel: string; lines: number }>;
    /** thoughts that say the same words (as text, an earlier wording, or where they came from) — she picks which to erase */
    thoughts: Array<{ id: string; nodeLabel: string; status: string }>;
    sessions: Array<{ id: string; title: string }>;
    deliverables: Array<{ id: string; title: string }>;
    files: Array<{ id: string; name: string }>;
  };
}

export function purgeImpact(repo: Repo, s: Scope, id: string): PurgeImpact {
  const o = repo.getObjectAny(s, id);
  if (!o) throw new RepoError('not_found', 'مورد پیدا نشد.');
  const needles = needlesOf(o);
  const nodes = repo.listNodes(s);
  const count = (sql: string, ...a: unknown[]) => (repo.db.prepare(sql).get(...a) as { n: number }).n;
  const deliverables = repo.listDeliverables(s);
  const noteCopies = repo.listNotes(s).filter((n) => containsAny(n.content, needles)).map((n) => ({ id: n.id, nodeLabel: nodes.find((x) => x.id === n.nodeId)?.label ?? 'بخش حذف‌شده', lines: n.content.split(/\r?\n/).filter((l) => containsAny(l, needles)).length }));
  const fileCopies = rows<{ id: string; name: string }>(repo, 'SELECT DISTINCT f.id, f.name FROM files f JOIN file_chunks c ON c.file_id = f.id WHERE f.workspace_id = ? AND f.user_id = ?', s.workspaceId, s.userId)
    .filter((f) => rows<{ text: string }>(repo, 'SELECT text FROM file_chunks WHERE file_id = ?', f.id).some((c) => containsAny(c.text, needles)));
  const thoughtText = (t: { id: string; text: string; sourceQuote?: string }) => [t.text, t.sourceQuote ?? '', ...repo.listThoughtRevisions(s, t.id).flatMap((r) => [r.beforeText, r.afterText])].join(' / ');
  const thoughtCopies = repo.listThoughts(s, { includeResolved: true }).filter((t) => containsAny(thoughtText(t), needles))
    .map((t) => ({ id: t.id, nodeLabel: nodes.find((x) => x.id === t.nodeId)?.label ?? 'بخش حذف‌شده', status: t.status }));
  return {
    title: o.title, status: o.status,
    pointers: {
      thoughtsAbout: count("SELECT COUNT(DISTINCT thought_id) AS n FROM thought_about WHERE target_kind = 'object' AND target_id = ? AND workspace_id = ?", id, s.workspaceId),
      thoughtsConverted: count('SELECT COUNT(*) AS n FROM thoughts WHERE resolved_object_id = ? AND workspace_id = ?', id, s.workspaceId),
    },
    versions: count('SELECT COUNT(*) AS n FROM context_object_versions WHERE object_id = ? AND workspace_id = ?', id, s.workspaceId),
    changes: count('SELECT COUNT(*) AS n FROM context_changes WHERE object_id = ? AND workspace_id = ?', id, s.workspaceId),
    relationships: count('SELECT COUNT(*) AS n FROM context_relationships WHERE workspace_id = ? AND (source_id = ? OR target_id = ?)', s.workspaceId, id, id),
    usedIn: deliverables.filter((d) => (d.usedContext ?? []).some((u) => u.id === id)).map((d) => ({ id: d.id, title: d.title })),
    copies: {
      notes: noteCopies,
      thoughts: thoughtCopies,
      sessions: repo.listSessions(s).filter((c) => containsAny(JSON.stringify(c.messages ?? []), needles)).map((c) => ({ id: c.id, title: c.title || 'گفتگو' })),
      deliverables: deliverables.filter((d) => containsAny(d.content, needles)).map((d) => ({ id: d.id, title: d.title })),
      files: fileCopies,
    },
  };
}

/**
 * The knowledge is erased from EVERY table that could hold its words: the row, every version, every change (before / after /
 * reason), its relations, its canvas place, the judgments about it, its mention in recorded packs; the copies she picked (a note's
 * lines, a saved chat, an output) are cleaned too. What stays is one record WITHOUT content: «یک مورد حذف دائمی شد».
 * Only knowledge that is already out of the way (archived or superseded) can be erased: nobody erases the truth by one click.
 */
export function purgeObject(repo: Repo, s: Scope, id: string, copies: { notes?: string[]; thoughts?: string[]; sessions?: string[]; deliverables?: string[] } = {}): { purged: string; scrubbed: { notes: number; thoughts: number; sessions: number; deliverables: number } } {
  const o = repo.getObjectAny(s, id);
  if (!o) throw new RepoError('not_found', 'مورد پیدا نشد.');
  if (o.status !== 'Archived' && o.status !== 'Superseded') throw new RepoError('forbidden', 'حذف دائمی فقط از بایگانی ممکن است؛ اول بایگانی کن.');
  const needles = needlesOf(o);
  const out = { notes: 0, thoughts: 0, sessions: 0, deliverables: 0 };
  repo.db.transaction(() => {
    const w = s.workspaceId, u = s.userId;
    repo.db.prepare('DELETE FROM context_object_versions WHERE object_id = ? AND workspace_id = ?').run(id, w);
    repo.db.prepare('DELETE FROM context_changes WHERE object_id = ? AND workspace_id = ?').run(id, w);
    repo.db.prepare('DELETE FROM context_relationships WHERE workspace_id = ? AND (source_id = ? OR target_id = ?)').run(w, id, id);
    repo.db.prepare('DELETE FROM canvas_view_items WHERE workspace_id = ? AND item_ref = ?').run(w, `obj:${id}`);
    repo.db.prepare('DELETE FROM context_judgments WHERE object_id = ? AND workspace_id = ?').run(id, w);
    repo.db.prepare('DELETE FROM contradiction_judgments WHERE workspace_id = ? AND (a_id = ? OR b_id = ?)').run(w, id, id);
    repo.db.prepare('UPDATE context_objects SET superseded_by_id = NULL WHERE workspace_id = ? AND superseded_by_id = ?').run(w, id);
    // recorded packs keep only «which things were in it»: the id goes
    for (const p of rows<{ id: string; refs: string }>(repo, 'SELECT id, refs FROM context_packs WHERE workspace_id = ? AND user_id = ?', w, u)) {
      const refs = (JSON.parse(p.refs) as Array<{ id: string }>);
      if (refs.some((r) => r.id === id)) repo.db.prepare('UPDATE context_packs SET refs = ? WHERE id = ?').run(JSON.stringify(refs.filter((r) => r.id !== id)), p.id);
    }
    // an output keeps its own text; only the pointer to the erased source goes (an id is still a trace), and the card says «N منبع حذف‌شده»
    for (const d of repo.listDeliverables(s) as Array<GeneratedDeliverable & { removedSources?: number }>) {
      if (!(d.usedContext ?? []).some((u) => u.id === id)) continue;
      const kept = d.usedContext.filter((u) => u.id !== id);
      repo.db.prepare('UPDATE deliverables SET data = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(JSON.stringify({ ...d, usedContext: kept, removedSources: (d.removedSources ?? 0) + (d.usedContext.length - kept.length) }), d.id, w, u);
    }
    // thoughts that were only ABOUT this knowledge, or became it, are not erased: the pointer goes and they say «منبع حذف‌شده»
    repo.db.prepare("DELETE FROM thought_about WHERE workspace_id = ? AND target_kind = 'object' AND target_id = ?").run(w, id);
    repo.db.prepare('UPDATE thoughts SET resolved_object_id = NULL, resolved_removed = 1 WHERE workspace_id = ? AND resolved_object_id = ?').run(w, id);
    for (const ev of rows<{ id: string; event_kind: string; before_value: string | null; after_value: string | null }>(repo, "SELECT id, event_kind, before_value, after_value FROM thought_events WHERE workspace_id = ? AND event_kind IN ('resolved','about_updated')", w)) {
      const clean = (v: string | null): string | null => {
        if (v === null) return v;
        if (ev.event_kind === 'resolved') return v === id ? null : v;
        try { return JSON.stringify((JSON.parse(v) as Array<{ kind: string; id: string }>).filter((t) => !(t.kind === 'object' && t.id === id))); } catch { return v; }
      };
      const b = clean(ev.before_value), a = clean(ev.after_value);
      if (b !== ev.before_value || a !== ev.after_value) repo.db.prepare('UPDATE thought_events SET before_value = ?, after_value = ? WHERE id = ?').run(b, a, ev.id);
    }
    // the thoughts she chose to erase (their text, every revision, every event) — erased from every thought table
    const chosen = (copies.thoughts ?? []).filter((tid) => !!repo.getThought(s, tid));
    out.thoughts = repo.eraseThoughts(s, chosen);
    // the copies she chose
    for (const nid of copies.notes ?? []) {
      const n = repo.getNote(s, nid);
      if (!n) continue;
      const cleaned = scrubLines(n.content, needles);
      if (cleaned.removed === 0) continue;
      if (!cleaned.content.trim()) repo.deleteNote(s, nid); else repo.updateNote(s, nid, cleaned.content);
      out.notes += 1;
    }
    for (const sid of copies.sessions ?? []) { if (repo.listSessions(s).some((c) => c.id === sid)) { repo.deleteSession(s, sid); out.sessions += 1; } }
    for (const did of copies.deliverables ?? []) { if (repo.getDeliverable(s, did)) { deleteDeliverable(repo, s, did); out.deliverables += 1; } }
    repo.db.prepare('DELETE FROM context_objects WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u);
    // the only thing left: a record that says nothing about the content
    repo.recordChange(s, { objectId: id, fromVersion: 0, toVersion: 0, kind: 'purged', meta: { actor: 'user', reason: 'یک مورد حذف دائمی شد' } });
  })();
  flushErased(repo);
  return { purged: id, scrubbed: out };
}

/** «برگردان»: the knowledge comes back with the status it had before it was archived (default: confirmed); into its section if that still exists */
export function restoreObject(repo: Repo, s: Scope, id: string, nodeId?: string) {
  const o = repo.getObjectAny(s, id);
  if (!o) throw new RepoError('not_found', 'مورد پیدا نشد.');
  if (o.status !== 'Archived') throw new RepoError('invalid', 'فقط مورد بایگانی‌شده برمی‌گردد.');
  const nodes = repo.listNodes(s);
  const before = repo.listChanges(s, { objectId: id }).filter((c) => c.kind === 'archived' || c.kind === 'status_changed' || c.kind === 'proposal_rejected').map((c) => (c.before?.status as string | undefined)).filter((st): st is string => !!st && st !== 'Archived' && st !== 'Superseded').pop();
  const status = (['Confirmed', 'Proposed', 'Needs Review'].includes(before ?? '') ? before : 'Confirmed') as ContextObject['status'];
  const target = nodeId && nodes.some((n) => n.id === nodeId) ? nodeId : nodes.some((n) => n.id === o.nodeId) ? o.nodeId : defaultNodeId(nodes);
  return repo.updateObject(s, id, { status, ...(target !== o.nodeId ? { nodeId: target } : {}) }, { actor: 'user', reason: 'از بایگانی برگشت' });
}

/** everything that is out of the way, for the «بایگانی» dialog (archived and superseded knowledge) */
export const archivedObjects = (repo: Repo, s: Scope): ContextObject[] => repo.listObjects(s).filter((o) => o.status === 'Archived' || o.status === 'Superseded');

// ───────────────────────────── nodes: delete with a plan, undo ─────────────────────────────

interface NodeBatch {
  mode: RemovalMode;
  rootId: string;
  target?: string;
  nodes: Array<{ id: string; parentId?: string; label: string; description: string; order: number }>;
  /** content that moved out of the branch: id → the node it was in */
  objects: Record<string, string>;
  notes: Record<string, string>;
  /** Thoughts moved with their node; undo tolerates this field being absent in older batches. */
  thoughts: Record<string, string>;
  files: Record<string, string>;
  /** archived knowledge: id → the status it had */
  archived: Record<string, string>;
  /** direct children that were reparented (move mode): id → previous parent & order */
  children: Array<{ id: string; parentId?: string; order: number }>;
  samples: Array<Record<string, unknown>>;
}

export function planNodeRemoval(repo: Repo, s: Scope, id: string, o: { mode?: RemovalMode; transferTo?: string }): NodeRemovalPlan {
  return nodeRemovalPlan({ nodes: repo.listNodes(s), objects: [...repo.listObjects(s), ...repo.listSampleObjects(s)], notes: repo.listNotes(s), thoughts: repo.listThoughts(s, { includeResolved: true }), files: repo.listFiles(s), relationships: repo.listRelationships(s), id, mode: o.mode, transferTo: o.transferTo });
}

export function removeNode(repo: Repo, s: Scope, id: string, o: { mode?: RemovalMode; transferTo?: string }): { nodes: TreeNode[]; removal: { id: string; label: string }; plan: NodeRemovalPlan } {
  const mode = o.mode ?? 'move';
  const plan = planNodeRemoval(repo, s, id, o);
  if (!plan.ok) throw new RepoError('invalid', plan.reason ?? 'حذف ممکن نیست.');
  // the plan may SUGGEST a target (its default is the parent — what the dialog preselects); doing it still needs one to be named
  const needsPlace = mode === 'move' ? plan.counts.objects + plan.counts.notes + plan.counts.thoughts + plan.counts.files + plan.counts.children > 0 : plan.counts.notes + plan.counts.thoughts + plan.counts.files > 0;
  if (needsPlace && !o.transferTo) throw new RepoError('invalid', 'این بخش خالی نیست؛ محتوایش را به بخش دیگری ببر.');
  const allNodes = repo.listNodes(s);
  const here = allNodes.find((n) => n.id === id)!;
  const branch = new Set(plan.removed);
  const batch: NodeBatch = {
    mode, rootId: id, ...(plan.target ? { target: plan.target } : {}),
    nodes: allNodes.filter((n) => branch.has(n.id)).map((n) => ({ id: n.id, ...(n.parentId ? { parentId: n.parentId } : {}), label: n.label, description: n.description, order: n.order ?? 0 })),
    objects: {}, notes: {}, thoughts: {}, files: {}, archived: {}, children: [], samples: [],
  };
  const objects = repo.listObjects(s), notes = repo.listNotes(s), thoughts = repo.listThoughts(s, { includeResolved: true }), files = repo.listFiles(s);
  const ownNodes = mode === 'archive' ? branch : new Set([id]);
  return repo.db.transaction(() => {
    if (mode === 'move') {
      for (const x of objects.filter((x) => x.nodeId === id)) batch.objects[x.id] = id;
      for (const x of notes.filter((x) => x.nodeId === id)) batch.notes[x.id] = id;
      for (const x of thoughts.filter((x) => x.nodeId === id)) batch.thoughts[x.id] = id;
      for (const x of files.filter((x) => x.nodeId === id)) batch.files[x.id] = id;
      batch.children = allNodes.filter((n) => n.parentId === id).map((n) => ({ id: n.id, ...(n.parentId ? { parentId: n.parentId } : {}), order: n.order ?? 0 }));
      // the existing safe delete does the moving and the Changes (knowledge moved, node deleted)
      repo.deleteNode(s, id, plan.target && (Object.keys(batch.objects).length + Object.keys(batch.notes).length + Object.keys(batch.thoughts).length + Object.keys(batch.files).length + batch.children.length > 0) ? plan.target : undefined);
    } else {
      for (const x of objects.filter((x) => ownNodes.has(x.nodeId) && x.status !== 'Archived' && x.status !== 'Superseded')) {
        batch.archived[x.id] = x.status;
        repo.updateObject(s, x.id, { status: 'Archived' }, { actor: 'user', reason: `گرهٔ «${here.label}» با شاخه‌اش بایگانی شد` });
      }
      for (const x of notes.filter((x) => ownNodes.has(x.nodeId))) { batch.notes[x.id] = x.nodeId; repo.db.prepare('UPDATE notes SET node_id = ? WHERE id = ? AND workspace_id = ?').run(plan.target, x.id, s.workspaceId); }
      for (const x of thoughts.filter((x) => ownNodes.has(x.nodeId))) { batch.thoughts[x.id] = x.nodeId; repo.db.prepare('UPDATE thoughts SET node_id = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(plan.target, x.id, s.workspaceId, s.userId); }
      for (const x of files.filter((x) => x.nodeId && ownNodes.has(x.nodeId))) { batch.files[x.id] = x.nodeId!; repo.db.prepare('UPDATE files SET node_id = ? WHERE id = ? AND workspace_id = ?').run(plan.target, x.id, s.workspaceId); }
      for (const smp of repo.listSampleObjects(s).filter((x) => ownNodes.has(x.nodeId))) { batch.samples.push(smp as unknown as Record<string, unknown>); }
      repo.deleteSamples(s, [...ownNodes]);
      // the branch's sections go, deepest first (its knowledge stays, archived, with the section it was in)
      repo.recordChange(s, { objectId: `node:${id}`, fromVersion: 0, toVersion: 0, kind: 'node_deleted', meta: { actor: 'user', reason: `گرهٔ «${here.label}» با ${batch.nodes.length - 1} زیربخشش بایگانی شد؛ ${Object.keys(batch.archived).length} دانش بایگانی شد.` } });
      for (const n of [...batch.nodes].reverse()) repo.db.prepare('DELETE FROM tree_nodes WHERE workspace_id = ? AND id = ?').run(s.workspaceId, n.id);
    }
    const removalId = newId('rm');
    const label = mode === 'archive' ? `«${here.label}» با شاخه‌اش بایگانی شد` : `«${here.label}» حذف شد`;
    repo.db.prepare('INSERT INTO removal_batches (id, user_id, workspace_id, kind, label, payload, created_at) VALUES (?,?,?,?,?,?,?)').run(removalId, s.userId, s.workspaceId, 'node', label, JSON.stringify(batch), now());
    return { nodes: repo.listNodes(s), removal: { id: removalId, label }, plan };
  })();
}

export function listRemovals(repo: Repo, s: Scope): Array<{ id: string; kind: string; label: string; createdAt: string }> {
  return rows<{ id: string; kind: string; label: string; created_at: string }>(repo, 'SELECT id, kind, label, created_at FROM removal_batches WHERE workspace_id = ? AND user_id = ? AND undone_at IS NULL ORDER BY created_at DESC, id LIMIT 50', s.workspaceId, s.userId)
    .map((r) => ({ id: r.id, kind: r.kind, label: r.label, createdAt: r.created_at }));
}

/** «برگرداندن»: the sections, moved Material/Thoughts and archived knowledge come back exactly as they were */
export function undoRemoval(repo: Repo, s: Scope, batchId: string): { nodes: TreeNode[] } {
  const row = repo.db.prepare('SELECT * FROM removal_batches WHERE id = ? AND workspace_id = ? AND user_id = ?').get(batchId, s.workspaceId, s.userId) as { payload: string; undone_at: string | null; label: string } | undefined;
  if (!row) throw new RepoError('not_found', 'این حذف پیدا نشد.');
  if (row.undone_at) throw new RepoError('invalid', 'این حذف قبلاً برگردانده شده.');
  const b = JSON.parse(row.payload) as NodeBatch;
  return repo.db.transaction(() => {
    const have = new Set(repo.listNodes(s).map((n) => n.id));
    if (b.nodes.some((n) => have.has(n.id))) throw new RepoError('invalid', 'بخشی با همین شناسه از نو ساخته شده؛ برگرداندن ممکن نیست.');
    const ins = repo.db.prepare('INSERT INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)');
    const exists = (id?: string) => !!id && (have.has(id) || b.nodes.some((n) => n.id === id));
    for (const n of b.nodes) ins.run(n.id, s.userId, s.workspaceId, exists(n.parentId) ? n.parentId : null, n.label, n.description, n.order);
    const back = (table: 'context_objects' | 'notes' | 'files', col: string, map: Record<string, string>) => {
      for (const [id, nodeId] of Object.entries(map)) repo.db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ? AND workspace_id = ?`).run(nodeId, id, s.workspaceId);
    };
    back('context_objects', 'node_id', b.mode === 'move' ? b.objects : {});
    back('notes', 'node_id', b.notes);
    for (const [id, nodeId] of Object.entries(b.thoughts ?? {})) repo.db.prepare('UPDATE thoughts SET node_id = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(nodeId, id, s.workspaceId, s.userId);
    back('files', 'node_id', b.files);
    for (const c of b.children) repo.db.prepare('UPDATE tree_nodes SET parent_id = ?, ord = ? WHERE workspace_id = ? AND id = ?').run(c.parentId ?? null, c.order, s.workspaceId, c.id);
    for (const [oid, status] of Object.entries(b.archived)) {
      const cur = repo.getObjectAny(s, oid);
      if (cur && cur.status === 'Archived') repo.updateObject(s, oid, { status: status as ContextObject['status'] }, { actor: 'user', reason: 'حذف گره برگردانده شد' });
    }
    for (const smp of b.samples) repo.createSample(s, smp as never);
    repo.recordChange(s, { objectId: `node:${b.rootId}`, fromVersion: 0, toVersion: 0, kind: 'node_restored', meta: { actor: 'user', reason: `${row.label} — برگردانده شد.` } });
    repo.db.prepare('UPDATE removal_batches SET undone_at = ? WHERE id = ?').run(now(), batchId);
    return { nodes: repo.listNodes(s) };
  })();
}

// ───────────────────────────── outputs (deliverables) ─────────────────────────────

const patchDeliverable = (repo: Repo, s: Scope, id: string, fn: (d: GeneratedDeliverable & { archivedAt?: string }) => GeneratedDeliverable & { archivedAt?: string }) => {
  const d = repo.getDeliverable(s, id) as (GeneratedDeliverable & { archivedAt?: string }) | undefined;
  if (!d) throw new RepoError('not_found', 'خروجی پیدا نشد.');
  const next = fn(d);
  repo.db.prepare('UPDATE deliverables SET data = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(JSON.stringify(next), id, s.workspaceId, s.userId);
  return next;
};
export const archiveDeliverable = (repo: Repo, s: Scope, id: string) => patchDeliverable(repo, s, id, (d) => ({ ...d, archivedAt: now() }));
export const restoreDeliverable = (repo: Repo, s: Scope, id: string) => patchDeliverable(repo, s, id, ({ archivedAt: _a, ...d }) => d);
/** an output is throwaway: it goes. Knowledge that came from it keeps its own source label; its history lines stay */
export function deleteDeliverable(repo: Repo, s: Scope, id: string) {
  if (!repo.getDeliverable(s, id)) throw new RepoError('not_found', 'خروجی پیدا نشد.');
  repo.db.prepare('DELETE FROM deliverables WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
  repo.db.prepare("DELETE FROM canvas_view_items WHERE workspace_id = ? AND item_ref = ?").run(s.workspaceId, `asset:${id}`);
}

// ───────────────────────────── workspaces and the whole account ─────────────────────────────

/** every table that has a column — found in the schema itself, so a table added tomorrow is covered without anyone remembering */
const tablesWith = (repo: Repo, column: string): string[] => rows<{ name: string }>(repo, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'")
  .map((t) => t.name).filter((t) => rows<{ name: string }>(repo, `PRAGMA table_info(${t})`).some((c) => c.name === column));

export function archiveWorkspace(repo: Repo, userId: string, id: string, archive: boolean): Workspace {
  const ws = repo.getWorkspace(userId, id);
  if (!ws) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
  const next: Workspace = archive ? { ...ws, archivedAt: now() } : { ...ws, archivedAt: undefined };
  if (!archive) delete next.archivedAt;
  repo.db.prepare('UPDATE workspaces SET data = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(next), id, userId);
  return next;
}

/** a workspace and every row that belongs to it, in every table (the schema decides which) */
export function deleteWorkspace(repo: Repo, userId: string, id: string): { removed: number } {
  if (!repo.getWorkspace(userId, id)) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
  let removed = 0;
  repo.db.transaction(() => {
    for (const t of tablesWith(repo, 'workspace_id')) removed += repo.db.prepare(`DELETE FROM ${t} WHERE workspace_id = ? AND user_id = ?`).run(id, userId).changes;
    for (const t of tablesWith(repo, 'file_id')) { // chunks carry the workspace too, but be sure no orphan text is left
      if (t === 'file_chunks') repo.db.prepare('DELETE FROM file_chunks WHERE file_id NOT IN (SELECT id FROM files)').run();
    }
  })();
  flushErased(repo);
  return { removed };
}

/** «حذف همهٔ داده‌ها»: every row of this user in every table. The install itself (schema, other users) is not touched. */
export function wipeUser(repo: Repo, userId: string): { removed: number } {
  let removed = 0;
  repo.db.transaction(() => {
    for (const t of tablesWith(repo, 'user_id')) removed += repo.db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId).changes;
    repo.db.prepare('DELETE FROM file_chunks WHERE file_id NOT IN (SELECT id FROM files)').run();
    // an empty install must stay empty: no seed workspace comes back by itself
    repo.markImported(userId, 'wiped');
  })();
  flushErased(repo);
  return { removed };
}
