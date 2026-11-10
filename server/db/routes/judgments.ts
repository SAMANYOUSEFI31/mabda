/**
 * Decision layer: Gap ambiguity judgments (cached per object version).
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { entitlementsOf } from '../../../src/core/entitlements.ts';
import { ledgerEntryFromUsage } from '../../../src/core/ledger.ts';
import { newId } from '../repo.ts';
import { userOf as aiUserOf } from '../../ai/routes.ts';

export function registerJudgmentsRoutes(ctx: RouteContext): void {
  const { repo, ai, router, scopeOf, body, wrap, LOCAL_USER, today } = ctx;
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
}
