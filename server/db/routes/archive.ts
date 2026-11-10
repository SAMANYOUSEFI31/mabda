/**
 * The archive: knowledge that is out of the way, outputs, recent removals; restore, permanent delete.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { RepoError } from '../repo.ts';
import { archiveDeliverable, archivedObjects, deleteDeliverable, listRemovals, purgeImpact, purgeObject, restoreDeliverable, restoreObject } from '../removal.ts';

export function registerArchiveRoutes(ctx: RouteContext): void {
  const { repo, router, scopeOf, body, wrap, stale } = ctx;
  router.get('/workspaces/:wid/archive', wrap((req, res) => { const s = scopeOf(req); res.json({ objects: archivedObjects(repo, s), removals: listRemovals(repo, s), deliverables: repo.listDeliverables(s).filter((d) => d.archivedAt) }); }));
  router.post('/workspaces/:wid/objects/:id/restore', wrap((req, res) => { const s = scopeOf(req); const r = restoreObject(repo, s, req.params.id, typeof body(req).nodeId === 'string' ? body(req).nodeId : undefined); res.json({ object: r.object, impact: r.impact, stale: stale(s) }); }));
  router.get('/workspaces/:wid/objects/:id/purge-impact', wrap((req, res) => { res.json({ impact: purgeImpact(repo, scopeOf(req), req.params.id) }); }));
  router.delete('/workspaces/:wid/objects/:id/permanent', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    if (b.confirm !== true) throw new RepoError('invalid', 'حذف دائمی باید صریحاً تأیید شود.');
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : []);
    const r = purgeObject(repo, s, req.params.id, { notes: ids(b.copies?.notes), thoughts: ids(b.copies?.thoughts), sessions: ids(b.copies?.sessions), deliverables: ids(b.copies?.deliverables) });
    res.json({ ...r, objects: repo.listObjects(s), notes: repo.listNotes(s), thoughts: repo.listThoughts(s, { includeResolved: true }), sessions: repo.listSessions(s), deliverables: repo.listDeliverables(s), relationships: repo.listRelationships(s), changes: repo.listChanges(s), stale: stale(s) });
  }));
  router.post('/workspaces/:wid/deliverables/:id/archive', wrap((req, res) => { const s = scopeOf(req); archiveDeliverable(repo, s, req.params.id); res.json({ deliverables: repo.listDeliverables(s), stale: stale(s) }); }));
  router.post('/workspaces/:wid/deliverables/:id/restore', wrap((req, res) => { const s = scopeOf(req); restoreDeliverable(repo, s, req.params.id); res.json({ deliverables: repo.listDeliverables(s), stale: stale(s) }); }));
  router.delete('/workspaces/:wid/deliverables/:id', wrap((req, res) => { const s = scopeOf(req); deleteDeliverable(repo, s, req.params.id); res.json({ deliverables: repo.listDeliverables(s), stale: stale(s) }); }));
}
