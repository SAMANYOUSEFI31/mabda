/**
 * Usage meters and the manager ledger / cost report.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { RepoError } from '../repo.ts';
import { costReport } from '../../../src/core/costReport.ts';

export function registerUsageRoutes(ctx: RouteContext): void {
  const { repo, clock, router, scopeOf, body, wrap, deps, LOCAL_USER, today } = ctx;
  router.get('/workspaces/:wid/usage', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    const month = clock().toISOString().slice(0, 7);
    res.json({
      planId: ws.planId, month,
      objects: repo.countActiveObjects(s), fileTokens: repo.fileUsage(s, month),
      judgmentsToday: repo.dailyUsage(s, today(), 'judge'), coachToday: repo.dailyUsage(s, today(), 'coach'),
    });
  }));

  // usage counters: any client may add one (a catalog key only); only an admin may read them
  router.post('/usage', wrap((req, res) => { repo.bumpUsage(LOCAL_USER, body(req).feature); res.json({ ok: true }); }));
  router.get('/admin/usage', wrap((_req, res) => {
    if (!deps.admin) throw new RepoError('not_found', 'نمای مدیر فعال نیست (MABDA_ADMIN).');
    res.json({ rows: repo.listUsage(LOCAL_USER) });
  }));
  router.get('/admin/cost-report', wrap((req, res) => {
    if (!deps.admin) throw new RepoError('not_found', 'نمای مدیر فعال نیست (MABDA_ADMIN).');
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : clock().toISOString().slice(0, 7);
    const rows = repo.ledgerByWorkspaceForMonth(month).map((w) => ({ userId: w.userId, workspaceId: w.workspaceId, name: w.name, ...costReport(w.planId, w.entries) }));
    res.json({ month, rows });
  }));
}
