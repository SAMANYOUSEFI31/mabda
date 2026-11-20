/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { tehranDayPlus } from '../../core/tehranDate';
import { tooEarlyWaitDays } from '../../core/assumptions';
import type { ExpectationVerdict } from '../../types';
import type { HomeAction } from '../../core/homeActions';
import { convertedTo } from '../../core/thinkingMarkers';
import { dataApi } from '../../services/dataApi';
import { expectationRows, metricLabel, monitorsDue, unlinkedMetrics } from '../../core/metrics';
import { setPendingMonitorLink } from '../../components/metrics/Monitor';
import { markAddSwitchable } from '../../core/addRequest';
import { homeActions, homeSections } from '../../core/homeActions';
import { track } from '../../services/usage';
import { useEffect, useMemo, useState } from 'react';
import { visibleFeatures } from '../../core/visibleFeatures';
import type { AppCoreScope } from '../shell/useAppCore';
import type { UsageCountersScope } from '../shell/useUsageCounters';
import type { ThinkingItemsScope } from '../thinking/useThinkingItems';
import type { KnowledgeScope } from '../knowledge/useKnowledge';
import type { SearchAndFocusScope } from '../shell/useSearchAndFocus';

export type HomeScope = ReturnType<typeof useHome>;

export function useHome(p: AppCoreScope & UsageCountersScope & ThinkingItemsScope & KnowledgeScope & SearchAndFocusScope) {
  const { aiRequest, attentionGaps, attempt, contradictions, currentWorkspace, data, dueAssumptions, dueDecisions, handlePatchObject, isPacksOpen, nodes, openContext, openThinkingSpace, patch, revealWhenThere, reviewNeeds, savedPackCount, setActiveTab, setFocusAsset, setHomeAllOpen, setSavedPackCount, setWeeklyOpen, stale, thinking, toast, waiting, weekly, weeklyDue, wid, workspaceContexts } = p;
  // ── home: what is worth doing now (three things) and which level-2 features have something in them ──
  const savedPacksWid = currentWorkspace?.id;
  useEffect(() => {
    if (!savedPacksWid) return;
    dataApi.listSavedPacks(savedPacksWid).then((r) => setSavedPackCount(r.packs.length)).catch(() => setSavedPackCount(0));
  }, [savedPacksWid, isPacksOpen, aiRequest]);
  const vf = visibleFeatures({
    now: new Date(), changes: data?.changes ?? [], relationships: data?.relationships ?? [], contradictions: contradictions.length,
    metrics: (data?.metrics ?? []).filter((m) => !m.archived).length, savedPacks: savedPackCount, proposed: workspaceContexts.filter((o) => o.status === 'Proposed').length,
    confirmed: workspaceContexts.filter((o) => o.status === 'Confirmed').length,
  });
  const homeInput = useMemo(() => ({
    now: new Date(),
    stale: stale.map((x) => ({ deliverableId: x.deliverableId, reasons: x.reasons })),
    deliverables: (data?.deliverables ?? []).map((d) => ({ id: d.id, title: d.title, createdAt: d.createdAt })),
    contradictions: contradictions.map((c) => ({ id: c.id, titleA: c.itemA.title, titleB: c.itemB.title, idA: c.itemA.id })),
    reviews: [...reviewNeeds.entries()].map(([id, need]) => ({ id, title: workspaceContexts.find((o) => o.id === id)?.title ?? id, because: need.changedDependencies.map((d) => workspaceContexts.find((o) => o.id === d.id)?.title ?? d.id) })),
    ready: waiting.ready.map((u) => ({ id: u.ids[0], title: workspaceContexts.find((o) => o.id === u.ids[0])?.title ?? u.ids[0] })),
    proposedCount: workspaceContexts.filter((o) => o.status === 'Proposed').length,
    ...(() => { const d = workspaceContexts.filter((o) => o.status === 'Confirmed' && !!o.draft); return { draftCount: d.length, draftOne: d.length === 1 ? { id: d[0].id, title: d[0].title } : undefined }; })(),
    weekly: { due: weeklyDue, changes: weekly.digest.total },
    dueCount: dueAssumptions.length + dueDecisions.length,
    openThinking: thinking.filter((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts)).length,
    // «پایش»: the calm upkeep of a monitored truth (its cadence passed), and numbers not on a truth yet (she links them)
    monitors: monitorsDue(data?.metrics ?? [], data?.measurements ?? [], workspaceContexts, new Date()).map((d) => ({ objectId: d.object.id, title: metricLabel(d.metric, workspaceContexts), cadence: d.metric.cadence!, never: !d.last })),
    unlinked: unlinkedMetrics(data?.metrics ?? []).map((m) => ({ id: m.id, name: m.name })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stale, data?.deliverables, contradictions.length, reviewNeeds, waiting, weeklyDue, dueAssumptions.length, dueDecisions.length, workspaceContexts, thinking, data?.metrics, data?.measurements]);
  const homePlan = useMemo(() => homeActions(homeInput), [homeInput]);
  // patterns.md §۸: «منتظر تو» › «چه چیزی کم است» › «قدیمی‌شده‌ها»
  const homeView = useMemo(() => homeSections(homeInput, attentionGaps), [homeInput, attentionGaps]);
  const [linkingMetricId, setLinkingMetricId] = useState('');
  /** a NEW truth named after the number, carrying its history; she writes what is true and saves (Mabda never writes it for her) */
  const newLinkedTruth = (metricId: string) => {
    const m = (data?.metrics ?? []).find((x) => x.id === metricId);
    setLinkingMetricId('');
    if (!m) return;
    const at = new Date().toISOString();
    markAddSwitchable(false);
    setPendingMonitorLink(m.id);
    openContext({ id: '', workspaceId: wid, type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: m.name, content: '', nodeId: '', version: 1, createdAt: at, updatedAt: at });
  };
  /** onto a truth she already has: the number and its history move there, and the truth opens with its monitor */
  const linkToTruth = async (metricId: string, objectId: string) => {
    const r = await attempt(() => dataApi.updateMetric(wid, metricId, { objectId }));
    if (!r) return;
    patch((d) => ({ ...d, metrics: r.metrics, measurements: r.measurements, ...(r.stale ? { stale: r.stale } : {}) }));
    setLinkingMetricId('');
    toast.show({ intent: 'success', message: 'عددها روی این حقیقت آمدند.' });
    const o = workspaceContexts.find((x) => x.id === objectId);
    if (o) openContext(o);
  };
  const handleHomeAct = (a: HomeAction) => {
    track('action.home-todo');
    const reveal = (id: string) => { setHomeAllOpen(true); revealWhenThere(id); };
    const t = a.target;
    if (t.type === 'asset') { setActiveTab('assets'); setFocusAsset({ id: t.id, n: Date.now() }); }
    else if (t.type === 'object') { const o = workspaceContexts.find((x) => x.id === t.id); if (o) openContext(o); }
    // «وصل کردن»: a truth she already has first, or a new one with the number's name (LinkMetricDialog)
    else if (t.type === 'link-metric') setLinkingMetricId(t.id);
    else if (t.type === 'weekly') setWeeklyOpen(true);
    else if (t.type === 'contradictions') reveal('contradictions');
    else if (t.type === 'proposals') reveal('proposal-inbox');
    else if (t.type === 'thinking') openThinkingSpace();
    else reveal('open-thinking'); // «due»
  };
  const plusDays = (n: number) => tehranDayPlus(n); // calendar days in Tehran (core/tehranDate.ts)
  const metrics = data?.metrics ?? [];
  const measurements = data?.measurements ?? [];
  const expRows = useMemo(() => expectationRows(data?.objects ?? [], metrics, measurements, data?.changes ?? [], new Date()), [data?.objects, data?.metrics, data?.measurements, data?.changes]);
  const dueProps = {
    assumptions: dueAssumptions, decisions: dueDecisions, titleOfNode: (id: string) => nodes.find((n) => n.id === id)?.label ?? id,
    onStillAssumed: async (id: string) => { await handlePatchObject(id, { reviewBy: plusDays(30), reason: 'بازبینی: هنوز فرض است' }); },
    onConfirmed: async (id: string) => { await handlePatchObject(id, { assumption: false, status: 'Confirmed', reason: 'بازبینی: فرض به واقعیت تبدیل شد' }); },
    onDropped: async (id: string) => { await handlePatchObject(id, { status: 'Archived', reason: 'بازبینی: فرض رد شد' }); },
    // «هنوز زود است»: the next look comes when there can be new evidence (core/assumptions.ts tooEarlyWaitDays)
    onTooEarly: async (id: string) => {
      const o = (data?.objects ?? []).find((x) => x.id === id); if (!o) return;
      const m = metrics.find((x) => x.id === o.record?.metricExpectation?.metricId);
      const days = tooEarlyWaitDays({ cadence: m?.cadence, decidedAt: o.createdAt, reviewOn: o.record?.reviewOn });
      await handlePatchObject(id, { record: { ...(o.record ?? {}), reviewOn: plusDays(days) }, reason: 'نگاه به عقب: هنوز زود است' });
    },
    onOutcome: async (id: string, text: string, verdict?: ExpectationVerdict) => {
      const r = await attempt(() => dataApi.noteOutcome(wid, id, text, verdict));
      if (r) { patch((d) => ({ ...d, changes: r.changes })); toast.show({ intent: 'success', message: 'نتیجه ثبت شد.' }); }
    },
    expectations: expRows,
  };
  return { vf, homePlan, homeView, handleHomeAct, metrics, measurements, expRows, dueProps, linkingMetricId, setLinkingMetricId, newLinkedTruth, linkToTruth };
}
