/**
 * Saved packs: build once, paste anywhere.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import type { SavedPack } from '../../../src/types/index.ts';
import type { Scope } from '../repo.ts';
import { RepoError } from '../repo.ts';
import { renderSavedPack } from '../packs.ts';

export function registerSavedPacksRoutes(ctx: RouteContext): void {
  const { repo, clock, router, scopeOf, body, wrap } = ctx;
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
}
