/**
 * depends_on, overrides and the other relations between knowledge objects.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { ChangeMeta, RepoError, Scope, newId, now } from './shared.ts';
import { overrideProblem } from '../../../src/core/effectiveContext.ts';
import type { ContextChange, ContextRelationship } from '../../../src/types/index.ts';

export const relationsMethods = {
  importRelationship(this: Repo, s: Scope, r: ContextRelationship) {
    this.db.prepare('INSERT OR IGNORE INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(r.id, s.userId, s.workspaceId, r.sourceId, r.targetId, r.type, r.createdAt);
  },

  dependenciesOf(this: Repo, s: Scope, objectId: string): string[] {
    return this.listRelationships(s).filter((r) => r.type === 'depends_on' && r.sourceId === objectId).map((r) => r.targetId);
  },

  /** Replaces the set of objects `objectId` depends on. Cycles are allowed (a «concurrent decision»); a self-dependency is not. */
  setDependencies(this: Repo, s: Scope, objectId: string, dependsOn: string[], meta?: ChangeMeta): { relationships: ContextRelationship[]; change?: ContextChange } {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    const want = [...new Set(dependsOn)].sort();
    if (want.length > 20) throw new RepoError('invalid', 'یک مورد حداکثر به ۲۰ مورد دیگر وابسته می‌شود.');
    for (const id of want) {
      if (id === objectId) throw new RepoError('invalid', 'یک مورد نمی‌تواند به خودش وابسته باشد.');
      const t = this.getObject(s, id);
      if (!t) throw new RepoError('not_found', 'یکی از مورد‌های وابستگی پیدا نشد.');
      if (t.status === 'Superseded' || t.status === 'Archived') throw new RepoError('invalid', 'به مورد جایگزین‌شده یا بایگانی‌شده نمی‌شود وابسته شد.');
    }
    const have = this.dependenciesOf(s, objectId).sort();
    if (have.join('|') === want.join('|')) return { relationships: this.listRelationships(s) };
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM context_relationships WHERE workspace_id = ? AND user_id = ? AND type = 'depends_on' AND source_id = ?").run(s.workspaceId, s.userId, objectId);
      const t = now();
      for (const id of want) this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, objectId, id, 'depends_on', t);
      this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'edited', meta, before: { dependsOn: have }, after: { dependsOn: want } });
    })();
    const all = this.listChanges(s, { objectId });
    return { relationships: this.listRelationships(s), change: all[all.length - 1] };
  },

  overridesOf(this: Repo, s: Scope, objectId: string): string[] {
    return this.listRelationships(s).filter((r) => r.type === 'overrides' && r.sourceId === objectId).map((r) => r.targetId);
  },

  /** `byId` (in a descendant node) overrides `targetId` (in an ancestor node). The reason is required and lives in the Change. */
  setOverride(this: Repo, s: Scope, byId: string, targetId: string, meta?: ChangeMeta): { relationships: ContextRelationship[]; change?: ContextChange } {
    const by = this.getObject(s, byId), target = this.getObject(s, targetId);
    const problem = overrideProblem(by, target, this.listNodes(s));
    if (problem) throw new RepoError('invalid', problem);
    if (by!.status === 'Superseded' || by!.status === 'Archived' || target!.status === 'Superseded' || target!.status === 'Archived') throw new RepoError('invalid', 'مورد جایگزین‌شده یا بایگانی‌شده را نمی‌شود کنار گذاشت یا جایگزین کرد.');
    if (!meta?.reason?.trim()) throw new RepoError('invalid', 'برای کنار گذاشتن یک خط قرمز یا تصمیم، دلیل لازم است.');
    const have = this.overridesOf(s, byId).sort();
    if (have.includes(targetId)) return { relationships: this.listRelationships(s) };
    const want = [...have, targetId].sort();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, byId, targetId, 'overrides', now());
      this.recordChange(s, { objectId: byId, fromVersion: by!.version, toVersion: by!.version, kind: 'edited', meta, before: { overrides: have }, after: { overrides: want } });
    })();
    const all = this.listChanges(s, { objectId: byId });
    return { relationships: this.listRelationships(s), change: all[all.length - 1] };
  },

  removeOverride(this: Repo, s: Scope, byId: string, targetId: string, meta?: ChangeMeta): { relationships: ContextRelationship[] } {
    const by = this.getObject(s, byId);
    if (!by) throw new RepoError('not_found', 'Context پیدا نشد.');
    const have = this.overridesOf(s, byId).sort();
    if (!have.includes(targetId)) return { relationships: this.listRelationships(s) };
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM context_relationships WHERE workspace_id = ? AND user_id = ? AND type = 'overrides' AND source_id = ? AND target_id = ?").run(s.workspaceId, s.userId, byId, targetId);
      this.recordChange(s, { objectId: byId, fromVersion: by.version, toVersion: by.version, kind: 'edited', meta, before: { overrides: have }, after: { overrides: have.filter((x) => x !== targetId) } });
    })();
    return { relationships: this.listRelationships(s) };
  },

  /** when an object is replaced, whatever rested on it (and whatever it rested on) now points at the replacement too; old edges stay as history */
  carryDependencies(this: Repo, s: Scope, fromId: string, toId: string) {
    const t = now();
    const rels = this.listRelationships(s).filter((r) => r.type === 'depends_on');
    const has = new Set(rels.map((r) => `${r.sourceId}>${r.targetId}`));
    const add = (a: string, b: string) => {
      if (a === b || has.has(`${a}>${b}`)) return;
      has.add(`${a}>${b}`);
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, a, b, 'depends_on', t);
    };
    for (const r of rels) {
      if (r.targetId === fromId) add(r.sourceId, toId);
      if (r.sourceId === fromId) add(toId, r.targetId);
    }
  },

  listRelationships(this: Repo, s: Scope): ContextRelationship[] {
    return (this.db.prepare('SELECT * FROM context_relationships WHERE workspace_id = ? AND user_id = ? ORDER BY created_at').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ id: r.id as string, sourceId: r.source_id as string, targetId: r.target_id as string, type: r.type as ContextRelationship['type'], createdAt: r.created_at as string }));
  },
};
