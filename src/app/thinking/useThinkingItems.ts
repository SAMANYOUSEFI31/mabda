/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { ContextObject, ThoughtKind } from '../../types';
import { assumptionsDue, decisionsDue } from '../../core/assumptions';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import { thinkingSpace } from '../../core/thinkingSpace';
import { thoughtItem } from '../../core/thinkingMarkers';
import { useMemo } from 'react';
import type { AppCoreScope } from '../shell/useAppCore';

export type ThinkingItemsScope = ReturnType<typeof useThinkingItems>;

export function useThinkingItems(p: AppCoreScope) {
  const { attempt, data, nodes, patch, setAiRequest, toast, wid, workspaceContexts } = p;
  // ── thinking items (derived from note lines; src/core/thinkingMarkers.ts) ──
  const thinking = useMemo(() => (data?.thoughts ?? []).map(thoughtItem).filter((t): t is NoteThinkingItem => !!t), [data?.thoughts]);
  /** «N فکر باز» per node: open thoughts + what waits for approval (one pass, not one per node) */
  const openCounts = useMemo(() => {
    const m = new Map<string, number>();
    const v = thinkingSpace({ objects: workspaceContexts, notes: data?.notes ?? [], thoughts: thinking, nodes });
    for (const w of v.waiting) m.set(w.object.nodeId, (m.get(w.object.nodeId) ?? 0) + 1);
    for (const t of v.thoughts) m.set(t.nodeId, (m.get(t.nodeId) ?? 0) + 1);
    return m;
  }, [workspaceContexts, data?.notes, nodes]);
  const handleConvertItem = async (item: NoteThinkingItem, type: ContextObject['type']) => {
    if (!item.id) return;
    const r = await attempt(() => dataApi.convertThinkingItem(wid, item.id!, type));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects, thoughts: r.thoughts }));
    toast.show({ intent: 'success', message: 'به‌صورت پیشنهادی ثبت شد؛ در صندوق پیشنهادها منتظر تأیید توست و فکر به‌تنهایی حقیقت نمی‌شود.' });
  };
  const handleReviseThought = async (item: NoteThinkingItem, text: string, kind: ThoughtKind): Promise<boolean> => {
    if (!item.id) return false;
    if (text !== item.text) {
      const r = await attempt(() => dataApi.reviseThought(wid, item.id!, text));
      if (!r) return false;
      patch((d) => ({ ...d, thoughts: d.thoughts.map((t) => t.id === item.id ? r.thought : t) }));
    }
    if (kind !== item.kind) {
      const r = await attempt(() => dataApi.reclassifyThought(wid, item.id!, kind));
      if (!r) return false;
      patch((d) => ({ ...d, thoughts: d.thoughts.map((t) => t.id === item.id ? r.thought : t) }));
    }
    toast.show({ intent: 'success', message: 'فکر به‌روزرسانی شد؛ شناسه و پیوندهایش حفظ شدند.' });
    return true;
  };
  const handleDeriveThought = async (item: NoteThinkingItem, text: string, kind: ThoughtKind): Promise<boolean> => {
    if (!item.id) return false;
    const r = await attempt(() => dataApi.deriveThought(wid, { parentIds: [item.id!], nodeId: item.nodeId, kind, text }));
    if (!r) return false;
    patch((d) => ({ ...d, thoughts: [...d.thoughts, r.thought] }));
    toast.show({ intent: 'success', message: 'فکر تازه ساخته شد؛ فکر مبدأ دست‌نخورده ماند.' });
    return true;
  };
  const handleSynthesizeThought = async (parentIds: string[], nodeId: string, kind: ThoughtKind, text: string): Promise<boolean> => {
    const r = await attempt(() => dataApi.deriveThought(wid, { parentIds, nodeId, kind, text }));
    if (!r) return false;
    patch((d) => ({ ...d, thoughts: [...d.thoughts, r.thought] }));
    toast.show({ intent: 'success', message: `فکر ترکیبی از ${formatNumber(parentIds.length)} فکر ساخته شد؛ فکرهای مبدأ دست‌نخورده ماندند.` });
    return true;
  };
  const startThoughtAi = (ids: string[]) => {
    const selected = thinking.filter((t) => t.id && ids.includes(t.id));
    if (!selected.length) return;
    setAiRequest({
      scopeNodeId: '',
      kind: 'audit',
      request: selected.some((t) => t.kind === 'assumption')
        ? 'این فکرهای تأییدنشده را با دانش تأییدشدهٔ مرتبط بسنج و فرض‌هایشان را به چالش بکش؛ چه چیزی پشتوانه یا خلافشان است؟'
        : 'این فکرهای تأییدنشده را با دانش تأییدشدهٔ مرتبط بررسی و مقایسه کن؛ چه ابهام یا ناسازگاری‌ای دارند؟',
      thoughtIds: selected.flatMap((t) => t.id ? [t.id] : []),
    });
  };
  const handleSplitNote = async (noteId: string) => {
    const r = await attempt(() => dataApi.splitNote(wid, noteId));
    if (!r) return;
    patch((d) => ({ ...d, nodes: r.nodes, notes: r.notes, thoughts: r.thoughts }));
    toast.show({ intent: 'success', message: `${formatNumber(r.created.length)} بخش ساخته شد؛ یادداشت اصلی همان‌جا ماند.` });
  };
  // due: assumptions to look at again, decisions that ask «نتیجه چه شد؟»
  const dueAssumptions = useMemo(() => assumptionsDue(data?.objects ?? [], new Date()), [data?.objects]);
  const dueDecisions = useMemo(() => decisionsDue(data?.objects ?? [], data?.changes ?? [], new Date()), [data?.objects, data?.changes]);
  return { thinking, openCounts, handleConvertItem, handleReviseThought, handleDeriveThought, handleSynthesizeThought, startThoughtAi, handleSplitNote, dueAssumptions, dueDecisions };
}
