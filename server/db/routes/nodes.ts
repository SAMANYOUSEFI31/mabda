/**
 * The tree of sections: create, rename, move, the removal plan and delete, the recent removals and «برگرداندن».
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { can } from '../../../src/core/entitlements.ts';
import { planNodeRemoval, removeNode, undoRemoval } from '../removal.ts';

export function registerNodesRoutes(ctx: RouteContext): void {
  const { repo, files, router, scopeOf, body, wrap, stale } = ctx;
  router.post('/workspaces/:wid/nodes', wrap((req, res) => { res.json({ node: repo.createNode(scopeOf(req), body(req) as never), nodes: repo.listNodes(scopeOf(req)) }); }));
  router.patch('/workspaces/:wid/nodes/:id', wrap((req, res) => { const s = scopeOf(req); repo.updateNode(s, req.params.id, body(req)); res.json({ nodes: repo.listNodes(s) }); }));
  router.post('/workspaces/:wid/nodes/:id/move', wrap((req, res) => { res.json({ nodes: repo.moveNode(scopeOf(req), req.params.id, typeof body(req).parentId === 'string' ? String(body(req).parentId) : '', typeof body(req).index === 'number' ? body(req).index as number : undefined, typeof body(req).reason === 'string' ? String(body(req).reason) : undefined) }); }));
  // a node delete is planned (the plan is the dialog's preview), done in one transaction and recorded so it can be undone
  const modeOf = (v: unknown): 'move' | 'archive' => (v === 'archive' ? 'archive' : 'move');
  router.get('/workspaces/:wid/nodes/:id/removal-plan', wrap((req, res) => {
    res.json({ plan: planNodeRemoval(repo, scopeOf(req), req.params.id, { mode: modeOf(req.query.mode), transferTo: typeof req.query.transferTo === 'string' && req.query.transferTo ? req.query.transferTo : undefined }) });
  }));
  router.delete('/workspaces/:wid/nodes/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const r = removeNode(repo, s, req.params.id, { mode: modeOf(req.query.mode), transferTo: typeof req.query.transferTo === 'string' && req.query.transferTo ? req.query.transferTo : undefined });
    res.json({ nodes: r.nodes, removal: r.removal, objects: repo.listObjects(s), notes: repo.listNotes(s), thoughts: repo.listThoughts(s, { includeResolved: true }), files: repo.listFiles(s), stale: stale(s) });
  }));
  router.post('/workspaces/:wid/removals/:id/undo', wrap((req, res) => {
    const s = scopeOf(req);
    const r = undoRemoval(repo, s, req.params.id);
    res.json({ nodes: r.nodes, objects: repo.listObjects(s), notes: repo.listNotes(s), thoughts: repo.listThoughts(s, { includeResolved: true }), files: repo.listFiles(s), samples: repo.listSampleObjects(s), changes: repo.listChanges(s), stale: stale(s) });
  }));
}
