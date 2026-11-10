/**
 * The showcase workspace (one click builds it, the same click resets it), the workspace list and the whole-workspace state.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import type { Workspace } from '../../../src/types/index.ts';
import { DEMO_WORKSPACE_ID, applyDemo } from '../demo.ts';
import { RepoError } from '../repo.ts';

export function registerDemoRoutes(ctx: RouteContext): void {
  const { repo, clock, router, scopeOf, body, wrap, LOCAL_USER } = ctx;
  router.post('/demo/reset', wrap((_req, res) => {
    applyDemo(repo, LOCAL_USER, clock());
    res.json({ workspaces: repo.listWorkspaces(LOCAL_USER), workspaceId: DEMO_WORKSPACE_ID });
  }));

  router.get('/workspaces', wrap((_req, res) => { res.json({ workspaces: repo.listWorkspaces(LOCAL_USER) }); }));
  router.put('/workspaces/:wid', wrap((req, res) => {
    const ws = body(req) as Workspace;
    if (ws.id !== req.params.wid) throw new RepoError('invalid', 'شناسهٔ فضای کاری نامطابق است.');
    res.json(repo.saveWorkspace(LOCAL_USER, ws));
  }));

  router.get('/workspaces/:wid/state', wrap((req, res) => { res.json(repo.state(scopeOf(req))); }));
}
