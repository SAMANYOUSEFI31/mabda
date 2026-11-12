/**
 * The tree of sections (nodes): create, rename, move, delete with transfer.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { ChangeMeta, RepoError, Scope, newId, rowToNode } from './shared.ts';
import { canCreateUnder, canDelete, canMove, canRename, defaultNodeId, movedNodeTree, nextOrder } from '../../../src/core/nodeTree.ts';
import { DEFAULT_START } from '../../../src/core/specs.ts';
import { planNodes } from '../../../src/core/startTemplate.ts';
import type { StartTemplate } from '../../../src/core/startTemplate.ts';
import type { TreeNode } from '../../../src/types/index.ts';

export const nodesMethods = {
  /** the nodes of a start template (default: the ordinary starting point); none of them is locked */
  seedStartNodes(this: Repo, s: Scope, template: StartTemplate = DEFAULT_START) {
    const ins = this.db.prepare('INSERT OR IGNORE INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)');
    for (const n of planNodes(template, [], undefined, (k) => k)) ins.run(n.id, s.userId, s.workspaceId, n.parentId ?? null, n.label, n.description, n.order);
  },

  /** an empty / absent node id means «the default place»; a given one must exist */
  placeNode(this: Repo, s: Scope, nodeId: string | undefined): string {
    const nodes = this.listNodes(s);
    if (!nodeId) return defaultNodeId(nodes);
    if (!nodes.some((n) => n.id === nodeId)) throw new RepoError('invalid', 'بخش مقصد وجود ندارد.');
    return nodeId;
  },

  listNodes(this: Repo, s: Scope): TreeNode[] {
    return (this.db.prepare('SELECT * FROM tree_nodes WHERE workspace_id = ? AND user_id = ? ORDER BY ord, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToNode);
  },

  /** a node under `parentId`, or a new ROOT when `parentId` is empty (the tree may have several roots; the first one is the default place) */
  createNode(this: Repo, s: Scope, input: { parentId?: string; label: string; description?: string }): TreeNode {
    const nodes = this.listNodes(s);
    const parentId = input.parentId || undefined;
    const ok = parentId ? canCreateUnder(nodes, parentId, input.label) : input.label.trim() ? { ok: true as const } : { ok: false as const, reason: 'نام بخش نمی‌تواند خالی باشد.' };
    if (!ok.ok) throw new RepoError('invalid', ok.reason);
    const node: TreeNode = { id: newId('nd'), label: input.label.trim(), description: input.description?.trim() ?? '', ...(parentId ? { parentId } : {}), order: nextOrder(nodes, parentId) };
    this.db.prepare('INSERT INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)')
        .run(node.id, s.userId, s.workspaceId, node.parentId ?? null, node.label, node.description, node.order);
    return node;
  },

  /** rename works for every node, system or not */
  updateNode(this: Repo, s: Scope, id: string, patch: { label?: string; description?: string }): TreeNode {
    const nodes = this.listNodes(s);
    const cur = nodes.find((n) => n.id === id);
    if (!cur) throw new RepoError('not_found', 'بخش پیدا نشد.');
    const label = patch.label ?? cur.label;
    const ok = canRename(nodes, id, label);
    if (!ok.ok) throw new RepoError('invalid', ok.reason);
    const description = patch.description ?? cur.description;
    this.db.prepare('UPDATE tree_nodes SET label = ?, description = ? WHERE workspace_id = ? AND id = ?').run(label.trim(), description, s.workspaceId, id);
    return { ...cur, label: label.trim(), description };
  },

  /** `parentId` '' = the top level. Knowledge, notes, files, relations and history live in the nodes and go with them; the move is one record (`node:<id>`) with an optional reason. */
  moveNode(this: Repo, s: Scope, id: string, parentId: string, index?: number, reason?: string): TreeNode[] {
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
      if ((here.parentId ?? undefined) !== to) this.recordChange(s, { objectId: `node:${id}`, fromVersion: 0, toVersion: 0, kind: 'node_moved', meta: { actor: 'user', reason: reason?.trim() || `بخش «${here.label}» از «${label(here.parentId)}» به «${label(to)}» رفت` }, before: { parent: label(here.parentId) }, after: { parent: label(to) } });
      return this.listNodes(s);
    })();
  },

  /** Delete a user node: only if empty, or after moving objects, notes, Thoughts, files and child nodes to `transferTo`. */
  deleteNode(this: Repo, s: Scope, id: string, transferTo?: string): TreeNode[] {
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
        for (const o of objects.filter((x) => x.nodeId === id)) this.recordChange(s, { objectId: o.id, fromVersion: o.version, toVersion: o.version, kind: 'edited', meta: { actor: 'user', reason: `بخش «${here.label}» حذف شد؛ این دانش به «${target?.label ?? ''}» رفت` }, before: { nodeId: id }, after: { nodeId: transferTo } });
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
      this.recordChange(s, { objectId: `node:${id}`, fromVersion: 0, toVersion: 0, kind: 'node_deleted', meta: { actor: 'user', reason: target ? `بخش «${here.label}» حذف شد؛ ${moved.objects} دانش، ${moved.notes} یادداشت، ${moved.thoughts} فکر، ${moved.files} فایل و ${moved.nodes} زیربخش به «${target.label}» رفت` : `بخش خالی «${here.label}» حذف شد` }, before: { label: here.label }, after: {} });
      this.db.prepare('DELETE FROM tree_nodes WHERE workspace_id = ? AND id = ?').run(s.workspaceId, id);
      return this.listNodes(s);
    })();
  },

  requireNode(this: Repo, s: Scope, nodeId: string) {
    if (!this.listNodes(s).some((n) => n.id === nodeId)) throw new RepoError('invalid', 'بخش مقصد وجود ندارد.');
  },

  importNode(this: Repo, s: Scope, n: TreeNode) {
    this.db.prepare('INSERT OR REPLACE INTO tree_nodes (id, user_id, workspace_id, parent_id, label, description, is_system, ord) VALUES (?,?,?,?,?,?,0,?)').run(n.id, s.userId, s.workspaceId, n.parentId ?? null, n.label, n.description, n.order ?? 0);
  },

  /**
   * «تبدیل به بخش»: every `##` section of a note becomes a child node of the note's node, holding that section as its
   * own note. The original note is untouched. One Change per new node (object id `node:<id>`), so the record is there.
   */
  nodesFromNote(this: Repo, s: Scope, noteId: string, sections: Array<{ title: string; body: string }>, meta?: ChangeMeta): TreeNode[] {
    const note = this.getNote(s, noteId);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const clean = sections.map((x) => ({ title: x.title.trim().slice(0, 80), body: x.body.trim() })).filter((x) => x.title).slice(0, 12);
    if (clean.length < 2) throw new RepoError('invalid', 'برای تبدیل به بخش دست‌کم دو تیتر ## لازم است.');
    return this.db.transaction(() => {
      const created: TreeNode[] = [];
      for (const sec of clean) {
        const node = this.createNode(s, { parentId: note.nodeId, label: sec.title });
        if (sec.body) this.createNote(s, node.id, sec.body);
        this.recordChange(s, { objectId: `node:${node.id}`, fromVersion: 0, toVersion: 0, kind: 'node_from_note', meta: { ...meta, reason: meta?.reason ?? 'بخش بزرگ‌شدهٔ یادداشت به بخش تبدیل شد؛ متن اصلی یادداشت می‌ماند.' }, after: { nodeId: node.id, parentId: note.nodeId, noteId, title: sec.title } });
        created.push(node);
      }
      return created;
    })();
  },
};
