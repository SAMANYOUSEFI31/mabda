/**
 * Semantic contradictions (plan feature) and the Context Coach (shares the daily judgement cap).
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import type { Scope } from '../repo.ts';
import { AiError } from '../../ai/errors.ts';
import { RepoError, newId } from '../repo.ts';
import { ancestorIds, resolveNodeId } from '../../../src/core/nodeTree.ts';
import { can, entitlementsOf } from '../../../src/core/entitlements.ts';
import { ledgerEntryFromUsage } from '../../../src/core/ledger.ts';
import { pairsToJudge } from '../../../src/core/contradictionCandidates.ts';
import { userOf as aiUserOf } from '../../ai/routes.ts';

export function registerContradictionsRoutes(ctx: RouteContext): void {
  const { repo, ai, router, scopeOf, body, metaOf, wrap, LOCAL_USER, stale, today } = ctx;
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
      const moved = repo.updateObject(s, moveId, { nodeId: String(b.nodeId ?? '') }, metaOf(b, { kind: 'contradiction_resolved', reason: 'تناقض: هر دو درست‌اند؛ بخش‌ها جدا شد' }));
      impact = moved.impact;
      repo.savePairJudgment(s, a, o, { conflict: false, reason: 'هر دو درست‌اند؛ بخش‌ها جدا شد', resolution: 'separated' });
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
}
