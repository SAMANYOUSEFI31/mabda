/**
 * Notes (never injected into the model) and Thoughts: revise, derive, resolve, promote, split; outcomes. Kept in the original registration order.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import type { ThinkingKind } from '../../../src/core/thinkingMarkers.ts';
import { RepoError } from '../repo.ts';
import { can } from '../../../src/core/entitlements.ts';
import { findItem, headingSections, parseThinking } from '../../../src/core/thinkingMarkers.ts';
import { guessTitle } from '../../../src/core/knowledgeGuess.ts';

export function registerNotesThoughtsRoutes(ctx: RouteContext): void {
  const { repo, router, scopeOf, body, metaOf, wrap } = ctx;
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
    res.json({ thought: repo.reclassifyThought(scopeOf(req), req.params.id, b.kind as import('../../../src/types/index.ts').ThoughtKind) });
  }));
  router.post('/workspaces/:wid/thoughts/derive', wrap((req, res) => {
    const b = body(req);
    const parentIds = Array.isArray(b.parentIds) ? b.parentIds.filter((id): id is string => typeof id === 'string') : [];
    if (!['idea', 'question', 'assumption', 'open_decision'].includes(String(b.kind))) throw new RepoError('invalid', 'نوع فکر معتبر نیست.');
    res.json(repo.deriveThought(scopeOf(req), { parentIds, nodeId: String(b.nodeId ?? ''), kind: b.kind as import('../../../src/types/index.ts').ThoughtKind, text: String(b.text ?? '') }));
  }));
  router.post('/workspaces/:wid/thoughts/:id/resolve', wrap((req, res) => {
    const b = body(req);
    res.json({ thought: repo.resolveThought(scopeOf(req), req.params.id, { ...(typeof b.objectId === 'string' ? { objectId: b.objectId } : {}), ...(typeof b.nodeId === 'string' ? { nodeId: b.nodeId } : {}) }) });
  }));
  router.get('/workspaces/:wid/thoughts/:id/history', wrap((req, res) => {
    res.json(repo.getThoughtHistory(scopeOf(req), req.params.id));
  }));
  router.post('/workspaces/:wid/thoughts/:id/about', wrap((req, res) => {
    const b = body(req);
    const targets = Array.isArray(b.targets) ? b.targets : [];
    res.json({ thought: repo.setThoughtAbout(scopeOf(req), req.params.id, targets) });
  }));
  router.post('/workspaces/:wid/thoughts/:id/split', wrap((req, res) => {
    const b = body(req);
    const children = Array.isArray(b.children) ? b.children : [];
    res.json(repo.splitThought(scopeOf(req), req.params.id, children));
  }));
  router.post('/workspaces/:wid/thoughts/:id/promote', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    if (!['Fact', 'Decision', 'Constraint'].includes(String(b.type))) throw new RepoError('invalid', 'نوع دانش مقصد را انتخاب کن.');
    const thought = repo.getThought(s, req.params.id);
    if (!thought || !thought.kind) throw new RepoError('not_found', 'فکر قابل تبدیل پیدا نشد.');
    const type = b.type as import('../../../src/types/index.ts').ContextType;
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
  // `?thoughts=remove`: the note's OPEN thoughts go with it; by default they stay and say «یادداشت حذف شد»
  router.delete('/workspaces/:wid/notes/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const note = repo.getNote(s, req.params.id);
    const position = note ? repo.notePosition(s, note.id) : undefined;
    const r = repo.deleteNote(s, req.params.id, { removeThoughts: req.query.thoughts === 'remove' });
    res.json({ ok: true, note, position, ...r, thoughts: repo.listThoughts(s, { includeResolved: true }) });
  }));
  router.post('/workspaces/:wid/notes/restore', wrap((req, res) => { const s = scopeOf(req); const b = body(req); res.json({ note: repo.restoreNote(s, b.note as never, b.position as never), thoughts: repo.listThoughts(s, { includeResolved: true }) }); }));

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
      type: b.type as import('../../../src/types/index.ts').ContextType, status: 'Proposed', provenance: 'User Input', title, content: thought.text, nodeId: thought.nodeId,
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
}
