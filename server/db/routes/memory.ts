/**
 * Memory of another AI → PROPOSED objects, and extracting an output into proposals.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { AiError } from '../../ai/errors.ts';
import { RepoError, newId } from '../repo.ts';
import { defaultNodeId } from '../../../src/core/nodeTree.ts';
import { entitlementsOf } from '../../../src/core/entitlements.ts';
import { ledgerEntryFromUsage } from '../../../src/core/ledger.ts';
import { userOf as aiUserOf } from '../../ai/routes.ts';

export function registerMemoryRoutes(ctx: RouteContext): void {
  const { repo, ai, router, scopeOf, body, wrap, LOCAL_USER, today } = ctx;
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
}
