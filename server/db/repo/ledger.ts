/**
 * The usage ledger.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { Scope } from './shared.ts';
import type { LedgerEntry, Workspace } from '../../../src/types/index.ts';

export const ledgerMethods = {
  listLedger(this: Repo, s: Scope): LedgerEntry[] {
    return (this.db.prepare('SELECT data FROM ledger WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<{ data: string }>).map((r) => JSON.parse(r.data));
  },

  addLedger(this: Repo, s: Scope, e: LedgerEntry): LedgerEntry {
    this.assertWorkspace(s);
    this.db.prepare('INSERT OR REPLACE INTO ledger (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(e.id, s.userId, s.workspaceId, JSON.stringify({ ...e, workspaceId: s.workspaceId }), e.timestamp);
    return e;
  },

  /** manager ledger input: every workspace (any user) with the ledger rows of one month */
  ledgerByWorkspaceForMonth(this: Repo, month: string): Array<{ userId: string; workspaceId: string; name: string; planId: Workspace['planId']; entries: LedgerEntry[] }> {
    const rows = this.db.prepare('SELECT user_id, id, data FROM workspaces ORDER BY user_id, created_at').all() as Array<{ user_id: string; id: string; data: string }>;
    return rows.filter((r) => !(JSON.parse(r.data) as Workspace).isDemo).map((r) => {
      const ws = JSON.parse(r.data) as Workspace;
      const entries = (this.db.prepare('SELECT data FROM ledger WHERE workspace_id = ? AND user_id = ? AND created_at LIKE ?').all(r.id, r.user_id, `${month}%`) as Array<{ data: string }>).map((x) => JSON.parse(x.data) as LedgerEntry);
      return { userId: r.user_id, workspaceId: r.id, name: ws.name, planId: ws.planId, entries };
    });
  },
};
