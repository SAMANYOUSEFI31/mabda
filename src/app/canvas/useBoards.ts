/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CanvasBundle } from '../../services/dataApi';
import type { MovePayload } from '../../components/canvas/ContextCanvas';
import type { VersionBaseline } from '../../core/judgePolicy';
import { ContextDraft, ContextObject, Contradiction } from '../../types';
import { JUDGE_SETTLE_MS, baselineOf, changedSince, pairsAfterChange } from '../../core/judgePolicy';
import { can } from '../../core/entitlements';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import { useEffect, useRef, useState } from 'react';
import type { AppCoreScope } from '../shell/useAppCore';
import type { SearchAndFocusScope } from '../shell/useSearchAndFocus';
import type { UsageCountersScope } from '../shell/useUsageCounters';

export type BoardsScope = ReturnType<typeof useBoards>;

export function useBoards(p: AppCoreScope & SearchAndFocusScope & UsageCountersScope) {
  const { ai, attempt, data, deliverables, patch, reload, showImpact, toast, wid, workspaceContexts } = p;
  // ── boards: every action returns the pieces of state it touched ──
  const applyBundle = (r: CanvasBundle) => patch((d) => ({ ...d, objects: r.objects, relationships: r.relationships, changes: r.changes, notes: r.notes, thoughts: r.thoughts, stale: r.stale, canvas: r.canvas }));
  const handleCanvasMove = async (m: MovePayload) => {
    const before = data?.objects.find((o) => o.id === m.objectId);
    const r = await attempt(() => dataApi.canvasMove(wid, m));
    if (!r) return;
    applyBundle(r);
    const after = r.objects.find((o) => o.id === m.objectId);
    if (before?.status === 'Proposed' && after?.status === 'Confirmed') {
      const used = deliverables.filter((d) => d.usedContext?.some((u) => u.id === m.objectId)).length;
      toast.show({ intent: 'success', message: used ? `«${after.title}» تأیید شد؛ ${formatNumber(used)} خروجی تو از آن استفاده می‌کنند.` : `«${after.title}» تأیید شد و حالا واقعیت است.` });
    }
  };
  const handleCanvasConnect = async (c: Parameters<typeof dataApi.canvasConnect>[1]) => {
    const r = await attempt(() => dataApi.canvasConnect(wid, c));
    if (r) applyBundle(r);
  };
  const handleFreeNoteCreate = async (n: { content: string; x: number; y: number; nodeId?: string }) => {
    const r = await attempt(() => dataApi.freeNoteCreate(wid, n));
    if (r) applyBundle(r);
  };
  const handleFreeNoteMove = (id: string, x: number, y: number) => {
    patch((d) => ({ ...d, canvas: { ...d.canvas, free: d.canvas.free.map((i) => (i.itemRef === `note:${id}` ? { ...i, x, y } : i)) } }));
    void attempt(() => dataApi.freeNoteMove(wid, id, x, y));
  };
  const handlePlaceObject = async (id: string, x: number, y: number) => {
    patch((d) => ({ ...d, canvas: { ...d.canvas, free: d.canvas.free.some((i) => i.itemRef === `obj:${id}`) ? d.canvas.free.map((i) => (i.itemRef === `obj:${id}` ? { ...i, x, y } : i)) : [...d.canvas.free, { itemRef: `obj:${id}`, x, y }] } }));
    const r = await attempt(() => dataApi.freeObjectPlace(wid, id, x, y));
    if (r) patch((d) => ({ ...d, canvas: r.canvas }));
  };
  const handleUnplaceObject = async (id: string) => {
    const r = await attempt(() => dataApi.freeObjectRemove(wid, id));
    if (r) patch((d) => ({ ...d, canvas: r.canvas }));
  };
  const handleNoteToKnowledge = async (id: string, type: 'Fact' | 'Decision' | 'Constraint') => {
    const r = await attempt(() => dataApi.freeNoteToKnowledge(wid, id, type));
    if (r) { applyBundle(r); toast.show({ intent: 'success', message: 'یک قلم پیشنهادی ساخته شد؛ در ستون «در فکر» منتظر تأیید توست.' }); }
  };
  const handleAutoLayout = async () => {
    const a = await attempt(() => dataApi.canvasReset(wid));
    const b = a && await attempt(() => dataApi.freeReset(wid));
    if (b) applyBundle(b);
  };

  /** «تأیید و جایگزین کن» / «رد کن» for the unapproved rewrite of a confirmed knowledge */
  const handleApproveDraft = async (objectId: string) => {
    const r = await attempt(() => dataApi.approveDraft(wid, objectId));
    if (!r) return;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === r.object.id ? r.object : o)), stale: r.stale }));
    showImpact(r.impact);
    void reload(wid);
  };
  const handleRejectDraft = async (objectId: string) => {
    const r = await attempt(() => dataApi.rejectDraft(wid, objectId));
    if (!r) return;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === r.object.id ? r.object : o)) }));
    toast.show({ intent: 'info', message: 'پیش‌نویس رد شد؛ متن تأییدشده همان بود.' });
  };
  const handleSetDependencies = async (objectId: string, dependsOn: string[]) => {
    const r = await attempt(() => dataApi.setDependencies(wid, objectId, dependsOn));
    if (r) patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes, stale: r.stale }));
  };
  /** «بدون تغییر بپذیر» — writes a review_accepted Change; the derived «needs review» state disappears */
  const handleAcceptReview = async (objectId: string, quiet = false) => {
    const r = await attempt(() => dataApi.acceptReview(wid, objectId));
    if (!r) return;
    patch((d) => ({ ...d, changes: r.changes, stale: r.stale }));
    if (!quiet) toast.show({ intent: 'success', message: 'بدون تغییر پذیرفته شد؛ در تاریخچه ثبت شد.' });
  };

  const handleSupersedeContext = async (oldId: string, input: ContextDraft, reason?: string) => {
    const r = await attempt(() => dataApi.supersedeObject(wid, oldId, { type: input.type, status: input.status, provenance: input.provenance, title: input.title, content: input.content, nodeId: input.nodeId, ...(reason ? { reason } : {}) }));
    if (!r) return;
    patch((d) => ({ ...d, objects: [r.object, ...d.objects.map((o) => (o.id === oldId ? r.previous : o))], relationships: r.relationships, stale: r.stale }));
    showImpact(r.impact);
  };

  const setStatus = async (id: string, status: ContextObject['status'], reason?: string) => {
    const r = await attempt(() => dataApi.updateObject(wid, id, { status, ...(reason ? { reason } : {}) }));
    if (!r) return undefined;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? r.object : o)), stale: r.stale }));
    return r.impact;
  };

  /** «بایگانی» is the default way to take knowledge away: history, versions and sources stay; «برگرداندن» puts it back as it was */
  const handleArchiveContext = async (id: string) => {
    const o0 = workspaceContexts.find((x) => x.id === id);
    const impact = await setStatus(id, 'Archived');
    if (impact) showImpact(impact);
    if (o0) toast.show({ intent: 'success', message: `«${o0.title}» بایگانی شد؛ تاریخچه‌اش می‌ماند.`, duration: 10000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.restoreObject(wid, id)).then((r) => { if (r) patch((d) => ({ ...d, objects: d.objects.map((x) => (x.id === id ? r.object : x)), stale: r.stale })); }); } } });
  };

  /** conflict: keep one (the other becomes Superseded) */
  const handleKeepContradiction = async (c: Contradiction, keepId: string) => {
    const r = await attempt(() => dataApi.resolveContradiction(wid, { aId: c.itemA.id, bId: c.itemB.id, action: 'keep', keepId }));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects, relationships: r.relationships, pairJudgments: r.pairJudgments, stale: r.stale }));
    showImpact(r.impact);
    toast.show({ intent: 'success', message: 'تناقض حل شد؛ مورد دیگر «جایگزین‌شده» است و در تاریخچه می‌ماند.' });
  };
  /** both claims hold: move one claim to another node */
  const handleSeparateContradiction = async (c: Contradiction, moveId: string, nodeId: string) => {
    const r = await attempt(() => dataApi.resolveContradiction(wid, { aId: c.itemA.id, bId: c.itemB.id, action: 'separate', moveId, nodeId }));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects, pairJudgments: r.pairJudgments, stale: r.stale }));
    showImpact(r.impact);
    toast.show({ intent: 'success', message: 'گره‌ها جدا شدند و دیگر با هم رقابت نمی‌کنند.' });
  };

  // semantic contradictions (Pro and above, needs an AI key). The judge NEVER runs because a workspace was opened, built or
  // reset: only (a) after an object of a candidate pair changed in this session and has no fresh judgement (settle first),
  // or (b) from the «بررسی تناقض» button. Policy and the pure rules: src/core/judgePolicy.ts
  const baselineRef = useRef<{ wid: string; versions: VersionBaseline } | null>(null);
  const [judging, setJudging] = useState(false);
  const [judgedToday, setJudgedToday] = useState<number | null>(null);
  const canJudge = !!data && can(data.workspace.planId, 'semanticContradiction') && ai.judgmentsAvailable;
  const refreshJudged = () => { dataApi.usage(wid).then((u) => setJudgedToday(u.judgmentsToday)).catch(() => { /* the meter is optional */ }); };
  const runJudge = async (objectIds?: string[]) => {
    setJudging(true);
    try {
      const r = await dataApi.judgeContradictions(wid, objectIds);
      patch((d) => ({ ...d, pairJudgments: r.pairJudgments, ledger: r.ledger }));
      refreshJudged();
      return r;
    } finally { setJudging(false); }
  };
  const handleCheckContradictions = async () => {
    try {
      const r = await runJudge();
      toast.show({ intent: 'success', message: r.judged ? `${formatNumber(r.judged)} جفت بررسی شد.${r.limited ? ' به سقف امروز رسیدی؛ بقیه فردا.' : ''}` : 'جفت تازه‌ای برای بررسی نبود.' });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof Error ? e.message : 'بررسی تناقض انجام نشد؛ دوباره.' }); }
  };
  const changedSig = (() => {
    if (!data || !canJudge) return '';
    if (!baselineRef.current || baselineRef.current.wid !== data.workspace.id) return '';
    return pairsAfterChange(data.objects, data.pairJudgments, baselineRef.current.versions, data.relationships, data.nodes).map((p) => `${p.key}@${p.a.version}.${p.b.version}`).join(',');
  })();
  useEffect(() => {
    if (!data) { baselineRef.current = null; return; }
    if (!baselineRef.current || baselineRef.current.wid !== data.workspace.id) baselineRef.current = { wid: data.workspace.id, versions: baselineOf(data.objects) };
  }, [data]);
  useEffect(() => {
    if (!changedSig || !baselineRef.current) return;
    const ids = [...changedSince(data!.objects, baselineRef.current.versions)];
    const timer = setTimeout(() => { void runJudge(ids).catch(() => { /* optional: the rule-based checks still run */ }); }, JUDGE_SETTLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedSig]);
  useEffect(() => { if (canJudge) refreshJudged(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canJudge, wid]);
  return { handleCanvasMove, handleCanvasConnect, handleFreeNoteCreate, handleFreeNoteMove, handlePlaceObject, handleUnplaceObject, handleNoteToKnowledge, handleAutoLayout, handleApproveDraft, handleRejectDraft, handleSetDependencies, handleAcceptReview, handleSupersedeContext, setStatus, handleArchiveContext, handleKeepContradiction, handleSeparateContradiction, judging, judgedToday, canJudge, handleCheckContradictions };
}
