/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExpectationVerdict } from '../../types';
import type { HomeAction } from '../../core/homeActions';
import { convertedTo } from '../../core/thinkingMarkers';
import { dataApi } from '../../services/dataApi';
import { expectationRows, expectationsDue, metricsWithoutRecentNumber, verdictTally } from '../../core/metrics';
import { homeActions } from '../../core/homeActions';
import { track } from '../../services/usage';
import { useEffect, useMemo } from 'react';
import { visibleFeatures } from '../../core/visibleFeatures';
import type { AppCoreScope } from '../shell/useAppCore';
import type { UsageCountersScope } from '../shell/useUsageCounters';
import type { ThinkingItemsScope } from '../thinking/useThinkingItems';
import type { KnowledgeScope } from '../knowledge/useKnowledge';
import type { SearchAndFocusScope } from '../shell/useSearchAndFocus';

export type HomeScope = ReturnType<typeof useHome>;

export function useHome(p: AppCoreScope & UsageCountersScope & ThinkingItemsScope & KnowledgeScope & SearchAndFocusScope) {
  const { aiRequest, attempt, contradictions, currentWorkspace, data, dueAssumptions, dueDecisions, handlePatchObject, isPacksOpen, nodes, openContext, openThinkingSpace, patch, revealWhenThere, reviewNeeds, savedPackCount, setActiveTab, setFocusAsset, setHomeAllOpen, setSavedPackCount, setWeeklyOpen, stale, thinking, toast, waiting, weekly, weeklyDue, wid, workspaceContexts } = p;
  // ── home: what is worth doing now (three things) and which level-2 features have something in them ──
  const savedPacksWid = currentWorkspace?.id;
  useEffect(() => {
    if (!savedPacksWid) return;
    dataApi.listSavedPacks(savedPacksWid).then((r) => setSavedPackCount(r.packs.length)).catch(() => setSavedPackCount(0));
  }, [savedPacksWid, isPacksOpen, aiRequest]);
  const vf = visibleFeatures({
    now: new Date(), changes: data?.changes ?? [], relationships: data?.relationships ?? [], contradictions: contradictions.length,
    metrics: (data?.metrics ?? []).filter((m) => !m.archived).length, savedPacks: savedPackCount, proposed: workspaceContexts.filter((o) => o.status === 'Proposed').length,
  });
  const homePlan = useMemo(() => homeActions({
    now: new Date(),
    stale: stale.map((x) => ({ deliverableId: x.deliverableId, reasons: x.reasons })),
    deliverables: (data?.deliverables ?? []).map((d) => ({ id: d.id, title: d.title, createdAt: d.createdAt })),
    contradictions: contradictions.map((c) => ({ id: c.id, titleA: c.itemA.title, titleB: c.itemB.title, idA: c.itemA.id })),
    reviews: [...reviewNeeds.entries()].map(([id, need]) => ({ id, title: workspaceContexts.find((o) => o.id === id)?.title ?? id, because: need.changedDependencies.map((d) => workspaceContexts.find((o) => o.id === d.id)?.title ?? d.id) })),
    ready: waiting.ready.map((u) => ({ id: u.ids[0], title: workspaceContexts.find((o) => o.id === u.ids[0])?.title ?? u.ids[0] })),
    proposedCount: workspaceContexts.filter((o) => o.status === 'Proposed').length,
    weekly: { due: weeklyDue, changes: weekly.digest.total },
    dueCount: dueAssumptions.length + dueDecisions.length,
    openThinking: thinking.filter((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts)).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stale, data?.deliverables, contradictions.length, reviewNeeds, waiting, weeklyDue, dueAssumptions.length, dueDecisions.length, workspaceContexts, thinking]);
  const handleHomeAct = (a: HomeAction) => {
    track('action.home-todo');
    const reveal = (id: string) => { setHomeAllOpen(true); revealWhenThere(id); };
    const t = a.target;
    if (t.type === 'asset') { setActiveTab('assets'); setFocusAsset({ id: t.id, n: Date.now() }); }
    else if (t.type === 'object') { const o = workspaceContexts.find((x) => x.id === t.id); if (o) openContext(o); }
    else if (t.type === 'weekly') setWeeklyOpen(true);
    else if (t.type === 'contradictions') reveal('contradictions');
    else if (t.type === 'proposals') reveal('proposal-inbox');
    else if (t.type === 'thinking') openThinkingSpace();
    else reveal('open-thinking'); // «due»
  };
  const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const metrics = data?.metrics ?? [];
  const measurements = data?.measurements ?? [];
  const expRows = useMemo(() => expectationRows(data?.objects ?? [], metrics, measurements, data?.changes ?? [], new Date()), [data?.objects, data?.metrics, data?.measurements, data?.changes]);
  const tally = useMemo(() => verdictTally(expRows), [expRows]);
  const quietMetrics = useMemo(() => metricsWithoutRecentNumber(metrics, measurements, new Date()), [data?.metrics, data?.measurements]);
  const expectationsDueCount = useMemo(() => expectationsDue(expRows, new Date()).length, [expRows]);
  const dueProps = {
    assumptions: dueAssumptions, decisions: dueDecisions, titleOfNode: (id: string) => nodes.find((n) => n.id === id)?.label ?? id,
    onStillAssumed: async (id: string) => { await handlePatchObject(id, { reviewBy: plusDays(30), reason: 'بازبینی: هنوز فرض است' }); },
    onConfirmed: async (id: string) => { await handlePatchObject(id, { assumption: false, status: 'Confirmed', reason: 'بازبینی: فرض به واقعیت تبدیل شد' }); },
    onDropped: async (id: string) => { await handlePatchObject(id, { status: 'Archived', reason: 'بازبینی: فرض رد شد' }); },
    onOutcome: async (id: string, text: string, verdict?: ExpectationVerdict) => {
      const r = await attempt(() => dataApi.noteOutcome(wid, id, text, verdict));
      if (r) { patch((d) => ({ ...d, changes: r.changes })); toast.show({ intent: 'success', message: 'نتیجه ثبت شد.' }); }
    },
    expectations: expRows,
  };
  return { vf, homePlan, handleHomeAct, metrics, measurements, expRows, tally, quietMetrics, expectationsDueCount, dueProps };
}
