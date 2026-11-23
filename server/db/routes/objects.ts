/**
 * Knowledge objects: create, edit, drafts, supersede, status; the weekly review marker.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { CHANGED_ELSEWHERE, RepoError } from '../repo.ts';

export function registerObjectsRoutes(ctx: RouteContext): void {
  const { repo, router, scopeOf, body, metaOf, wrap, stale } = ctx;
  /** optimistic check (phone + laptop, two tabs): a write made from a copy older than what is stored is refused with 409, never
   *  applied over the newer text. Every write that replaces an item's text asks it: edit, approving a draft, replacing. */
  const expectFresh = (s: ReturnType<typeof scopeOf>, id: string, expected: unknown) => {
    if (typeof expected !== 'string') return;
    const cur = repo.getObjectAny(s, id);
    if (cur && cur.updatedAt !== expected) throw new RepoError('conflict', CHANGED_ELSEWHERE);
  };
  router.post('/workspaces/:wid/objects', wrap((req, res) => {
    const s = scopeOf(req);
    // the server names a new row and its origin's «Sample»: a client's `id` is never used, and it cannot claim to be an example
    const { change: _c, reason: _r, id: _id, ...input } = body(req);
    const object = repo.createObject(s, input as never, metaOf(body(req)));
    res.json({ object, thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  router.patch('/workspaces/:wid/objects/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const { change: _c, reason: _r, expectedUpdatedAt, ...patch } = body(req);
    expectFresh(s, req.params.id, expectedUpdatedAt);
    const r = repo.updateObject(s, req.params.id, patch, metaOf(body(req)));
    res.json({ ...r, stale: stale(s) });
  }));
  /** an unapproved edit of confirmed knowledge: approve (it replaces the text) or reject (it is thrown away) */
  router.post('/workspaces/:wid/objects/:id/draft/approve', wrap((req, res) => {
    const s = scopeOf(req);
    // the draft she approves is the one she saw: another tab that saved a newer draft (or wrote the text) since makes this a 409
    expectFresh(s, req.params.id, body(req).expectedUpdatedAt);
    const r = repo.approveDraft(s, req.params.id, metaOf(body(req)));
    res.json({ ...r, stale: stale(s) });
  }));
  // rejecting a draft throws it away: only the draft she saw (another tab that saved a newer one since makes this a 409)
  router.delete('/workspaces/:wid/objects/:id/draft', wrap((req, res) => { const s = scopeOf(req); expectFresh(s, req.params.id, body(req).expectedUpdatedAt); res.json({ object: repo.rejectDraft(s, req.params.id) }); }));
  router.post('/workspaces/:wid/objects/:id/supersede', wrap((req, res) => {
    const s = scopeOf(req);
    const { change: _c, reason: _r, expectedUpdatedAt, ...input } = body(req);
    expectFresh(s, req.params.id, expectedUpdatedAt);
    const r = repo.supersedeObject(s, req.params.id, input as never, metaOf(body(req)));
    res.json({ ...r, relationships: repo.listRelationships(s), stale: stale(s) });
  }));
  router.get('/workspaces/:wid/changes/log', wrap((req, res) => {
    const since = typeof req.query.since === 'string' && !Number.isNaN(Date.parse(req.query.since)) ? new Date(req.query.since).toISOString() : undefined;
    res.json({ changes: repo.listChanges(scopeOf(req), { objectId: typeof req.query.objectId === 'string' ? req.query.objectId : undefined, since }) });
  }));
  router.post('/workspaces/:wid/weekly-review/done', wrap((req, res) => { res.json({ weeklyReviewAt: repo.markWeeklyReview(scopeOf(req)) }); }));
}
