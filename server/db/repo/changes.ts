/**
 * The append-only Change log (what happened to knowledge; `reason` is for people only).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { ChangeMeta, Scope, newId, now } from './shared.ts';
import { actorOfSource } from '../../../src/core/changeLog.ts';
import type { ContextChange, ContextChangeActor, ContextChangeKind, ObjectSource } from '../../../src/types/index.ts';

export const changesMethods = {
  importChange(this: Repo, s: Scope, c: ContextChange) {
    this.db.prepare('INSERT OR REPLACE INTO context_changes (id,user_id,workspace_id,object_id,from_version,to_version,kind,actor,actor_label,reason,before,after,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(c.id, s.userId, s.workspaceId, c.objectId, c.fromVersion, c.toVersion, c.kind, c.actor, c.actorLabel ?? null, c.reason ?? null, c.before ? JSON.stringify(c.before) : null, c.after ? JSON.stringify(c.after) : null, c.at);
  },

  recordChange(this: Repo, s: Scope, c: { objectId: string; fromVersion: number; toVersion: number; kind: ContextChangeKind; meta?: ChangeMeta; before?: Record<string, unknown>; after?: Record<string, unknown>; source?: ObjectSource; at?: string }) {
    const inferred = actorOfSource(c.source);
    const actor = c.meta?.actor ?? inferred.actor;
    const label = c.meta?.label ?? (c.meta?.actor ? undefined : inferred.label);
    this.db.prepare('INSERT INTO context_changes (id,user_id,workspace_id,object_id,from_version,to_version,kind,actor,actor_label,reason,before,after,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(newId('chg'), s.userId, s.workspaceId, c.objectId, c.fromVersion, c.toVersion, c.kind, actor, label ?? null, c.meta?.reason?.trim() || null, c.before ? JSON.stringify(c.before) : null, c.after ? JSON.stringify(c.after) : null, c.at ?? now());
  },

  listChanges(this: Repo, s: Scope, f: { objectId?: string; since?: string; limit?: number; includeNodes?: boolean } = {}): ContextChange[] {
    const where = ['workspace_id = ?', 'user_id = ?']; const args: unknown[] = [s.workspaceId, s.userId];
    if (!f.includeNodes) where.push("object_id NOT LIKE 'node:%' AND object_id NOT LIKE 'metric:%'"); // records about a node or a metric (not a Context object) are read only on request
    if (f.objectId) { where.push('object_id = ?'); args.push(f.objectId); }
    if (f.since) { where.push('at >= ?'); args.push(f.since); }
    const rows = this.db.prepare(`SELECT * FROM context_changes WHERE ${where.join(' AND ')} ORDER BY at, rowid LIMIT ?`).all(...args, f.limit ?? 5000) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string, workspaceId: r.workspace_id as string, objectId: r.object_id as string, fromVersion: r.from_version as number, toVersion: r.to_version as number,
      kind: r.kind as ContextChangeKind, actor: r.actor as ContextChangeActor, ...(r.actor_label ? { actorLabel: r.actor_label as string } : {}), ...(r.reason ? { reason: r.reason as string } : {}),
      ...(r.before ? { before: JSON.parse(r.before as string) } : {}), ...(r.after ? { after: JSON.parse(r.after as string) } : {}), at: r.at as string,
    }));
  },
};
