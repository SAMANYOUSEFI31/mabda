import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { Repo, RepoError, newId } from './repo.ts';
import type { ChangeMeta } from './repo.ts';
import type { Scope } from './repo.ts';
import { importLegacy, seedPayload } from './legacy.ts';
import { applyDemo, DEMO_WORKSPACE_ID } from './demo.ts';
import type { LegacyPayload } from './legacy.ts';
import type { AiService } from '../ai/service.ts';
import { toAiError } from '../ai/errors.ts';
import { userOf as aiUserOf } from '../ai/routes.ts';
import type { ContextSource } from '../ai/routes.ts';
import { clampProposal } from '../ai/service.ts';
import { FileService } from '../files/service.ts';
import { FileExtractError, MAX_FILE_BYTES } from '../files/extract.ts';
import { ledgerEntryFromUsage } from '../../src/core/ledger.ts';
import { ancestorIds, defaultNodeId, resolveNodeId } from '../../src/core/nodeTree.ts';
import { validateSpec } from '../../src/core/specGraph.ts';
import { PLANS } from '../../src/core/creditEngine.ts';
import { can, entitlementsOf } from '../../src/core/entitlements.ts';
import { costReport } from '../../src/core/costReport.ts';
import { buildContextPack, PACK_MARKER_RE } from '../../src/core/contextPack.ts';
import { parseByHeadings } from '../../src/core/answerParser.ts';
import { guessTitle } from '../../src/core/knowledgeGuess.ts';
import type { ParsedBlock } from '../../src/core/answerParser.ts';
import { renderSavedPack } from './packs.ts';
import { archiveDeliverable, archiveWorkspace, archivedObjects, deleteDeliverable, deleteWorkspace, listRemovals, planNodeRemoval, purgeImpact, purgeObject, removeNode, restoreDeliverable, restoreObject, undoRemoval, wipeUser } from './removal.ts';
import { renderAiRequest } from './aiRequests.ts';
import { isRequestKind, KIND_LABEL } from '../../src/core/aiRequest.ts';
import { STARTERS } from '../../src/core/starters.ts';
import { planNodes, sampleNode } from '../../src/core/startTemplate.ts';
import { nodeTemplateOf, nodeTemplateToStart, workstreamTemplateOf } from '../../src/core/templates.ts';
import type { NodeTemplate, NodeTemplateNode } from '../../src/core/templates.ts';
import type { SavedPack } from '../../src/types/index.ts';
import { findItem, headingSections, parseThinking } from '../../src/core/thinkingMarkers.ts';
import type { ThinkingKind } from '../../src/core/thinkingMarkers.ts';
import { enabledBuiltInSpecs } from '../../src/core/specs.ts';
import { needsReview } from '../../src/core/decisionGraph.ts';
import { buildCanvasModel, moveEffect, rankBetween } from '../../src/core/canvasModel.ts';
import type { Lane } from '../../src/core/canvasModel.ts';
import { pairsToJudge } from '../../src/core/contradictionCandidates.ts';
import { AiError } from '../ai/errors.ts';
import type { ChatSession, GeneratedDeliverable, LedgerEntry, Workspace, WorkstreamSpec } from '../../src/types/index.ts';

/** One local user until real accounts exist. Every table already carries user_id + workspace_id. */
export const LOCAL_USER = 'local';
/** the words that must be typed to delete every piece of data (nothing is half-confirmed) */
export const ACCOUNT_WIPE_WORDS = 'حذف همهٔ داده‌ها';

const wrap = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

export function createDataRouter(deps: { repo: Repo; ai: AiService; files?: FileService; /** builds the AI context from the database (thread: only the node + its parents) */ source?: ContextSource; admin?: boolean; clock?: () => Date }): { router: Router; files: FileService } {
  const { repo, ai } = deps;
  const clock = deps.clock ?? (() => new Date());
  const files = deps.files ?? new FileService(repo, (aiUser, req) => ai.extract(aiUser, req));
  const router = express.Router();
  const scopeOf = (req: Request): Scope => {
    const workspaceId = String(req.params.wid);
    if (!repo.getWorkspace(LOCAL_USER, workspaceId)) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
    return { userId: LOCAL_USER, workspaceId };
  };
  const body = (req: Request) => (req.body ?? {}) as Record<string, any>;
  const ACTORS = ['user', 'chat', 'coach', 'import', 'system'];
  /** who did it and why, from the optional `change` field of a request (without an explicit actor the repo infers it from the object's source; no source = the user) */
  const metaOf = (b: Record<string, any>, extra: Partial<ChangeMeta> = {}): ChangeMeta => {
    const c = (b.change && typeof b.change === 'object' ? b.change : {}) as Record<string, unknown>;
    const reason = typeof b.reason === 'string' ? b.reason : typeof c.reason === 'string' ? c.reason : undefined;
    return { ...(ACTORS.includes(String(c.actor)) ? { actor: c.actor as ChangeMeta['actor'] } : {}), ...(typeof c.label === 'string' ? { label: c.label.slice(0, 80) } : {}), ...(reason ? { reason: reason.slice(0, 1000) } : {}), ...extra };
  };

  // ── bootstrap / import ──────────────────────────────────────────────
  router.post('/bootstrap', wrap((req, res) => {
    let imported: unknown = null;
    if (!repo.isImported(LOCAL_USER)) {
      const legacy = body(req).legacy as LegacyPayload | undefined;
      const hasLegacy = !!legacy?.workspaces?.length;
      imported = importLegacy(repo, LOCAL_USER, hasLegacy ? legacy! : seedPayload(), hasLegacy ? 'localStorage' : 'seed');
    }
    res.json({ workspaces: repo.listWorkspaces(LOCAL_USER), imported });
  }));

  // ── the showcase workspace: one click builds it, the same click resets it ──
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

  // ── nodes ────────────────────────────────────────────────────────────
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

  // ── the archive: knowledge that is out of the way, outputs, recent removals; «برگردان» and «حذف دائمی» ──
  router.get('/workspaces/:wid/archive', wrap((req, res) => { const s = scopeOf(req); res.json({ objects: archivedObjects(repo, s), removals: listRemovals(repo, s), deliverables: repo.listDeliverables(s).filter((d) => d.archivedAt) }); }));
  router.post('/workspaces/:wid/objects/:id/restore', wrap((req, res) => { const s = scopeOf(req); const r = restoreObject(repo, s, req.params.id, typeof body(req).nodeId === 'string' ? body(req).nodeId : undefined); res.json({ object: r.object, impact: r.impact, stale: stale(s) }); }));
  router.get('/workspaces/:wid/objects/:id/purge-impact', wrap((req, res) => { res.json({ impact: purgeImpact(repo, scopeOf(req), req.params.id) }); }));
  router.delete('/workspaces/:wid/objects/:id/permanent', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    if (b.confirm !== true) throw new RepoError('invalid', 'حذف دائمی باید صریحاً تأیید شود.');
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : []);
    const r = purgeObject(repo, s, req.params.id, { notes: ids(b.copies?.notes), sessions: ids(b.copies?.sessions), deliverables: ids(b.copies?.deliverables) });
    res.json({ ...r, objects: repo.listObjects(s), notes: repo.listNotes(s), sessions: repo.listSessions(s), deliverables: repo.listDeliverables(s), relationships: repo.listRelationships(s), changes: repo.listChanges(s), stale: stale(s) });
  }));
  router.post('/workspaces/:wid/deliverables/:id/archive', wrap((req, res) => { const s = scopeOf(req); archiveDeliverable(repo, s, req.params.id); res.json({ deliverables: repo.listDeliverables(s), stale: stale(s) }); }));
  router.post('/workspaces/:wid/deliverables/:id/restore', wrap((req, res) => { const s = scopeOf(req); restoreDeliverable(repo, s, req.params.id); res.json({ deliverables: repo.listDeliverables(s), stale: stale(s) }); }));
  router.delete('/workspaces/:wid/deliverables/:id', wrap((req, res) => { const s = scopeOf(req); deleteDeliverable(repo, s, req.params.id); res.json({ deliverables: repo.listDeliverables(s), stale: stale(s) }); }));

  // ── workspaces and the account: archive, delete (typed name), delete everything (typed words) ──
  router.post('/workspaces/:wid/archive', wrap((req, res) => { archiveWorkspace(repo, LOCAL_USER, req.params.wid, body(req).archive !== false); res.json({ workspaces: repo.listWorkspaces(LOCAL_USER) }); }));
  router.delete('/workspaces/:wid', wrap((req, res) => {
    const ws = repo.getWorkspace(LOCAL_USER, req.params.wid);
    if (!ws) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
    // the showcase is a sample: one clear yes is enough; a real workspace needs its name typed
    if (!ws.isDemo && body(req).confirmName !== ws.name) throw new RepoError('invalid', 'برای حذف، نام فضای کاری را دقیقاً بنویس.');
    const r = deleteWorkspace(repo, LOCAL_USER, req.params.wid);
    res.json({ ...r, workspaces: repo.listWorkspaces(LOCAL_USER) });
  }));
  router.post('/account/delete-all', wrap((req, res) => {
    if (body(req).confirm !== ACCOUNT_WIPE_WORDS) throw new RepoError('invalid', `برای حذف همهٔ داده‌ها عبارت «${ACCOUNT_WIPE_WORDS}» را بنویس.`);
    res.json({ ...wipeUser(repo, LOCAL_USER), workspaces: repo.listWorkspaces(LOCAL_USER) });
  }));

  // ── context objects ──────────────────────────────────────────────────
  const stale = (s: Scope) => (repo.impactEnabled(s) ? repo.computeStale(s) : []);
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

  // ── boards («بوم»): the decision board's columns ARE statuses, its rows ARE nodes, its order IS a stored rank ──
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

  // ── notes (never injected into the model) ────────────────────────────
  router.post('/workspaces/:wid/notes', wrap((req, res) => {
    const s = scopeOf(req);
    const note = repo.createNote(s, String(body(req).nodeId), String(body(req).content ?? ''));
    res.json({ note, thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  router.post('/workspaces/:wid/notes/:id/move-node', wrap((req, res) => {
    const s = scopeOf(req);
    const note = repo.moveNoteToNode(s, req.params.id, String(body(req).nodeId ?? ''));
    res.json({ note, thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  router.post('/workspaces/:wid/thoughts/:id/revise', wrap((req, res) => {
    const b = body(req);
    const r = repo.reviseThought(scopeOf(req), req.params.id, String(b.text ?? ''));
    res.json(r);
  }));
  router.post('/workspaces/:wid/thoughts/:id/reclassify', wrap((req, res) => {
    const b = body(req);
    if (!['idea', 'question', 'assumption', 'open_decision'].includes(String(b.kind))) throw new RepoError('invalid', 'نوع فکر معتبر نیست.');
    res.json({ thought: repo.reclassifyThought(scopeOf(req), req.params.id, b.kind as import('../../src/types/index.ts').ThoughtKind) });
  }));
  router.post('/workspaces/:wid/thoughts/derive', wrap((req, res) => {
    const b = body(req);
    const parentIds = Array.isArray(b.parentIds) ? b.parentIds.filter((id): id is string => typeof id === 'string') : [];
    if (!['idea', 'question', 'assumption', 'open_decision'].includes(String(b.kind))) throw new RepoError('invalid', 'نوع فکر معتبر نیست.');
    res.json(repo.deriveThought(scopeOf(req), { parentIds, nodeId: String(b.nodeId ?? ''), kind: b.kind as import('../../src/types/index.ts').ThoughtKind, text: String(b.text ?? '') }));
  }));
  router.post('/workspaces/:wid/thoughts/:id/resolve', wrap((req, res) => {
    const b = body(req);
    res.json({ thought: repo.resolveThought(scopeOf(req), req.params.id, { ...(typeof b.objectId === 'string' ? { objectId: b.objectId } : {}), ...(typeof b.nodeId === 'string' ? { nodeId: b.nodeId } : {}) }) });
  }));
  router.post('/workspaces/:wid/thoughts/:id/promote', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    if (!['Fact', 'Decision', 'Constraint'].includes(String(b.type))) throw new RepoError('invalid', 'نوع دانش مقصد را انتخاب کن.');
    const thought = repo.getThought(s, req.params.id);
    if (!thought || !thought.kind) throw new RepoError('not_found', 'فکر قابل تبدیل پیدا نشد.');
    const type = b.type as import('../../src/types/index.ts').ContextType;
    const title = guessTitle(thought.text);
    const object = repo.createObject(s, {
      type, status: 'Proposed', provenance: 'User Input', title, content: thought.text, nodeId: thought.nodeId,
      source: { kind: 'note', thoughtId: thought.id, ...(thought.sourceNoteId ? { noteId: thought.sourceNoteId } : {}), ...(thought.sourceLineKey ? { lineKey: thought.sourceLineKey } : {}), quote: thought.text, at: new Date().toISOString() },
    }, metaOf(b));
    res.json({ object, objects: repo.listObjects(s), thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  router.patch('/workspaces/:wid/notes/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const note = repo.updateNote(s, req.params.id, String(body(req).content ?? ''));
    res.json({ note, thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  // a deleted note is handed back (with its place) so «برگرداندن» can put it exactly where it was
  router.delete('/workspaces/:wid/notes/:id', wrap((req, res) => { const s = scopeOf(req); const note = repo.getNote(s, req.params.id); const position = note ? repo.notePosition(s, note.id) : undefined; repo.deleteNote(s, req.params.id); res.json({ ok: true, note, position }); }));
  router.post('/workspaces/:wid/notes/restore', wrap((req, res) => { const s = scopeOf(req); const b = body(req); res.json({ note: repo.restoreNote(s, b.note as never, b.position as never) }); }));

  /** «استخراج»: the note becomes Proposed objects (provenance AI Suggested) — the user confirms them later. */
  /**
   * A thinking item of a note (src/core/thinkingMarkers.ts) becomes knowledge — always PROPOSED, with the line as its quote.
   *   assumption → Fact (assumption = true, optional reviewBy) · open_decision → Decision · idea → Fact or Decision, the user's choice
   * A question stays a question. The note itself is never rewritten.
   */
  router.post('/workspaces/:wid/notes/:id/items/convert', wrap((req, res) => {
    const s = scopeOf(req);
    const note = repo.getNote(s, req.params.id);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const b = body(req);
    const item = findItem(parseThinking(note.content), { kind: ['idea', 'assumption', 'open_decision', 'question'].includes(String(b.kind)) ? b.kind as ThinkingKind : undefined, hash: typeof b.hash === 'string' ? b.hash : undefined, text: typeof b.text === 'string' ? b.text : undefined });
    if (!item) throw new RepoError('not_found', 'این خط دیگر در یادداشت نیست.');
    const thought = repo.listThoughts(s, { includeResolved: true }).find((t) => t.sourceNoteId === note.id && t.sourceLine === item.line && t.sourceLineKey === item.hash);
    if (!thought) throw new RepoError('not_found', 'هویت پایدار این فکر پیدا نشد؛ فضا را تازه کن و دوباره تلاش کن.');
    if (!['Fact', 'Decision', 'Constraint'].includes(String(b.type))) throw new RepoError('invalid', 'نوع دانش مقصد را انتخاب کن.');
    const title = guessTitle(thought.text);
    const object = repo.createObject(s, {
      type: b.type as import('../../src/types/index.ts').ContextType, status: 'Proposed', provenance: 'User Input', title, content: thought.text, nodeId: thought.nodeId,
      source: { kind: 'note', label: 'یادداشت', thoughtId: thought.id, noteId: note.id, lineKey: thought.sourceLineKey, quote: thought.text, at: new Date().toISOString() },
    }, metaOf(b));
    res.json({ object, objects: repo.listObjects(s), thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  /** «ببر بالاتر»-style split: every ## section of a note becomes a child node (the note stays) */
  router.post('/workspaces/:wid/notes/:id/split', wrap((req, res) => {
    const s = scopeOf(req);
    const note = repo.getNote(s, req.params.id);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    const nodes = repo.nodesFromNote(s, note.id, headingSections(note.content), metaOf(body(req)));
    res.json({ nodes: repo.listNodes(s), created: nodes, notes: repo.listNotes(s), thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  router.post('/workspaces/:wid/objects/:id/outcome', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const change = repo.noteOutcome(s, req.params.id, typeof b.text === 'string' ? b.text : '', metaOf(b), b.verdict as never);
    res.json({ change, changes: repo.listChanges(s) });
  }));

  // ── metrics («شاخص‌ها»): recorded results, never Context objects. ──
  const metricsState = (s: Scope) => ({ metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s) });
  router.get('/workspaces/:wid/metrics', wrap((req, res) => { res.json(metricsState(scopeOf(req))); }));
  router.post('/workspaces/:wid/metrics', wrap((req, res) => { const s = scopeOf(req); const b = body(req); const metric = repo.createMetric(s, b, metaOf(b)); res.json({ metric, ...metricsState(s) }); }));
  router.put('/workspaces/:wid/metrics/:id', wrap((req, res) => { const s = scopeOf(req); const b = body(req); const metric = repo.updateMetric(s, req.params.id, b, metaOf(b)); res.json({ metric, ...metricsState(s) }); }));
  router.post('/workspaces/:wid/metrics/:id/archive', wrap((req, res) => { const s = scopeOf(req); const metric = repo.archiveMetric(s, req.params.id, metaOf(body(req))); res.json({ metric, ...metricsState(s) }); }));
  router.post('/workspaces/:wid/measurements', wrap((req, res) => {
    const s = scopeOf(req); const b = body(req);
    // Measurements submitted through the browser are manual regardless of request data.
    const measurement = repo.addMeasurement(s, { metricId: String(b.metricId ?? ''), value: b.value, at: typeof b.at === 'string' ? b.at : undefined, note: b.note, source: 'manual', decisionId: typeof b.decisionId === 'string' ? b.decisionId : undefined }, metaOf(b));
    res.json({ measurement, ...metricsState(s) });
  }));
  // the weekly quick entry: several fields at once; an empty field is simply not sent
  router.post('/workspaces/:wid/measurements/batch', wrap((req, res) => {
    const s = scopeOf(req); const b = body(req);
    const at = typeof b.at === 'string' ? b.at : undefined;
    const entries = (Array.isArray(b.entries) ? b.entries : []).slice(0, 100) as Array<{ metricId?: unknown; value?: unknown; note?: unknown }>;
    const added = repo.transaction(() => entries.map((e) => repo.addMeasurement(s, { metricId: String(e.metricId ?? ''), value: e.value, at, note: e.note, source: 'manual' }, metaOf(b))));
    res.json({ added, ...metricsState(s) });
  }));
  router.post('/workspaces/:wid/measurements/csv', wrap((req, res) => {
    const s = scopeOf(req); const b = body(req);
    const r = repo.addMeasurementsCsv(s, typeof b.text === 'string' ? b.text.slice(0, 200_000) : '', metaOf(b));
    res.json({ added: r.added.length, errors: r.errors, ...metricsState(s) });
  }));
  router.post('/workspaces/:wid/measurements/:id/confirm', wrap((req, res) => { const s = scopeOf(req); const measurement = repo.confirmMeasurement(s, req.params.id, metaOf(body(req))); res.json({ measurement, ...metricsState(s) }); }));
  router.delete('/workspaces/:wid/measurements/:id', wrap((req, res) => { const s = scopeOf(req); repo.removeMeasurement(s, req.params.id, metaOf(body(req))); res.json(metricsState(s)); }));
  router.post('/workspaces/:wid/notes/:id/extract', wrap(async (req, res) => {
    const s = scopeOf(req);
    const note = repo.getNote(s, req.params.id);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    if (!note.content.trim()) throw new RepoError('invalid', 'یادداشت خالی است.');
    const aiUser = aiUserOf(req);
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.extract(aiUser, { kind: 'note', text: note.content, nodeId: note.nodeId, nodes: repo.listNodes(s).map((n) => ({ id: n.id, label: n.label })) }, ctl.signal);
    const created = r.objects.slice(0, repo.objectSlots(s)).map((o) => repo.createObject(s, { type: o.type, status: 'Proposed', provenance: 'AI Suggested', title: o.title, content: o.content, nodeId: o.nodeId, source: { kind: 'note', at: new Date().toISOString() } }));
    const ledger = repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'استخراج از یادداشت', mode: 'note_extract', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ created, ledger, usage: r.usage });
  }));

  // ── assets / ledger / chats / specs ──────────────────────────────────
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

  // ── decision layer: Gap ambiguity (cached per object version), Context Coach (daily cap per plan) ──
  const today = () => clock().toISOString().slice(0, 10);
  router.post('/workspaces/:wid/gap/judge', wrap(async (req, res) => {
    const s = scopeOf(req);
    const ids = Array.isArray(body(req).objectIds) ? (body(req).objectIds as unknown[]).map(String) : [];
    const have = repo.listJudgments(s);
    const todo = ids.map((id) => repo.getObject(s, id)).filter((o): o is NonNullable<typeof o> => !!o && have[o.id]?.version !== o.version);
    // Platform-paid judgements are always capped per plan per day.
    const planOf = repo.getWorkspace(LOCAL_USER, s.workspaceId)!.planId;
    const left = Math.max(0, entitlementsOf(planOf).decisionJudgmentsPerDay - repo.dailyUsage(s, today(), 'judge'));
    const limited = todo.length > left;
    if (limited) todo.length = left;
    if (todo.length) {
      const ctl = new AbortController();
      res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
      const r = await ai.judgeAmbiguity(aiUserOf(req), todo.map((o) => ({ id: o.id, title: o.title, content: o.content })), ctl.signal);
      for (const o of todo) { const j = r.judgments[o.id]; if (j) repo.saveJudgment(s, o.id, o.version, j); }
      repo.addDailyUsage(s, today(), 'judge', todo.length);
      // the decision-layer call is free for the user (PRD P3) but its real tokens/cost are in the ledger
      if (r.usage) repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'تشخیص ابهام Context (Gap)', mode: 'gap_judge', creditCost: 0, usage: r.usage, id: newId('led') }));
    }
    res.json({ judgments: repo.listJudgments(s), ledger: repo.listLedger(s), limited });
  }));

  // ── memory of another AI (ChatGPT / Claude / any text) → PROPOSED objects, each with a verified quote ──
  router.post('/workspaces/:wid/memory/import', wrap(async (req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    const text = String(body(req).text ?? '').trim();
    if (!text) throw new RepoError('invalid', 'متنی برای وارد کردن چسبانده نشده است.');
    if (text.length > 120_000) throw new RepoError('invalid', 'متن بیش از حد بلند است؛ آن را در چند بخش وارد کن.');
    // `mode: 'text'` = the user's own notes / text (not another AI's memory)
    const plain = body(req).mode === 'text';
    const label = ['ChatGPT', 'Claude', 'Gemini'].includes(String(body(req).sourceLabel)) ? String(body(req).sourceLabel) : 'AI دیگر';
    const sourceName = plain ? 'متن چسبانده‌شده' : `حافظهٔ ${label}`;
    if (entitlementsOf(ws.planId).decisionJudgmentsPerDay - repo.dailyUsage(s, today(), 'judge') <= 0) {
      throw new AiError('quota', { message: 'سقف قضاوت‌های روزانهٔ پلن پر شده است؛ فردا دوباره تلاش کن یا پلن را ارتقا بده.', retryable: false });
    }
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const nodes = repo.listNodes(s).map((n) => ({ id: n.id, label: n.label }));
    const r = await ai.extract(aiUserOf(req), { kind: plain ? 'note' : 'memory', text, nodeId: defaultNodeId(repo.listNodes(s)), nodes }, ctl.signal);
    const at = new Date().toISOString();
    const created = r.objects.slice(0, repo.objectSlots(s)).map((o) => repo.createObject(s, { type: o.type, status: 'Proposed', provenance: 'Imported', title: o.title, content: o.content, nodeId: o.nodeId, source: { kind: 'paste', label: sourceName, at, ...(o.quote ? { quote: o.quote } : {}) } }));
    repo.addDailyUsage(s, today(), 'judge', 1);
    repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: plain ? 'وارد کردن متن چسبانده‌شده' : `وارد کردن حافظهٔ ${label}`, mode: 'memory_import', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ created, found: r.objects.length, skipped: r.objects.length - created.length, truncated: r.truncated, ledger: repo.listLedger(s) });
  }));

  /**
   * «پیشنهاد دانش از این خروجی»: an output is NOT a Context type. The existing extraction path reads its text and makes
   * Proposed Facts/Decisions/Constraints, each with a verified quote from the output; the user confirms them one by one.
   */
  router.post('/workspaces/:wid/deliverables/:id/extract', wrap(async (req, res) => {
    const s = scopeOf(req);
    const del = repo.getDeliverable(s, req.params.id);
    if (!del) throw new RepoError('not_found', 'دارایی پیدا نشد.');
    if (!del.content.trim()) throw new RepoError('invalid', 'متن این دارایی خالی است.');
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const nodes = repo.listNodes(s).map((n) => ({ id: n.id, label: n.label }));
    const r = await ai.extract(aiUserOf(req), { kind: 'note', text: del.content, nodeId: defaultNodeId(repo.listNodes(s)), nodes }, ctl.signal);
    const at = new Date().toISOString();
    const created = r.objects.slice(0, repo.objectSlots(s)).map((o) => repo.createObject(s, { type: o.type, status: 'Proposed', provenance: 'Asset Derived', title: o.title, content: o.content, nodeId: o.nodeId, source: { kind: 'asset', label: del.title, at, ...(o.quote ? { quote: o.quote } : {}) } }));
    repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: `پیشنهاد دانش از «${del.title}»`, mode: 'asset_extract', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ created, found: r.objects.length, skipped: r.objects.length - created.length, ledger: repo.listLedger(s) });
  }));

  // ── focused thread on one node: cheap tier, context = node + parents, output = Proposed objects for THAT node only ──
  router.post('/workspaces/:wid/threads/:nodeId/turn', wrap(async (req, res) => {
    const s = scopeOf(req);
    if (!deps.source) throw new RepoError('invalid', 'منبع Context برای گفتگوی متمرکز تنظیم نشده است.');
    const node = repo.listNodes(s).find((n) => n.id === req.params.nodeId);
    if (!node) throw new RepoError('not_found', 'گره پیدا نشد.');
    const message = String(body(req).message ?? '').trim();
    if (!message) throw new RepoError('invalid', 'پیام خالی است.');
    const history = (Array.isArray(body(req).history) ? body(req).history : []).filter((m: any) => m && typeof m.content === 'string').map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    const ctx = deps.source.forChat(s.workspaceId, { scopeNodeId: node.id, message, threadOnly: true });
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.threadTurn(aiUserOf(req), { message, nodeId: node.id, nodeLabel: node.label, contextList: ctx.contextList ?? [], nodeLabels: ctx.nodeLabels, excerpts: ctx.excerpts, history }, ctl.signal);
    const at = new Date().toISOString();
    const blocks = r.blocks.map((b) => clampProposal(b, [node.id], node.id));
    const room = repo.objectSlots(s);
    const created = blocks.filter((b) => b.proposal).slice(0, room).map((b) => repo.createObject(s, {
      type: b.proposal!.type, status: 'Proposed', provenance: 'AI Suggested', title: b.proposal!.title, content: b.proposal!.content, nodeId: node.id,
      source: { kind: 'chat', label: `گفتگوی متمرکز · ${node.label}`, at, ...(b.proposal!.reason ? { reason: b.proposal!.reason } : {}) },
    }));
    repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: `گفتگوی متمرکز · ${node.label}`, mode: 'thread', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ blocks, markdown: r.markdown, created, ledger: repo.listLedger(s) });
  }));

  /** end of the thread: a short summary is saved as a note on the node (notes are never injected into the model) */
  router.post('/workspaces/:wid/threads/:nodeId/finish', wrap(async (req, res) => {
    const s = scopeOf(req);
    const node = repo.listNodes(s).find((n) => n.id === req.params.nodeId);
    if (!node) throw new RepoError('not_found', 'گره پیدا نشد.');
    const transcript = (Array.isArray(body(req).transcript) ? body(req).transcript : []).filter((m: any) => m && typeof m.content === 'string').map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    if (!transcript.length) throw new RepoError('invalid', 'گفتگویی برای خلاصه کردن نیست.');
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.threadSummary(aiUserOf(req), { nodeLabel: node.label, transcript }, ctl.signal);
    const note = repo.createNote(s, node.id, `خلاصهٔ گفتگوی متمرکز:\n${r.summary}`);
    repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: `خلاصهٔ گفتگوی متمرکز · ${node.label}`, mode: 'thread', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ note, ledger: repo.listLedger(s) });
  }));

  // ── semantic contradictions (plan feature; shares the daily judgement cap) ──────────────
  router.post('/workspaces/:wid/contradictions/judge', wrap(async (req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    if (!can(ws.planId, 'semanticContradiction')) throw new RepoError('forbidden', 'تشخیص تناقض معنایی در این پلن فعال نیست.');
    const objects = repo.listObjects(s);
    // optional scope: only pairs that involve these objects (the client sends the ones changed in this session)
    const only = Array.isArray(body(req).objectIds) ? new Set((body(req).objectIds as unknown[]).map(String)) : null;
    const todo = pairsToJudge(objects, repo.listPairJudgments(s), undefined, repo.listRelationships(s), repo.listNodes(s)).filter((p) => !only || only.has(p.a.id) || only.has(p.b.id));
    const left = Math.max(0, entitlementsOf(ws.planId).decisionJudgmentsPerDay - repo.dailyUsage(s, today(), 'judge'));
    const limited = todo.length > left;
    if (limited) todo.length = left;
    if (todo.length) {
      const ctl = new AbortController();
      res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
      const r = await ai.judgeContradictions(aiUserOf(req), todo.map((p) => ({ key: p.key, a: p.a, b: p.b })), ctl.signal);
      for (const p of todo) { const j = r.results[p.key]; if (j) repo.savePairJudgment(s, p.a, p.b, j); }
      repo.addDailyUsage(s, today(), 'judge', todo.length);
      if (r.usage) repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'تشخیص تناقض معنایی', mode: 'contradiction', creditCost: 0, usage: r.usage, id: newId('led') }));
    }
    res.json({ pairJudgments: repo.listPairJudgments(s), ledger: repo.listLedger(s), judged: todo.length, limited });
  }));

  /** the user's decision on a pair: keep one (the other becomes Superseded) or keep both and move one to another node */
  router.post('/workspaces/:wid/contradictions/resolve', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const aId = String(b.aId ?? ''), bId = String(b.bId ?? '');
    const a = repo.getObject(s, aId), o = repo.getObject(s, bId);
    if (!a || !o) throw new RepoError('not_found', 'یکی از دو مورد پیدا نشد.');
    let impact = { count: 0, assets: [] as Array<{ id: string; title: string; reasons: string[] }> };
    if (b.action === 'keep') {
      const keepId = String(b.keepId ?? '');
      if (keepId !== aId && keepId !== bId) throw new RepoError('invalid', 'مورد نگه‌داشتنی مشخص نیست.');
      impact = repo.supersedeBy(s, keepId === aId ? bId : aId, keepId, metaOf(b, { reason: 'تناقض: یکی نگه داشته شد' })).impact;
      repo.savePairJudgment(s, a, o, { conflict: true, reason: 'حل‌شده توسط کاربر', resolution: `kept:${keepId}` });
    } else if (b.action === 'separate') {
      const moveId = String(b.moveId ?? '');
      if (moveId !== aId && moveId !== bId) throw new RepoError('invalid', 'مورد جابه‌جاشونده مشخص نیست.');
      const moved = repo.updateObject(s, moveId, { nodeId: String(b.nodeId ?? '') }, metaOf(b, { kind: 'contradiction_resolved', reason: 'تناقض: هر دو درست‌اند؛ گره‌ها جدا شد' }));
      impact = moved.impact;
      repo.savePairJudgment(s, a, o, { conflict: false, reason: 'هر دو درست‌اند؛ گره‌ها جدا شد', resolution: 'separated' });
    } else throw new RepoError('invalid', 'اقدام نامعتبر است.');
    res.json({ objects: repo.listObjects(s), relationships: repo.listRelationships(s), pairJudgments: repo.listPairJudgments(s), stale: stale(s), impact });
  }));

  const coachQuota = (s: Scope) => {
    const limit = entitlementsOf(repo.getWorkspace(LOCAL_USER, s.workspaceId)!.planId).coachPerDay;
    const used = repo.dailyUsage(s, today(), 'coach');
    return { used, limit, remaining: Math.max(0, limit - used) };
  };
  router.get('/workspaces/:wid/coach/quota', wrap((req, res) => { res.json(coachQuota(scopeOf(req))); }));
  router.post('/workspaces/:wid/coach', wrap(async (req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const text = String(b.text ?? '').trim();
    if (!text) throw new RepoError('invalid', 'متنی برای Coach نوشته نشده است.');
    if (coachQuota(s).remaining <= 0) throw new AiError('quota', { message: 'سقف روزانهٔ مربی دانش برای این پلن پر شده است. فردا دوباره یا پلن را ارتقا بده.', retryable: false });
    const nodes = repo.listNodes(s);
    const nodeId = resolveNodeId(nodes, typeof b.nodeId === 'string' ? b.nodeId : undefined);
    const node = nodes.find((n) => n.id === nodeId);
    const chain = new Set(ancestorIds(nodes, nodeId));
    const existing = repo.listObjects(s).filter((o) => o.status === 'Confirmed' && chain.has(o.nodeId)).slice(0, 12).map((o) => `${o.title}: ${o.content}`);
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.coach(aiUserOf(req), {
      scope: b.scope === 'onboarding' ? 'onboarding' : 'node', text, nodeId, nodeLabel: node?.label, nodeDescription: node?.description,
      nodes: nodes.map((n) => ({ id: n.id, label: n.label })), existing,
      history: Array.isArray(b.history) ? (b.history as Array<{ role: 'user' | 'coach'; content: string }>).slice(-6) : undefined,
    }, ctl.signal);
    repo.addDailyUsage(s, today(), 'coach'); // counted only after a successful answer
    repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'Context Coach', mode: 'coach', creditCost: 0, usage: r.usage, id: newId('led') }));
    const { usage: _u, ...result } = r;
    res.json({ result, quota: coachQuota(s), ledger: repo.listLedger(s) });
  }));

  // ── examples (starters / templates): grey samples, invisible to every AI path and engine ──
  router.post('/workspaces/:wid/starters/:id/apply', wrap((req, res) => {
    const s = scopeOf(req);
    const st = STARTERS.find((x) => x.id === req.params.id);
    if (!st) throw new RepoError('not_found', 'اسکلت شروع پیدا نشد.');
    // a start template may bring nodes (put under the first root; a node of the same name anywhere is reused, so applying twice adds nothing)
    const under = defaultNodeId(repo.listNodes(s)) || undefined;
    const created = new Map<string, string>();
    for (const n of planNodes(st, repo.listNodes(s), under, (k) => k)) {
      const parent = (n.parentId && created.get(n.parentId)) || under;
      const same = repo.listNodes(s).find((x) => x.label === n.label); // a node of the same name ANYWHERE in the tree is the one meant (she may have built it herself, elsewhere)
      created.set(n.key, same?.id ?? repo.createNode(s, { parentId: parent as string, label: n.label, description: n.description }).id);
    }
    // the examples: `node` is a node of this template, else a hint for a node of THIS workspace; a node that is not there → the default place
    const nodes = repo.listNodes(s);
    const made = st.samples.map((x) => repo.createSample(s, { type: x.type, title: x.title, content: x.content, nodeId: sampleNode(x, created, nodes), ...(x.slotKey ? { slotKey: x.slotKey } : {}), ...(x.facets ? { facets: x.facets } : {}) })).filter(Boolean);
    res.json({ added: made.length, samples: repo.listSampleObjects(s), nodes });
  }));
  /** remove the examples (all, or only those of some nodes) */
  router.post('/workspaces/:wid/samples/delete', wrap((req, res) => {
    const s = scopeOf(req);
    const ids = Array.isArray(body(req).nodeIds) ? (body(req).nodeIds as unknown[]).map(String) : undefined;
    res.json({ removed: repo.deleteSamples(s, ids), samples: repo.listSampleObjects(s) });
  }));
  router.get('/templates', wrap((_req, res) => { res.json({ templates: repo.listTemplates(LOCAL_USER) }); }));
  router.delete('/templates/:id', wrap((req, res) => { const template = repo.listTemplates(LOCAL_USER).find((t) => t.id === req.params.id); repo.deleteTemplate(LOCAL_USER, req.params.id); res.json({ ok: true, template }); }));
  router.post('/workspaces/:wid/templates/restore', wrap((req, res) => { const s = scopeOf(req); const t = body(req).template as { id: string; kind: 'node' | 'workstream'; name: string; payload: unknown; createdAt: string }; if (!t?.id) throw new RepoError('invalid', 'قالب نامعتبر است.'); repo.saveTemplate(s, t.kind, t.name, t.payload, t.createdAt, t.id); res.json({ templates: repo.listTemplates(LOCAL_USER) }); }));
  /** save a node (with its sub-tree and knowledge) or a custom workstream as the user's own template */
  router.post('/workspaces/:wid/templates', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    if (b.kind === 'node') {
      const t = nodeTemplateOf(String(b.sourceId ?? ''), repo.listNodes(s), repo.listObjects(s));
      if (!t) throw new RepoError('not_found', 'گره پیدا نشد.');
      res.json({ id: repo.saveTemplate(s, 'node', String(b.name ?? t.root.label), t) });
    } else if (b.kind === 'workstream') {
      const spec = repo.listSpecs(s).find((x) => x.id === b.sourceId);
      if (!spec) throw new RepoError('not_found', 'فقط جریان کار خودت را می‌شود قالب کرد.');
      res.json({ id: repo.saveTemplate(s, 'workstream', String(b.name ?? spec.title), workstreamTemplateOf(spec)) });
    } else throw new RepoError('invalid', 'نوع قالب نامعتبر است.');
  }));
  /** bring a template in: a node template → child nodes + grey examples under `parentId`; a workstream template → a custom workstream (Pro and above) */
  router.post('/workspaces/:wid/templates/:id/apply', wrap((req, res) => {
    const s = scopeOf(req);
    const t = repo.listTemplates(LOCAL_USER).find((x) => x.id === req.params.id);
    if (!t) throw new RepoError('not_found', 'قالب پیدا نشد.');
    if (t.kind === 'workstream') {
      const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
      if (!PLANS[ws.planId]?.customSpecs) throw new RepoError('forbidden', 'ساخت و ویرایش جریان کار سفارشی از پلن Pro به بالا فعال است.');
      const spec = { ...(t.payload as Omit<WorkstreamSpec, 'id'>), id: newId('spec') } as WorkstreamSpec;
      res.json({ spec: repo.saveSpec(s, spec) });
      return;
    }
    const parentId = resolveNodeId(repo.listNodes(s), typeof body(req).parentId === 'string' ? String(body(req).parentId) : undefined);
    // the saved node is read as a start template (one data format): its nodes are planned, then created under `parentId`
    const tpl = nodeTemplateToStart(t.payload as NodeTemplate, t.id);
    const plan = planNodes(tpl, repo.listNodes(s), parentId, (k) => k);
    const made = new Map<string, string>(); // template key → the node id that was really created
    for (const n of plan) {
      const node = repo.createNode(s, { parentId: (n.parentId && made.get(n.parentId)) || parentId, label: n.label, description: n.description });
      made.set(n.key, node.id);
    }
    let added = 0;
    for (const o of tpl.samples) { const nid = made.get(o.node); if (nid && repo.createSample(s, { type: o.type, title: o.title, content: o.content, nodeId: nid, facets: o.facets, slotKey: o.slotKey })) added++; }
    res.json({ nodes: repo.listNodes(s), samples: repo.listSampleObjects(s), added, rootId: made.get(tpl.nodes[0].key) });
  }));

  // ── saved packs: build once, paste anywhere (UI copy / print) ──
  const packSummary = (s: Scope, p: SavedPack) => { const r = renderSavedPack(repo, s, p, clock()); return { ...p, tokens: r.tokens, counts: r.counts }; };
  router.get('/workspaces/:wid/saved-packs', wrap((req, res) => { const s = scopeOf(req); res.json({ packs: repo.listSavedPacks(s).map((p) => packSummary(s, p)) }); }));
  router.post('/workspaces/:wid/saved-packs', wrap((req, res) => { const s = scopeOf(req); const b = body(req); res.json({ pack: packSummary(s, repo.saveSavedPack(s, { name: String(b.name ?? ''), selection: b.selection as never, instruction: typeof b.instruction === 'string' ? b.instruction : '', kind: b.kind, template: b.template })) }); }));
  router.put('/workspaces/:wid/saved-packs/:id', wrap((req, res) => { const s = scopeOf(req); const b = body(req); res.json({ pack: packSummary(s, repo.saveSavedPack(s, { id: req.params.id, name: String(b.name ?? ''), selection: b.selection as never, instruction: typeof b.instruction === 'string' ? b.instruction : '', kind: b.kind, template: b.template })) }); }));
  router.delete('/workspaces/:wid/saved-packs/:id', wrap((req, res) => { const s = scopeOf(req); const pack = repo.getSavedPack(s, req.params.id); repo.deleteSavedPack(s, req.params.id); res.json({ ok: true, pack }); }));
  router.post('/workspaces/:wid/saved-packs/restore', wrap((req, res) => { const s = scopeOf(req); const p = body(req).pack as SavedPack; if (!p?.id || !p.name) throw new RepoError('invalid', 'بسته نامعتبر است.'); repo.importSavedPack(s, { ...p, workspaceId: s.workspaceId }); res.json({ pack: packSummary(s, repo.getSavedPack(s, p.id)!) }); }));
  router.get('/workspaces/:wid/saved-packs/:id/render', wrap((req, res) => {
    const s = scopeOf(req);
    const p = repo.getSavedPack(s, req.params.id);
    if (!p) throw new RepoError('not_found', 'بسته پیدا نشد.');
    const r = renderSavedPack(repo, s, p, clock());
    res.json({ pack: p, markdown: r.markdown, tokens: r.tokens, chars: r.chars, counts: r.counts, explain: r.explain });
  }));
  // a LIVE preview while a pack is being built or edited: the draft is resolved exactly as a saved one (same function, same text), nothing is stored
  router.post('/workspaces/:wid/saved-packs/preview', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const t = new Date().toISOString();
    const draft = repo.draftSavedPack(s, { selection: b.selection as never, instruction: typeof b.instruction === 'string' ? b.instruction : '', kind: b.kind, template: b.template });
    const r = renderSavedPack(repo, s, { ...draft, id: 'preview', workspaceId: s.workspaceId, name: 'preview', createdAt: t, updatedAt: t }, clock());
    res.json({ markdown: r.markdown, tokens: r.tokens, chars: r.chars, counts: r.counts, explain: r.explain });
  }));

  // ── Context pack (copy for any AI) + pasted-answer import ────────────
  const specList = (s: Scope) => [...repo.listSpecs(s), ...enabledBuiltInSpecs(repo.getWorkspace(LOCAL_USER, s.workspaceId))];
  router.post('/workspaces/:wid/packs', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    if (!can(ws.planId, 'contextPack')) throw new RepoError('forbidden', 'بستهٔ Context در این پلن فعال نیست.');
    const b = body(req);
    const spec = typeof b.specId === 'string' ? specList(s).find((x) => x.id === b.specId) : undefined;
    if (b.specId && !spec) throw new RepoError('not_found', 'spec پیدا نشد.');
    const deliverable = spec && typeof b.deliverableId === 'string' ? spec.deliverables.find((d) => d.id === b.deliverableId) : undefined;
    const id = newId('pack');
    const pack = buildContextPack({ packId: id, workspaceName: ws.name, nodes: repo.listNodes(s), objects: repo.listObjects(s), spec, deliverable, judgments: repo.listJudgments(s), targetNodeId: typeof b.nodeId === 'string' ? b.nodeId : undefined, relationships: repo.listRelationships(s), now: clock(), metrics: { metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s), changes: repo.listChanges(s) } });
    const title = deliverable ? `${spec!.title} ‹ ${deliverable.title}` : spec ? spec.title : `کل ${ws.name}`;
    const saved = repo.savePack(s, { title, specId: spec?.id, deliverableId: deliverable?.id, refs: pack.refs, tokens: pack.tokens }, id);
    res.json({ id: saved.id, title, createdAt: saved.createdAt, markdown: pack.markdown, tokens: pack.tokens, chars: pack.chars, counts: pack.counts });
  }));
  // «درخواست برای AI»: kind + one line (+ scope) → the assembled prompt. `record` stores the pack (lineage for the import of the answer); a preview does not
  router.post('/workspaces/:wid/ai-requests', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    if (!can(ws.planId, 'contextPack')) throw new RepoError('forbidden', 'بستهٔ Context در این پلن فعال نیست.');
    const b = body(req);
    if (!isRequestKind(b.kind)) throw new RepoError('invalid', 'نوع کار نامعتبر است.');
    const request = typeof b.request === 'string' ? b.request.trim() : '';
    const record = b.record === true;
    if (record && !request) throw new RepoError('invalid', 'درخواست را یک خط بنویس.');
    if (b.thoughtIds !== undefined && (!Array.isArray(b.thoughtIds) || b.thoughtIds.some((id: unknown) => typeof id !== 'string'))) {
      throw new RepoError('invalid', 'فهرست فکرهای انتخاب‌شده معتبر نیست.');
    }
    const thoughtIds = Array.isArray(b.thoughtIds) ? [...new Set((b.thoughtIds as string[]).filter(Boolean))] : undefined;
    if (thoughtIds && thoughtIds.length > 12) throw new RepoError('invalid', 'حداکثر ۱۲ فکر را می‌توان برای یک درخواست انتخاب کرد.');
    const wanted = typeof b.packId === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(b.packId) ? b.packId : newId('rq');
    const r = renderAiRequest(repo, s, {
      kind: b.kind, request, scopeNodeId: typeof b.scopeNodeId === 'string' && b.scopeNodeId ? b.scopeNodeId : undefined,
      scopeNodeIds: Array.isArray(b.scopeNodeIds) ? b.scopeNodeIds.filter((x): x is string => typeof x === 'string').slice(0, 40) : undefined, withChildren: typeof b.withChildren === 'boolean' ? b.withChildren : undefined,
      tokenBudget: typeof b.tokenBudget === 'number' ? b.tokenBudget : undefined,
      extraIds: Array.isArray(b.extraIds) ? b.extraIds.filter((x): x is string => typeof x === 'string').slice(0, 200) : undefined, packId: wanted,
      thoughtIds,
    }, clock());
    if (record && !repo.getPack(s, wanted)) repo.savePack(s, { title: `${KIND_LABEL[b.kind]} — ${request.slice(0, 60)}`, refs: r.refs, tokens: r.tokens }, wanted);
    res.json({ ...r, packId: wanted, recorded: record });
  }));
  router.get('/workspaces/:wid/packs', wrap((req, res) => { res.json({ packs: repo.listPacks(scopeOf(req)) }); }));

  /** pasted answer → blocks: headings first (free, instant), the cheap decision layer only when there are none */
  router.post('/workspaces/:wid/imports/parse', wrap(async (req, res) => {
    const s = scopeOf(req);
    const text = String(body(req).text ?? '').trim();
    if (!text) throw new RepoError('invalid', 'متنی برای وارد کردن چسبانده نشده است.');
    if (text.length > 200_000) throw new RepoError('invalid', 'متن بیش از حد بلند است.');
    const packId = typeof body(req).packId === 'string' && body(req).packId ? String(body(req).packId) : text.match(PACK_MARKER_RE)?.[1];
    const pack = packId ? repo.getPack(s, packId) : undefined;
    let blocks: ParsedBlock[] | null = parseByHeadings(text);
    let method: 'headings' | 'ai' | 'raw' = 'headings';
    let warning: string | undefined;
    if (!blocks) {
      try {
        const ctl = new AbortController();
        res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
        const r = await ai.parseExternal(aiUserOf(req), text, ctl.signal);
        blocks = r.blocks;
        method = 'ai';
        repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'تقسیم پاسخ بیرونی به بلوک', mode: 'import_parse', creditCost: 0, usage: r.usage, id: newId('led') }));
        if (r.truncated) warning = 'متن بلند بود؛ فقط بخش ابتدایی تقسیم شد.';
      } catch (e) {
        // no headings and no AI: keep the text as ONE block — never invent a structure
        blocks = [{ id: 'r1', kind: 'paragraph', title: 'پاسخ چسبانده‌شده', markdown: text, method: 'raw' }];
        method = 'raw';
        warning = `سرتیتر قابل‌تشخیص نبود و تقسیم هوشمند هم انجام نشد (${toAiError(e).message}). متن به‌صورت یک بلوک آمد؛ هر بخش را خودت جدا کن.`;
      }
    }
    res.json({ blocks, method, warning, packId: pack?.id ?? null, packTitle: pack?.title ?? null, packSpecId: pack?.specId ?? null, packDeliverableId: pack?.deliverableId ?? null, usedContext: pack?.refs ?? [], ledger: repo.listLedger(s) });
  }));

  // ── usage meters + manager ledger ────────────────────────────────────
  router.get('/workspaces/:wid/usage', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    const month = clock().toISOString().slice(0, 7);
    res.json({
      planId: ws.planId, month,
      objects: repo.countActiveObjects(s), fileTokens: repo.fileUsage(s, month),
      judgmentsToday: repo.dailyUsage(s, today(), 'judge'), coachToday: repo.dailyUsage(s, today(), 'coach'),
    });
  }));

  // usage counters: any client may add one (a catalog key only); only an admin may read them
  router.post('/usage', wrap((req, res) => { repo.bumpUsage(LOCAL_USER, body(req).feature); res.json({ ok: true }); }));
  router.get('/admin/usage', wrap((_req, res) => {
    if (!deps.admin) throw new RepoError('not_found', 'نمای مدیر فعال نیست (MABDA_ADMIN).');
    res.json({ rows: repo.listUsage(LOCAL_USER) });
  }));
  router.get('/admin/cost-report', wrap((req, res) => {
    if (!deps.admin) throw new RepoError('not_found', 'نمای مدیر فعال نیست (MABDA_ADMIN).');
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : clock().toISOString().slice(0, 7);
    const rows = repo.ledgerByWorkspaceForMonth(month).map((w) => ({ userId: w.userId, workspaceId: w.workspaceId, name: w.name, ...costReport(w.planId, w.entries) }));
    res.json({ month, rows });
  }));

  // ── files ──────────────────────────────────────────────────────────
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  router.get('/workspaces/:wid/files/quota', wrap((req, res) => { res.json(files.quota(scopeOf(req))); }));
  router.post('/workspaces/:wid/files', upload.single('file'), wrap(async (req, res) => {
    const s = scopeOf(req);
    if (!req.file) throw new RepoError('invalid', 'فایلی ارسال نشده است.');
    // browsers send the name as latin1 bytes inside multipart; restore UTF-8 names (Persian file names)
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const nodeId = typeof req.body?.nodeId === 'string' && req.body.nodeId ? req.body.nodeId : undefined;
    res.json(await files.upload(s, { name, mime: req.file.mimetype, buffer: req.file.buffer, nodeId }));
  }));
  router.post('/workspaces/:wid/files/:id/process', wrap(async (req, res) => {
    const s = scopeOf(req);
    const r = await files.process(s, req.params.id, aiUserOf(req));
    res.json({ ...r, workspace: repo.getWorkspace(LOCAL_USER, s.workspaceId), quota: files.quota(s) });
  }));
  router.delete('/workspaces/:wid/files/:id', wrap((req, res) => { repo.deleteFile(scopeOf(req), req.params.id); res.json({ ok: true }); }));

  // ── errors ───────────────────────────────────────────────────────────
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RepoError) return void res.status(err.code === 'not_found' ? 404 : err.code === 'forbidden' ? 403 : 400).json({ error: { code: err.code, message: err.message } });
    if (err instanceof FileExtractError) return void res.status(422).json({ error: { code: 'unreadable', message: err.message } });
    if (err instanceof multer.MulterError) return void res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: err.code, message: err.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل بیشتر از ۲۵ مگابایت است.' : 'ارسال فایل نامعتبر بود.' } });
    const a = toAiError(err);
    res.status(a.kind === 'bad_request' ? 400 : a.kind === 'quota' ? 429 : a.kind === 'disabled' ? 503 : 502).json({ error: a.toInfo() });
  });

  return { router, files };
}
