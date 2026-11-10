/**
 * Built outputs (deliverables).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { RepoError, Scope } from './shared.ts';
import type { GeneratedDeliverable } from '../../../src/types/index.ts';

export const deliverablesMethods = {
  listDeliverables(this: Repo, s: Scope): GeneratedDeliverable[] {
    return (this.db.prepare('SELECT data FROM deliverables WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  },

  getDeliverable(this: Repo, s: Scope, id: string): GeneratedDeliverable | undefined {
    const r = this.db.prepare('SELECT data FROM deliverables WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as { data: string } | undefined;
    return r ? JSON.parse(r.data) : undefined;
  },

  saveDeliverable(this: Repo, s: Scope, d: GeneratedDeliverable): GeneratedDeliverable {
    this.assertWorkspace(s);
    const own = this.db.prepare('SELECT user_id, workspace_id FROM deliverables WHERE id = ?').get(d.id) as { user_id: string; workspace_id: string } | undefined;
    if (own && (own.user_id !== s.userId || own.workspace_id !== s.workspaceId)) throw new RepoError('forbidden', 'دسترسی ندارید.');
    const archivedAt = (this.getDeliverable(s, d.id) as GeneratedDeliverable | undefined)?.archivedAt;
    const keep = { ...d, workspaceId: s.workspaceId, ...(archivedAt ? { archivedAt } : {}) };
    if (!archivedAt) delete keep.archivedAt;
    this.db.prepare('INSERT INTO deliverables (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(d.id, s.userId, s.workspaceId, JSON.stringify(keep), d.createdAt);
    return d;
  },
};
