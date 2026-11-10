/**
 * Notes (raw Material) and their sync with Thoughts (docs/spine.md → یادداشت ↔ فکر).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { RepoError, Scope, newId, now, rowToNote } from './shared.ts';
import { can } from '../../../src/core/entitlements.ts';
import type { Note } from '../../../src/types/index.ts';

export const notesMethods = {
  importNote(this: Repo, s: Scope, n: Note) {
    this.db.transaction(() => {
      this.db.prepare('INSERT OR REPLACE INTO notes (id, user_id, workspace_id, node_id, content, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(n.id, s.userId, s.workspaceId, n.nodeId, n.content, n.createdAt, n.updatedAt);
      this.syncNoteThoughts(s, n, true);
    })();
  },

  listNotes(this: Repo, s: Scope): Note[] {
    return (this.db.prepare('SELECT * FROM notes WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToNote);
  },

  getNote(this: Repo, s: Scope, id: string): Note | undefined {
    const r = this.db.prepare('SELECT * FROM notes WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToNote(r) : undefined;
  },

  createNote(this: Repo, s: Scope, nodeId: string, content: string): Note {
    this.assertWorkspace(s);
    nodeId = this.placeNode(s, nodeId);
    const t = now();
    const n: Note = { id: newId('note'), workspaceId: s.workspaceId, nodeId, content, createdAt: t, updatedAt: t };
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO notes (id, user_id, workspace_id, node_id, content, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(n.id, s.userId, s.workspaceId, nodeId, content, t, t);
      this.syncNoteThoughts(s, n);
    })();
    return n;
  },

  updateNote(this: Repo, s: Scope, id: string, content: string): Note {
    const cur = this.getNote(s, id);
    if (!cur) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const t = now();
    const updated = { ...cur, content, updatedAt: t };
    this.db.transaction(() => {
      this.db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ? AND workspace_id = ?').run(content, t, id, s.workspaceId);
      this.syncNoteThoughts(s, updated);
    })();
    return updated;
  },

  /** a thought changes its SECTION (dragged into another section's frame on the free canvas); the text and the place stay */
  moveNoteToNode(this: Repo, s: Scope, id: string, nodeId: string): Note {
    const cur = this.getNote(s, id);
    if (!cur) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    if (!this.listNodes(s).some((n) => n.id === nodeId)) throw new RepoError('not_found', 'بخش پیدا نشد.');
    this.db.transaction(() => {
      this.db.prepare('UPDATE notes SET node_id = ? WHERE id = ? AND workspace_id = ?').run(nodeId, id, s.workspaceId);
      this.db.prepare('UPDATE thoughts SET node_id = ? WHERE source_note_id = ? AND source_line IS NOT NULL AND workspace_id = ? AND user_id = ?').run(nodeId, id, s.workspaceId, s.userId);
    })();
    return { ...cur, nodeId };
  },

  /** «برگرداندن»: the note comes back with its own id, text, dates and (if it had one) its place on the free canvas */
  restoreNote(this: Repo, s: Scope, n: Note, pos?: { x?: number; y?: number }): Note {
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
  },

  /** where a note sits on the free canvas (so a delete can be undone completely) */
  notePosition(this: Repo, s: Scope, id: string): { x?: number; y?: number } | undefined {
    const r = this.db.prepare("SELECT x, y FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = 'free' AND item_ref = ?").get(s.workspaceId, s.userId, `note:${id}`) as { x: number | null; y: number | null } | undefined;
    return r ? { ...(r.x !== null ? { x: r.x } : {}), ...(r.y !== null ? { y: r.y } : {}) } : undefined;
  },

  /** how many OPEN thoughts a note holds (what the delete dialog tells the user: «N فکر باز دارد؛ می‌مانند») */
  countOpenThoughtsOf(this: Repo, s: Scope, noteId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM thoughts WHERE workspace_id = ? AND user_id = ? AND source_note_id = ? AND status = 'open'").get(s.workspaceId, s.userId, noteId) as { n: number }).n;
  },

  /**
   * Deleting a note: its thoughts are the user's, so by default they STAY (open ones say «یادداشت حذف شد»). With `removeThoughts`
   * the OPEN ones go too (converted ones are knowledge now and always stay).
   */
  deleteNote(this: Repo, s: Scope, id: string, opts: { removeThoughts?: boolean } = {}): { keptThoughts: number; removedThoughts: number } {
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
  },
};
