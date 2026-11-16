/**
 * Workspaces, the fair-use limits (src/core/limits.ts) and the demo flag.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { RepoError, Scope, now } from './shared.ts';
import { LIMITS, objectsRemaining, storageAllows, storageLimitMessage, workspaceLimitMessage } from '../../../src/core/limits.ts';
import { LIBRARY, startTemplateFor } from '../../../src/core/specs.ts';
import type { Workspace } from '../../../src/types/index.ts';

/** fields of the removed subscription model that old rows, old backups or an old client may still carry (limits.test.ts allows them only here) */
const REMOVED_PLAN_FIELDS = ['planId', 'creditsRemaining'];

export const workspacesMethods = {
  listWorkspaces(this: Repo, userId: string): Workspace[] {
    return (this.db.prepare('SELECT data FROM workspaces WHERE user_id = ? ORDER BY created_at').all(userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  },

  getWorkspace(this: Repo, userId: string, id: string): Workspace | undefined {
    const r = this.db.prepare('SELECT data FROM workspaces WHERE user_id = ? AND id = ?').get(userId, id) as { data: string } | undefined;
    return r ? JSON.parse(r.data) : undefined;
  },

  /** Create or update the workspace row; a new workspace also gets the 5 system nodes. */
  saveWorkspace(this: Repo, userId: string, ws: Workspace, opts: { skipLimit?: boolean; demo?: boolean } = {}): Workspace {
    return this.db.transaction(() => {
      const exists = this.db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(ws.id);
      // `isDemo` is decided by the server only: a client can neither claim nor drop it
      const stored = exists ? this.getWorkspace(userId, ws.id) : undefined;
      ws = { ...ws, ...((opts.demo || stored?.isDemo) ? { isDemo: true } : { isDemo: undefined }) };
      // fields of the removed subscription model: never kept, whatever a client or an old backup sends
      for (const k of REMOVED_PLAN_FIELDS) delete (ws as unknown as Record<string, unknown>)[k];
      if (!ws.isDemo) delete ws.isDemo;
      // archived is decided by the server only (a client save must not un-archive, nor archive)
      if (stored?.archivedAt) ws.archivedAt = stored.archivedAt; else delete ws.archivedAt;
      // the purpose is set once, when the space is made (it chose the starting tree); later saves keep it
      const purpose = stored ? stored.purpose : ws.purpose;
      if (purpose === 'personal' || purpose === 'work' || purpose === 'project' || purpose === 'empty') ws.purpose = purpose; else delete ws.purpose;
      // only ids of the library survive, once, in library order
      if (ws.enabledSpecIds !== undefined) ws.enabledSpecIds = LIBRARY.map((x) => x.id).filter((id) => Array.isArray(ws.enabledSpecIds) && ws.enabledSpecIds.includes(id));
      if (!exists) {
        // the showcase workspace is not counted: it never uses up the workspace limit
        if (!opts.skipLimit && !ws.isDemo && this.listWorkspaces(userId).filter((w) => !w.isDemo && !w.archivedAt).length >= LIMITS.workspaces) throw new RepoError('forbidden', workspaceLimitMessage());
        this.db.prepare('INSERT INTO workspaces (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(ws.id, userId, ws.id, JSON.stringify(ws), ws.createdAt);
        this.seedStartNodes({ userId, workspaceId: ws.id }, startTemplateFor(ws.purpose));
      } else {
        const r = this.db.prepare('UPDATE workspaces SET data = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(ws), ws.id, userId);
        if (!r.changes) throw new RepoError('forbidden', 'این فضا مال شما نیست.');
      }
      return ws;
    })();
  },

  /**
   * Deletes EVERYTHING that belongs to one workspace (every table that carries `workspace_id`, plus the weekly-review marker) and
   * seeds the five system nodes again. Retired token records remain historical metadata, not content. Used by the
   * showcase workspace's reset, which therefore always rebuilds from nothing.
   */
  resetWorkspaceData(this: Repo, s: Scope) {
    this.assertWorkspace(s);
    this.db.transaction(() => {
      const tables = (this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((t) => t.name);
      for (const t of tables) {
        if (t === 'workspaces' || t === 'mcp_tokens' || t === 'schema_migrations' || t === 'templates') continue; // (a template belongs to the user, not to the workspace it was saved from)
        const cols = (this.db.prepare(`PRAGMA table_info(${JSON.stringify(t)})`).all() as Array<{ name: string }>).map((c) => c.name);
        if (cols.includes('workspace_id') && cols.includes('user_id')) this.db.prepare(`DELETE FROM ${JSON.stringify(t)} WHERE workspace_id = ? AND user_id = ?`).run(s.workspaceId, s.userId);
      }
      this.db.prepare('DELETE FROM kv WHERE user_id = ? AND key = ?').run(s.userId, `weekly_review:${s.workspaceId}`);
      this.seedStartNodes(s, startTemplateFor(this.getWorkspace(s.userId, s.workspaceId)?.purpose));
    })();
  },

  assertWorkspace(this: Repo, s: Scope) {
    if (!this.getWorkspace(s.userId, s.workspaceId)) throw new RepoError('not_found', 'فضا پیدا نشد.');
  },

  /** active Context objects (Archived and Superseded do not count against the limit) */
  countActiveObjects(this: Repo, s: Scope): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM context_objects WHERE workspace_id = ? AND user_id = ? AND (sample IS NULL OR sample = 0) AND status NOT IN ('Archived','Superseded')").get(s.workspaceId, s.userId) as { n: number }).n;
  },

  /** how many more objects the limit allows right now (bulk creators — files, notes — stop here instead of failing) */
  objectSlots(this: Repo, s: Scope): number { return this.isDemo(s) ? 1_000_000 : objectsRemaining(this.countActiveObjects(s)); },

  /** the showcase workspace (see Workspace.isDemo) */
  /** characters of text this person keeps in ALL their workspaces (every version of knowledge, notes, thoughts, outputs, text read
   *  from files): what LIMITS.storedTextPerPerson caps. A plain sum; ten people's rows read in a few milliseconds. */
  storedText(this: Repo, userId: string): number {
    const sum = (sql: string) => ((this.db.prepare(sql).get(userId) as { n: number | null }).n ?? 0);
    return sum('SELECT SUM(LENGTH(content) + LENGTH(title)) AS n FROM context_object_versions WHERE user_id = ?')
      + sum('SELECT SUM(LENGTH(content) + LENGTH(title)) AS n FROM context_objects WHERE user_id = ?')
      + sum('SELECT SUM(LENGTH(content)) AS n FROM notes WHERE user_id = ?')
      + sum('SELECT SUM(LENGTH(text)) AS n FROM thoughts WHERE user_id = ?')
      + sum('SELECT SUM(LENGTH(text)) AS n FROM file_chunks WHERE user_id = ?')
      + sum('SELECT SUM(LENGTH(raw_text)) AS n FROM files WHERE user_id = ?')
      + sum('SELECT SUM(LENGTH(data)) AS n FROM deliverables WHERE user_id = ?');
  },

  /** refuse a write that would take this person past the shared-disk cap (removing text is always allowed) */
  assertRoom(this: Repo, userId: string, added: number): void {
    if (added > 0 && !storageAllows(this.storedText(userId), added)) throw new RepoError('forbidden', storageLimitMessage());
  },

  isDemo(this: Repo, s: Scope): boolean { return !!this.getWorkspace(s.userId, s.workspaceId)?.isDemo; },
};
