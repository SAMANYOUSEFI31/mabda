/**
 * Daily counters and feature usage counters (a key, a number, a time — never user data).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { RepoError, Scope, now } from './shared.ts';
import { isFeatureKey } from '../../../src/core/usage.ts';

export const usageMethods = {
  dailyUsage(this: Repo, s: Scope, day: string, kind: string): number {
    return (this.db.prepare('SELECT count FROM daily_usage WHERE workspace_id = ? AND day = ? AND kind = ? AND user_id = ?').get(s.workspaceId, day, kind, s.userId) as { count: number } | undefined)?.count ?? 0;
  },

  addDailyUsage(this: Repo, s: Scope, day: string, kind: string, n = 1): number {
    this.db.prepare('INSERT INTO daily_usage (user_id, workspace_id, day, kind, count) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id, day, kind) DO UPDATE SET count = count + excluded.count').run(s.userId, s.workspaceId, day, kind, n);
    return this.dailyUsage(s, day, kind);
  },

  bumpUsage(this: Repo, userId: string, feature: unknown): void {
    if (!isFeatureKey(feature)) throw new RepoError('invalid', 'امکان ناشناخته.');
    const t = now();
    this.db.prepare('INSERT INTO usage_events (user_id, feature, count, last_at) VALUES (?,?,1,?) ON CONFLICT(user_id, feature) DO UPDATE SET count = count + 1, last_at = excluded.last_at').run(userId, feature, t);
  },

  listUsage(this: Repo, userId: string): Array<{ feature: string; count: number; lastAt: string }> {
    return (this.db.prepare('SELECT feature, count, last_at FROM usage_events WHERE user_id = ? ORDER BY count DESC, feature').all(userId) as Array<Record<string, unknown>>).map((r) => ({ feature: r.feature as string, count: r.count as number, lastAt: r.last_at as string }));
  },
};
