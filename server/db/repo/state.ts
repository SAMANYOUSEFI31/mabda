/**
 * The whole-workspace state, the weekly-review marker and the one-time legacy import marker.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { Scope, now } from './shared.ts';

export const stateMethods = {
  state(this: Repo, s: Scope) {
    this.assertWorkspace(s);
    const objects = this.listObjects(s);
    const deliverables = this.listDeliverables(s);
    return {
      workspace: this.getWorkspace(s.userId, s.workspaceId)!,
      nodes: this.listNodes(s), objects, samples: this.listSampleObjects(s), relationships: this.listRelationships(s), notes: this.listNotes(s), thoughts: this.listThoughts(s, { includeResolved: true }),
      deliverables, ledger: this.listLedger(s), sessions: this.listSessions(s), specs: this.listSpecs(s), files: this.listFiles(s),
      stale: this.impactEnabled(s) ? this.computeStale(s, deliverables.filter((d) => !d.archivedAt)) : [],
      judgments: this.listJudgments(s),
      pairJudgments: this.listPairJudgments(s),
      changes: this.listChanges(s),
      metrics: this.listMetrics(s), measurements: this.listMeasurements(s),
      canvas: { decisions: this.listCanvasItems(s, 'decisions'), free: this.listCanvasItems(s, 'free') },
      weeklyReviewAt: this.weeklyReviewAt(s),
    };
  },

  /** when the weekly review («این هفته») was last finished (null = never) */
  weeklyReviewAt(this: Repo, s: Scope): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE user_id = ? AND key = ?').get(s.userId, `weekly_review:${s.workspaceId}`) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as { at: string }).at : null;
  },

  markWeeklyReview(this: Repo, s: Scope): string {
    const at = now();
    this.db.prepare('INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, ?, ?)').run(s.userId, `weekly_review:${s.workspaceId}`, JSON.stringify({ at }));
    return at;
  },

  isImported(this: Repo, userId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM kv WHERE user_id = ? AND key = 'legacy_import'").get(userId);
  },

  markImported(this: Repo, userId: string, source: string) {
    this.db.prepare("INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, 'legacy_import', ?)").run(userId, JSON.stringify({ source, at: now() }));
  },
};
