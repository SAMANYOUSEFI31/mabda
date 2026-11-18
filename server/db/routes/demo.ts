/**
 * The showcase workspace (one click builds it, the same click resets it), the workspace list and the whole-workspace state.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import type { Workspace } from '../../../src/types/index.ts';
import { applyDemo } from '../demo.ts';
import { applyLifeSample } from '../lifeSample/index.ts';
import { RepoError } from '../repo.ts';

export function registerDemoRoutes(ctx: RouteContext): void {
  const { repo, clock, router, scopeOf, body, wrap, userOf } = ctx;
  router.post('/demo/reset', wrap((req, res) => {
    const demo = applyDemo(repo, userOf(req), clock());
    res.json({ workspaces: repo.listWorkspaces(userOf(req)), workspaceId: demo.id });
  }));

  // the long-use sample «زندگی من»: eight weeks of one person's use, told through these same routes (docs/life-sample.md); replaces that space
  router.post('/demo/life/reset', wrap(async (req, res) => {
    // a bulk rebuild: the owner (or the one local person) only, and only when the host has switched it on
    const role = req.mabdaUser?.role;
    if (role !== 'owner' && role !== 'local') throw new RepoError('forbidden', 'ساختن نمونهٔ کامل فقط برای صاحب محصول است.');
    if (process.env.NODE_ENV === 'production' && !/^(1|on|true|yes)$/i.test(process.env.MABDA_ALLOW_SAMPLES ?? '')) throw new RepoError('forbidden', 'ساختن نمونهٔ کامل روی این سرور خاموش است (MABDA_ALLOW_SAMPLES).');
    const ws = await applyLifeSample(repo, userOf(req), clock());
    res.json({ workspaces: repo.listWorkspaces(userOf(req)), workspaceId: ws.id });
  }));

  router.get('/workspaces', wrap((req, res) => { res.json({ workspaces: repo.listWorkspaces(userOf(req)) }); }));
  router.put('/workspaces/:wid', wrap((req, res) => {
    const ws = body(req) as Workspace;
    if (ws.id !== req.params.wid) throw new RepoError('invalid', 'شناسهٔ فضا نامطابق است.');
    res.json(repo.saveWorkspace(userOf(req), ws));
  }));

  router.get('/workspaces/:wid/state', wrap((req, res) => { res.json(repo.state(scopeOf(req))); }));
}
