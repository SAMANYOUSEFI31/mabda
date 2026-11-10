/**
 * Assets (deliverables), the ledger, saved chats and specs.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { ChatSession, GeneratedDeliverable, LedgerEntry, WorkstreamSpec } from '../../../src/types/index.ts';
import type { RouteContext } from './context.ts';
import { PLANS } from '../../../src/core/creditEngine.ts';
import { RepoError } from '../repo.ts';
import { validateSpec } from '../../../src/core/specGraph.ts';

export function registerOutputsRoutes(ctx: RouteContext): void {
  const { repo, router, scopeOf, body, wrap, LOCAL_USER, stale } = ctx;
  router.put('/workspaces/:wid/deliverables/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const d = body(req) as GeneratedDeliverable;
    if (d.id !== req.params.id) throw new RepoError('invalid', 'شناسهٔ دارایی نامطابق است.');
    if (!Array.isArray(d.usedContext)) throw new RepoError('invalid', 'usedContext (شناسه و نسخهٔ Contextهای استفاده‌شده) لازم است.');
    res.json({ deliverable: repo.saveDeliverable(s, d), stale: stale(s) });
  }));
  router.post('/workspaces/:wid/ledger', wrap((req, res) => { res.json({ entry: repo.addLedger(scopeOf(req), body(req) as LedgerEntry) }); }));
  router.put('/workspaces/:wid/sessions/:id', wrap((req, res) => { res.json({ session: repo.saveSession(scopeOf(req), body(req) as ChatSession) }); }));
  router.delete('/workspaces/:wid/sessions/:id', wrap((req, res) => { repo.deleteSession(scopeOf(req), req.params.id); res.json({ ok: true }); }));
  router.put('/workspaces/:wid/specs/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    if (!PLANS[ws.planId]?.customSpecs) throw new RepoError('forbidden', 'ساخت و ویرایش جریان کار سفارشی از پلن Pro به بالا فعال است.');
    const spec = body(req) as WorkstreamSpec;
    if (spec.id !== req.params.id) throw new RepoError('invalid', 'شناسهٔ spec نامطابق است.');
    const issues = validateSpec(spec);
    if (issues.length) throw new RepoError('invalid', issues.map((i) => i.message).join(' '));
    res.json({ spec: repo.saveSpec(s, spec) });
  }));
}
