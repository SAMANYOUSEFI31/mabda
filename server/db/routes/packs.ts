/**
 * Context pack (copy for any AI), AI requests and the pasted-answer import.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { ParsedBlock } from '../../../src/core/answerParser.ts';
import type { RouteContext } from './context.ts';
import type { Scope } from '../repo.ts';
import { KIND_LABEL, isRequestKind } from '../../../src/core/aiRequest.ts';
import { PACK_MARKER_RE, buildContextPack } from '../../../src/core/contextPack.ts';
import { RepoError, newId } from '../repo.ts';
import { enabledBuiltInSpecs } from '../../../src/core/specs.ts';
import { ledgerEntryFromUsage } from '../../../src/core/ledger.ts';
import { parseByHeadings } from '../../../src/core/answerParser.ts';
import { renderAiRequest } from '../aiRequests.ts';
import { toAiError } from '../../ai/errors.ts';
import { userOf as aiUserOf } from '../../ai/routes.ts';

export function registerPacksRoutes(ctx: RouteContext): void {
  const { repo, ai, clock, router, scopeOf, body, wrap, userOf } = ctx;
  const specList = (s: Scope) => [...repo.listSpecs(s), ...enabledBuiltInSpecs(repo.getWorkspace(s.userId, s.workspaceId))];
  router.post('/workspaces/:wid/packs', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(s.userId, s.workspaceId)!;
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
    const ws = repo.getWorkspace(s.userId, s.workspaceId)!;
    const b = body(req);
    if (!isRequestKind(b.kind)) throw new RepoError('invalid', 'نوع کار نامعتبر است.');
    const request = typeof b.request === 'string' ? b.request.trim() : '';
    const record = b.record === true;
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
    // the line is optional (decisions.md §۲۴): without it the record is named by where it is about, like a saved pack is
    const scopeIds = Array.isArray(b.scopeNodeIds) ? b.scopeNodeIds.filter((x): x is string => typeof x === 'string').slice(0, 40) : typeof b.scopeNodeId === 'string' && b.scopeNodeId ? [b.scopeNodeId] : [];
    const where = scopeIds.length ? scopeIds.map((id) => repo.listNodes(s).find((n) => n.id === id)?.label ?? '').filter(Boolean).join('، ').slice(0, 60) : `کل ${ws.name}`;
    // what was asked, kept with the record so «درخواست دوباره» opens the same request (kind, line, sections), not an empty one
    const spec = { kind: b.kind, request, scopeNodeIds: scopeIds, withChildren: typeof b.withChildren === 'boolean' ? b.withChildren : undefined, extraIds: Array.isArray(b.extraIds) ? b.extraIds.filter((x): x is string => typeof x === 'string').slice(0, 200) : [] };
    if (record && !repo.getPack(s, wanted)) repo.savePack(s, { title: `${KIND_LABEL[b.kind]} — ${(request || where).slice(0, 60)}`, refs: r.refs, tokens: r.tokens, request: spec }, wanted);
    res.json({ ...r, packId: wanted, recorded: record });
  }));
  router.get('/workspaces/:wid/packs', wrap((req, res) => { res.json({ packs: repo.listPacks(scopeOf(req)) }); }));
  router.get('/workspaces/:wid/packs/:id', wrap((req, res) => {
    const p = repo.getPack(scopeOf(req), req.params.id);
    if (!p) throw new RepoError('not_found', 'این بسته پیدا نشد.');
    res.json({ pack: p });
  }));

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
        repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'تقسیم پاسخ بیرونی به بلوک', mode: 'import_parse', usage: r.usage, id: newId('led') }));
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
}
