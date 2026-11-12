/**
 * Focused thread on one node: context = node + parents, output = Proposed objects for THIS node.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { RepoError, newId } from '../repo.ts';
import { clampProposal } from '../../ai/service.ts';
import { ledgerEntryFromUsage } from '../../../src/core/ledger.ts';
import { userOf as aiUserOf } from '../../ai/routes.ts';

export function registerThreadsRoutes(ctx: RouteContext): void {
  const { repo, ai, router, scopeOf, body, wrap, deps } = ctx;
  router.post('/workspaces/:wid/threads/:nodeId/turn', wrap(async (req, res) => {
    const s = scopeOf(req);
    if (!deps.source) throw new RepoError('invalid', 'منبع Context برای گفتگوی متمرکز تنظیم نشده است.');
    const node = repo.listNodes(s).find((n) => n.id === req.params.nodeId);
    if (!node) throw new RepoError('not_found', 'بخش پیدا نشد.');
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
    if (!node) throw new RepoError('not_found', 'بخش پیدا نشد.');
    const transcript = (Array.isArray(body(req).transcript) ? body(req).transcript : []).filter((m: any) => m && typeof m.content === 'string').map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    if (!transcript.length) throw new RepoError('invalid', 'گفتگویی برای خلاصه کردن نیست.');
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.threadSummary(aiUserOf(req), { nodeLabel: node.label, transcript }, ctl.signal);
    const note = repo.createNote(s, node.id, `خلاصهٔ گفتگوی متمرکز:\n${r.summary}`);
    repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: `خلاصهٔ گفتگوی متمرکز · ${node.label}`, mode: 'thread', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ note, ledger: repo.listLedger(s) });
  }));
}
