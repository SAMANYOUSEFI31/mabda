/**
 * The user's own reusable node / workstream templates.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { RepoError, Scope, newId, now } from './shared.ts';

export const templatesMethods = {
  listTemplates(this: Repo, userId: string): Array<{ id: string; kind: 'node' | 'workstream'; name: string; payload: unknown; createdAt: string }> {
    return (this.db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC, id').all(userId) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, kind: r.kind as 'node' | 'workstream', name: r.name as string, payload: JSON.parse(r.payload as string), createdAt: r.created_at as string }));
  },

  saveTemplate(this: Repo, s: Scope, kind: 'node' | 'workstream', name: string, payload: unknown, at?: string, id?: string) {
    const n = name.trim().slice(0, 80);
    if (!n) throw new RepoError('invalid', 'نام قالب لازم است.');
    const tid = id ?? newId('tpl');
    this.db.prepare('INSERT OR REPLACE INTO templates (id, user_id, workspace_id, kind, name, payload, created_at) VALUES (?,?,?,?,?,?,?)').run(tid, s.userId, s.workspaceId, kind, n, JSON.stringify(payload), at ?? now());
    return tid;
  },

  deleteTemplate(this: Repo, userId: string, id: string) { this.db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId); },
};
