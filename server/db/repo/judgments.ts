/**
 * Decision-layer judgments and the semantic-contradiction judgments (one per exact pair).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { Scope, now } from './shared.ts';
import { pairKey } from '../../../src/core/contradictionCandidates.ts';
import type { PairJudgment } from '../../../src/core/contradictionCandidates.ts';
import type { ContextObject } from '../../../src/types/index.ts';

export const judgmentsMethods = {
  /** latest judgment per object, valid only for the version it was made on */
  listJudgments(this: Repo, s: Scope): Record<string, { version: number; ambiguous: boolean; reason: string }> {
    const out: Record<string, { version: number; ambiguous: boolean; reason: string }> = {};
    const rows = this.db.prepare("SELECT object_id, version, ambiguous, reason FROM context_judgments WHERE workspace_id = ? AND user_id = ? AND kind = 'ambiguity' ORDER BY version").all(s.workspaceId, s.userId) as Array<Record<string, unknown>>;
    for (const r of rows) out[r.object_id as string] = { version: r.version as number, ambiguous: !!r.ambiguous, reason: r.reason as string };
    return out;
  },

  saveJudgment(this: Repo, s: Scope, objectId: string, version: number, j: { ambiguous: boolean; reason: string }) {
    this.db.prepare("INSERT OR REPLACE INTO context_judgments (object_id, version, kind, user_id, workspace_id, ambiguous, reason, created_at) VALUES (?,?,'ambiguity',?,?,?,?,?)")
      .run(objectId, version, s.userId, s.workspaceId, j.ambiguous ? 1 : 0, j.reason, now());
  },

  listPairJudgments(this: Repo, s: Scope): PairJudgment[] {
    return (this.db.prepare('SELECT * FROM contradiction_judgments WHERE workspace_id = ? AND user_id = ?').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ key: r.pair_key as string, aVersion: r.a_version as number, bVersion: r.b_version as number, conflict: !!r.conflict, reason: r.reason as string, resolution: (r.resolution as string | null) ?? null }));
  },

  /** `a` and `b` are stored in key order (smaller id first) so versions line up with core's isFresh */
  savePairJudgment(this: Repo, s: Scope, a: ContextObject, b: ContextObject, j: { conflict: boolean; reason: string; resolution?: string }) {
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    this.db.prepare('INSERT OR REPLACE INTO contradiction_judgments (user_id, workspace_id, pair_key, a_id, a_version, b_id, b_version, conflict, reason, resolution, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(s.userId, s.workspaceId, pairKey(a.id, b.id), lo.id, lo.version, hi.id, hi.version, j.conflict ? 1 : 0, j.reason, j.resolution ?? null, now());
  },
};
