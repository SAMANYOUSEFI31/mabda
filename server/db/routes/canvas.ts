/**
 * The canvas («بوم») and the relations between objects (dependencies, overrides), versions. Kept in the original registration order.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { Lane } from '../../../src/core/canvasModel.ts';
import type { RouteContext } from './context.ts';
import type { Scope } from '../repo.ts';
import { RepoError } from '../repo.ts';
import { buildCanvasModel, moveEffect, rankBetween } from '../../../src/core/canvasModel.ts';
import { needsReview } from '../../../src/core/decisionGraph.ts';

export function registerCanvasRoutes(ctx: RouteContext): void {
  const { repo, router, scopeOf, body, metaOf, wrap, stale } = ctx;
  const LANES: Lane[] = ['thinking', 'confirmed'];
  const canvasBundle = (s: Scope) => ({
    objects: repo.listObjects(s), relationships: repo.listRelationships(s), changes: repo.listChanges(s), notes: repo.listNotes(s), stale: stale(s),
    thoughts: repo.listThoughts(s, { includeResolved: true }),
    canvas: { decisions: repo.listCanvasItems(s, 'decisions'), free: repo.listCanvasItems(s, 'free') },
  });
  const reviewIdsOf = (s: Scope) => new Set(needsReview(repo.listObjects(s), repo.listRelationships(s), repo.listChanges(s)).keys());

  router.post('/workspaces/:wid/canvas/decisions/move', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const obj = repo.getObject(s, String(b.objectId ?? ''));
    if (!obj) throw new RepoError('not_found', 'Context پیدا نشد.');
    const lane = String(b.lane) as Lane;
    if (!LANES.includes(lane)) throw new RepoError('invalid', 'ستون نامعتبر است.');
    const toNode = typeof b.nodeId === 'string' && b.nodeId ? b.nodeId : obj.nodeId;
    const eff = moveEffect(obj, reviewIdsOf(s), lane, toNode);
    if (eff.needsConfirm && b.confirmBackward !== true) throw new RepoError('forbidden', 'برگرداندن یک مورد تأییدشده باید صریحاً تأیید شود.');
    const meta = metaOf(b);
    if (eff.kind === 'accept_review') {
      repo.acceptReview(s, obj.id, meta);
      if (eff.nodeChanged) repo.updateObject(s, obj.id, { nodeId: toNode }, meta);
    } else if (eff.status || eff.nodeChanged) {
      repo.updateObject(s, obj.id, { ...(eff.status ? { status: eff.status } : {}), ...(eff.nodeChanged ? { nodeId: toNode } : {}) }, meta);
    }
    // rank: between the card above and the card below the drop point (both given by the client), in the NEW cell
    const ranks = new Map(repo.listCanvasItems(s, 'decisions').filter((i) => i.rank !== undefined).map((i) => [i.itemRef.slice(4), i.rank!]));
    const model = buildCanvasModel({ nodes: repo.listNodes(s), objects: repo.listObjects(s), reviewIds: reviewIdsOf(s), ranks });
    const rankOf = (id: unknown) => (typeof id === 'string' ? model.cards.find((c) => c.objectId === id)?.rank : undefined);
    const prev = rankOf(b.beforeId), next = rankOf(b.afterId);
    if (prev !== undefined || next !== undefined || eff.kind === 'accept' || eff.kind === 'accept_review' || eff.status) {
      const rank = rankBetween(prev, next);
      if (rank !== ranks.get(obj.id)) repo.setRank(s, obj.id, rank, lane, meta);
    }
    res.json(canvasBundle(s));
  }));
  router.post('/workspaces/:wid/canvas/decisions/reset', wrap((req, res) => { const s = scopeOf(req); repo.clearCanvas(s, 'decisions'); res.json(canvasBundle(s)); }));

  /** a line between two cards = a typed Relation; only the types docs/spine.md allows by hand */
  router.post('/workspaces/:wid/canvas/connect', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const from = String(b.fromId ?? ''), to = String(b.toId ?? '');
    if (from === to) throw new RepoError('invalid', 'یک مورد را نمی‌شود به خودش وصل کرد.');
    if (b.type === 'depends_on') {
      repo.setDependencies(s, from, [...repo.dependenciesOf(s, from), to], metaOf(b));
    } else if (b.type === 'supersedes') {
      if (b.confirmed !== true) throw new RepoError('forbidden', 'جایگزین‌کردن یک مورد باید صریحاً تأیید شود.');
      repo.supersedeBy(s, to, from, metaOf(b, { kind: 'superseded' }));
    } else throw new RepoError('invalid', 'نوع اتصال مجاز نیست.');
    res.json(canvasBundle(s));
  }));

  // free-thinking zone: Notes with coordinates. Notes are never injected into a model; «تبدیل به قلم دانش» makes a PROPOSED object.
  router.post('/workspaces/:wid/canvas/free/notes', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const text = String(b.content ?? '').trim();
    if (!text) throw new RepoError('invalid', 'متن یادداشت خالی است.');
    const note = repo.createNote(s, typeof b.nodeId === 'string' ? b.nodeId : '', text);
    repo.saveCanvasItem(s, 'free', `note:${note.id}`, { x: Number(b.x) || 0, y: Number(b.y) || 0 });
    res.json({ note, ...canvasBundle(s) });
  }));
  router.put('/workspaces/:wid/canvas/free/items/:id', wrap((req, res) => {
    const s = scopeOf(req);
    if (!repo.getNote(s, req.params.id)) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    repo.saveCanvasItem(s, 'free', `note:${req.params.id}`, { x: Number(body(req).x) || 0, y: Number(body(req).y) || 0 });
    res.json({ canvas: { decisions: repo.listCanvasItems(s, 'decisions'), free: repo.listCanvasItems(s, 'free') } });
  }));
  // a card (a real object) placed in the free space: only where it is DRAWN is stored; the object itself is untouched
  router.put('/workspaces/:wid/canvas/free/objects/:id', wrap((req, res) => {
    const s = scopeOf(req);
    if (!repo.getObject(s, req.params.id)) throw new RepoError('not_found', 'Context پیدا نشد.');
    repo.saveCanvasItem(s, 'free', `obj:${req.params.id}`, { x: Number(body(req).x) || 0, y: Number(body(req).y) || 0 });
    res.json({ canvas: { decisions: repo.listCanvasItems(s, 'decisions'), free: repo.listCanvasItems(s, 'free') } });
  }));
  router.delete('/workspaces/:wid/canvas/free/objects/:id', wrap((req, res) => {
    const s = scopeOf(req);
    repo.removeCanvasItem(s, 'free', `obj:${req.params.id}`);
    res.json({ canvas: { decisions: repo.listCanvasItems(s, 'decisions'), free: repo.listCanvasItems(s, 'free') } });
  }));
  router.post('/workspaces/:wid/canvas/free/reset', wrap((req, res) => {
    const s = scopeOf(req);
    repo.listNotes(s).forEach((n, i) => repo.saveCanvasItem(s, 'free', `note:${n.id}`, { x: (i % 4) * 260, y: Math.floor(i / 4) * 150 }));
    res.json(canvasBundle(s));
  }));
  router.post('/workspaces/:wid/canvas/free/notes/:id/to-knowledge', wrap((req, res) => {
    const s = scopeOf(req);
    const note = repo.getNote(s, req.params.id);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const first = note.content.split('\n').find((l) => l.trim())?.trim() ?? 'یادداشت';
    const type = ['Fact', 'Decision', 'Constraint'].includes(String(body(req).type)) ? String(body(req).type) as 'Fact' | 'Decision' | 'Constraint' : 'Fact';
    const object = repo.createObject(s, { type, status: 'Proposed', provenance: 'User Input', title: first.length > 70 ? `${first.slice(0, 70)}…` : first, content: note.content, nodeId: note.nodeId, source: { kind: 'note', label: 'بوم فکر آزاد', at: new Date().toISOString() } });
    res.json({ object, ...canvasBundle(s) });
  }));

  /** accept a proposal AND replace an existing object with it (the old one becomes Superseded, never deleted) */
  router.post('/workspaces/:wid/objects/:id/replace', wrap((req, res) => {
    const s = scopeOf(req);
    const winner = repo.getObject(s, req.params.id);
    if (!winner) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (winner.status !== 'Proposed') throw new RepoError('invalid', 'فقط یک پیشنهاد می‌تواند جای مورد دیگر بنشیند.');
    const loserId = String(body(req).replacesId ?? '');
    const r = repo.supersedeBy(s, loserId, winner.id, metaOf(body(req), { kind: 'superseded' }));
    res.json({ objects: repo.listObjects(s), relationships: repo.listRelationships(s), changes: repo.listChanges(s), stale: stale(s), impact: r.impact });
  }));
  router.put('/workspaces/:wid/objects/:id/dependencies', wrap((req, res) => {
    const s = scopeOf(req);
    const list = Array.isArray(body(req).dependsOn) ? (body(req).dependsOn as unknown[]).filter((x): x is string => typeof x === 'string') : null;
    if (!list) throw new RepoError('invalid', 'فهرست وابستگی‌ها لازم است.');
    const r = repo.setDependencies(s, req.params.id, list, metaOf(body(req)));
    res.json({ relationships: r.relationships, changes: repo.listChanges(s), stale: stale(s) });
  }));
  /** «برای این بخش کنار بگذار»: this object (in a sub-node) switches an ancestor-node object off for its sub-tree. A reason is required. */
  router.post('/workspaces/:wid/objects/:id/overrides', wrap((req, res) => {
    const s = scopeOf(req);
    const r = repo.setOverride(s, req.params.id, String(body(req).targetId ?? ''), metaOf(body(req)));
    res.json({ relationships: r.relationships, changes: repo.listChanges(s) });
  }));
  router.post('/workspaces/:wid/objects/:id/overrides/remove', wrap((req, res) => {
    const s = scopeOf(req);
    const r = repo.removeOverride(s, req.params.id, String(body(req).targetId ?? ''), metaOf(body(req)));
    res.json({ relationships: r.relationships, changes: repo.listChanges(s) });
  }));
  router.post('/workspaces/:wid/objects/:id/review-accept', wrap((req, res) => {
    const s = scopeOf(req);
    const change = repo.acceptReview(s, req.params.id, metaOf(body(req)));
    res.json({ change, changes: repo.listChanges(s), stale: stale(s) });
  }));
  router.get('/workspaces/:wid/objects/:id/versions', wrap((req, res) => { res.json({ versions: repo.listVersions(scopeOf(req), req.params.id) }); }));
}
