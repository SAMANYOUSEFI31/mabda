/**
 * The showcase workspace (one click builds it, the same click resets it), the workspace list and the whole-workspace state.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import type { Workspace } from '../../../src/types/index.ts';
import { applyDemo } from '../demo.ts';
import { RepoError } from '../repo.ts';

export function registerDemoRoutes(ctx: RouteContext): void {
  const { repo, clock, router, scopeOf, body, wrap, userOf } = ctx;
  router.post('/demo/reset', wrap((req, res) => {
    const demo = applyDemo(repo, userOf(req), clock());
    res.json({ workspaces: repo.listWorkspaces(userOf(req)), workspaceId: demo.id });
  }));

  router.get('/workspaces', wrap((req, res) => { res.json({ workspaces: repo.listWorkspaces(userOf(req)) }); }));
  router.put('/workspaces/:wid', wrap((req, res) => {
    const ws = body(req) as Workspace;
    if (ws.id !== req.params.wid) throw new RepoError('invalid', 'شناسهٔ فضا نامطابق است.');
    res.json(repo.saveWorkspace(userOf(req), ws));
  }));

  router.get('/workspaces/:wid/state', wrap((req, res) => { res.json(repo.state(scopeOf(req))); }));
}
