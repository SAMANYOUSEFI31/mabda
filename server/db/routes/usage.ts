/**
 * Usage meters and the manager ledger / cost report.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { RepoError } from '../repo.ts';
import { costReport } from '../../../src/core/costReport.ts';

export function registerUsageRoutes(ctx: RouteContext): void {
  const { repo, clock, router, scopeOf, body, wrap, deps, userOf, today } = ctx;
  router.get('/workspaces/:wid/usage', wrap((req, res) => {
    const s = scopeOf(req);
    const month = clock().toISOString().slice(0, 7);
    res.json({
      month,
      objects: repo.countActiveObjects(s), fileTokens: repo.fileUsage(s, month),
      judgmentsToday: repo.dailyUsage(s, today(), 'judge'), coachToday: repo.dailyUsage(s, today(), 'coach'),
    });
  }));

  // usage counters: any client may add one (a catalog key only); only an admin may read them
  router.post('/usage', wrap((req, res) => { repo.bumpUsage(userOf(req), body(req).feature); res.json({ ok: true }); }));
  // the manager views: the operator flag AND the owner (or the one local user); the cost report reads every person's rows
  const adminOf = (req: { mabdaUser?: { role: string } }) => !!deps.admin && (req.mabdaUser?.role === 'owner' || req.mabdaUser?.role === 'local');
  router.get('/admin/usage', wrap((req, res) => {
    if (!adminOf(req)) throw new RepoError('not_found', 'نمای مدیر فعال نیست (MABDA_ADMIN).');
    res.json({ rows: repo.listUsage(userOf(req)) });
  }));
  router.get('/admin/cost-report', wrap((req, res) => {
    if (!adminOf(req)) throw new RepoError('not_found', 'نمای مدیر فعال نیست (MABDA_ADMIN).');
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : clock().toISOString().slice(0, 7);
    const rows = repo.ledgerByWorkspaceForMonth(month).map((w) => ({ userId: w.userId, workspaceId: w.workspaceId, name: w.name, ...costReport(w.entries) }));
    res.json({ month, rows });
  }));
}
