/**
 * Saved chat sessions.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { Scope } from './shared.ts';
import type { ChatSession } from '../../../src/types/index.ts';

export const sessionsMethods = {
  listSessions(this: Repo, s: Scope): ChatSession[] {
    return (this.db.prepare('SELECT data FROM chat_sessions WHERE workspace_id = ? AND user_id = ? ORDER BY updated_at DESC').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  },

  saveSession(this: Repo, s: Scope, c: ChatSession): ChatSession {
    this.assertWorkspace(s);
    this.db.prepare('INSERT INTO chat_sessions (id, user_id, workspace_id, data, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE user_id = excluded.user_id')
      .run(c.id, s.userId, s.workspaceId, JSON.stringify({ ...c, workspaceId: s.workspaceId }), c.updatedAt);
    return c;
  },

  deleteSession(this: Repo, s: Scope, id: string) {
    this.db.prepare('DELETE FROM chat_sessions WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
  },
};
