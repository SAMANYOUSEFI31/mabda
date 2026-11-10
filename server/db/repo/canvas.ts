/**
 * Declared canvas positions (free canvas items, board ranks).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { ChangeMeta, RepoError, Scope } from './shared.ts';

export const canvasMethods = {
  listCanvasItems(this: Repo, s: Scope, view: 'decisions' | 'free'): Array<{ itemRef: string; lane?: string; rank?: number; x?: number; y?: number }> {
    return (this.db.prepare('SELECT * FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = ?').all(s.workspaceId, s.userId, view) as Array<Record<string, unknown>>)
      .map((r) => ({ itemRef: r.item_ref as string, ...(r.lane ? { lane: r.lane as string } : {}), ...(r.rank !== null ? { rank: r.rank as number } : {}), ...(r.x !== null ? { x: r.x as number } : {}), ...(r.y !== null ? { y: r.y as number } : {}) }));
  },

  saveCanvasItem(this: Repo, s: Scope, view: 'decisions' | 'free', itemRef: string, v: { lane?: string; rank?: number; x?: number; y?: number }) {
    this.db.prepare(`INSERT INTO canvas_view_items (user_id, workspace_id, view, item_ref, lane, rank, x, y) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(workspace_id, view, item_ref) DO UPDATE SET lane = COALESCE(excluded.lane, lane), rank = COALESCE(excluded.rank, rank), x = COALESCE(excluded.x, x), y = COALESCE(excluded.y, y)`)
      .run(s.userId, s.workspaceId, view, itemRef, v.lane ?? null, v.rank ?? null, v.x ?? null, v.y ?? null);
  },

  removeCanvasItem(this: Repo, s: Scope, view: 'decisions' | 'free', itemRef: string) {
    this.db.prepare('DELETE FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = ? AND item_ref = ?').run(s.workspaceId, s.userId, view, itemRef);
  },

  clearCanvas(this: Repo, s: Scope, view: 'decisions' | 'free') {
    this.db.prepare('DELETE FROM canvas_view_items WHERE workspace_id = ? AND user_id = ? AND view = ?').run(s.workspaceId, s.userId, view);
  },

  /** an explicit priority inside a column IS meaning, so it is a Change (kind edited, field `rank`); the position of free notes is not */
  setRank(this: Repo, s: Scope, objectId: string, rank: number, lane: string, meta?: ChangeMeta) {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    const before = this.listCanvasItems(s, 'decisions').find((i) => i.itemRef === `obj:${objectId}`)?.rank;
    this.db.transaction(() => {
      this.saveCanvasItem(s, 'decisions', `obj:${objectId}`, { lane, rank });
      this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'edited', meta, before: { rank: before ?? null }, after: { rank } });
    })();
  },
};
