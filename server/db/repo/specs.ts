/**
 * Workstream specs.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { Scope, now } from './shared.ts';
import type { WorkstreamSpec } from '../../../src/types/index.ts';

export const specsMethods = {
  importSpec(this: Repo, s: Scope, spec: WorkstreamSpec, createdAt: string) {
    this.db.prepare('INSERT OR REPLACE INTO specs (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(spec.id, s.userId, s.workspaceId, JSON.stringify(spec), createdAt);
  },

  listSpecs(this: Repo, s: Scope): WorkstreamSpec[] {
    return (this.db.prepare('SELECT data FROM specs WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  },

  saveSpec(this: Repo, s: Scope, spec: WorkstreamSpec): WorkstreamSpec {
    this.assertWorkspace(s);
    this.db.prepare('INSERT INTO specs (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(spec.id, s.userId, s.workspaceId, JSON.stringify(spec), now());
    return spec;
  },
};
