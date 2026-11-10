/**
 * Knowledge objects: create, edit, drafts, supersede, status; the weekly review marker.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';

export function registerObjectsRoutes(ctx: RouteContext): void {
  const { repo, router, scopeOf, body, metaOf, wrap, stale } = ctx;
  router.post('/workspaces/:wid/objects', wrap((req, res) => {
    const s = scopeOf(req);
    const { change: _c, reason: _r, ...input } = body(req);
    const object = repo.createObject(s, input as never, metaOf(body(req)));
    res.json({ object, thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  router.patch('/workspaces/:wid/objects/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const { change: _c, reason: _r, ...patch } = body(req);
    const r = repo.updateObject(s, req.params.id, patch, metaOf(body(req)));
    res.json({ ...r, stale: stale(s) });
  }));
  /** an unapproved edit of confirmed knowledge: approve (it replaces the text) or reject (it is thrown away) */
  router.post('/workspaces/:wid/objects/:id/draft/approve', wrap((req, res) => {
    const s = scopeOf(req);
    const r = repo.approveDraft(s, req.params.id, metaOf(body(req)));
    res.json({ ...r, stale: stale(s) });
  }));
  router.delete('/workspaces/:wid/objects/:id/draft', wrap((req, res) => { const s = scopeOf(req); res.json({ object: repo.rejectDraft(s, req.params.id) }); }));
  router.post('/workspaces/:wid/objects/:id/supersede', wrap((req, res) => {
    const s = scopeOf(req);
    const { change: _c, reason: _r, ...input } = body(req);
    const r = repo.supersedeObject(s, req.params.id, input as never, metaOf(body(req)));
    res.json({ ...r, relationships: repo.listRelationships(s), stale: stale(s) });
  }));
  router.get('/workspaces/:wid/changes/log', wrap((req, res) => {
    const since = typeof req.query.since === 'string' && !Number.isNaN(Date.parse(req.query.since)) ? new Date(req.query.since).toISOString() : undefined;
    res.json({ changes: repo.listChanges(scopeOf(req), { objectId: typeof req.query.objectId === 'string' ? req.query.objectId : undefined, since }) });
  }));
  router.post('/workspaces/:wid/weekly-review/done', wrap((req, res) => { res.json({ weeklyReviewAt: repo.markWeeklyReview(scopeOf(req)) }); }));
}
