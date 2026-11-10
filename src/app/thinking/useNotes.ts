/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { can } from '../../core/entitlements';
import { convertedTo } from '../../core/thinkingMarkers';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import { recordOfChoice } from '../../core/decisionOptions';
import { sectionNameFromThought } from '../../core/thoughts';
import { useState } from 'react';
import type { AppCoreScope } from '../shell/useAppCore';
import type { ThinkingItemsScope } from './useThinkingItems';

export type NotesScope = ReturnType<typeof useNotes>;

export function useNotes(p: AppCoreScope & ThinkingItemsScope) {
  const { attempt, data, patch, setActiveTab, setContextViewMode, setExtractingNoteId, setNodeDialog, setPreviewNonce, thinking, toast, wid, workspaceContexts } = p;
  const previewTruth = () => { setPreviewNonce((n) => n + 1); setActiveTab('context'); setContextViewMode('canvas'); };
  /** a thought becomes a SECTION: she names it and picks the parent (or the top level); the thought's line is then done */
  const startSectionFromThought = (t: NoteThinkingItem) => {
    if (!t.id || !t.noteId) return;
    setNodeDialog({ kind: 'create', parentId: t.nodeId, label: sectionNameFromThought(t.text), chooseParent: true, thought: { id: t.id, noteId: t.noteId, line: t.line, text: t.text } });
  };
  const startSectionFromNote = (noteId: string) => {
    const n = data?.notes.find((x) => x.id === noteId);
    if (!n) return;
    const first = thinking.find((i) => i.noteId === n.id && !convertedTo(i, workspaceContexts));
    const text = first?.text ?? n.content.split('\n')[0];
    setNodeDialog({ kind: 'create', parentId: n.nodeId, label: sectionNameFromThought(text), chooseParent: true,     ...(first?.id ? { thought: { id: first.id, noteId: n.id, line: first.line, text: first.text } } : {}) });
  };
  const handleThoughtSectioned = async (t: { id: string; noteId: string; line: number; text: string }, label: string, nodeId: string) => {
    const r = await attempt(() => dataApi.resolveThought(wid, t.id, { nodeId }));
    if (!r) return;
    patch((d) => ({ ...d, thoughts: d.thoughts.map((x) => x.id === t.id ? r.thought : x) }));
    toast.show({ intent: 'success', message: `بخش «${label}» ساخته شد. فکر حل شد و یادداشت اصلی بدون تغییر ماند.` });
  };
  const handleSaveThought = async (nodeId: string, content: string) => {
    await handleAddNote(nodeId, content);
    toast.show({ intent: 'success', message: 'فکر ثبت شد؛ در «فضای فکر» می‌بینی‌اش و فقط با انتخاب صریح تو به AI می‌رسد.' });
  };
  const handleSaveAiThought = async (parentIds: string[], nodeId: string, text: string): Promise<boolean> => {
    if (!text.trim() || !parentIds.length) return false;
    const r = await attempt(() => dataApi.deriveThought(wid, { parentIds, nodeId, kind: 'idea', text: text.trim() }));
    if (!r) return false;
    patch((d) => ({ ...d, thoughts: [...d.thoughts, r.thought] }));
    toast.show({ intent: 'success', message: 'پاسخ به‌عنوان فکر بازِ مشتق‌شده ذخیره شد؛ فکرهای مبدأ دست‌نخورده ماندند.' });
    return true;
  };
  const handleSaveThoughts = async (notes: Array<{ nodeId: string; content: string }>, count: number) => {
    for (const n of notes) await handleAddNote(n.nodeId, n.content);
    toast.show({ intent: 'success', message: `${formatNumber(count)} فکر ثبت شد؛ در «فضای فکر» می‌بینی‌شان و فقط با انتخاب صریح تو به AI می‌رسند.` });
  };
  // «گزینه‌های تصمیم باز»: the options are lines under the decision in its note; choosing makes a PROPOSED decision, the others stay in its record
  const [optionsItemKey, setOptionsItemKey] = useState<string | null>(null);
  const optionsItem = optionsItemKey ? thinking.find((t) => t.key === optionsItemKey) ?? null : null;
  const optionsNote = optionsItem ? (data?.notes ?? []).find((n) => n.id === optionsItem.noteId) : undefined;
  const handleChooseOption = async (p: { question: string; chosen: { title: string; text: string }; others: Array<{ title: string; reason: string }> }) => {
    if (!optionsItem?.id) return;
    const r = await attempt(() => dataApi.createObject(wid, {
      type: 'Decision', status: 'Proposed', provenance: 'User Input', title: p.chosen.title.slice(0, 80), content: p.chosen.text, nodeId: optionsItem.nodeId,
      record: recordOfChoice(p.question, p.chosen.title, p.others),
      source: { kind: 'note', thoughtId: optionsItem.id, noteId: optionsItem.noteId, lineKey: optionsItem.sourceLineKey ?? optionsItem.hash, quote: optionsItem.text, at: new Date().toISOString() },
    }));
    if (!r) throw new Error('create failed');
    patch((d) => ({ ...d, objects: [r.object, ...d.objects], thoughts: r.thoughts }));
    toast.show({ intent: 'success', message: `تصمیم ثبت شد؛ ${formatNumber(p.others.length)} گزینهٔ دیگر با دلیل ماندند. در «فکر» منتظر تأیید توست.` });
  };
  const handleAddNote = async (nodeId: string, content: string) => {
    const r = await attempt(() => dataApi.createNote(wid, nodeId, content));
    if (r) patch((d) => ({ ...d, notes: [r.note, ...d.notes], thoughts: r.thoughts }));
  };
  const handleUpdateNote = async (id: string, content: string) => {
    const r = await attempt(() => dataApi.updateNote(wid, id, content));
    if (r) patch((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? r.note : n)), thoughts: r.thoughts }));
  };
  /**
   * A small, throwaway removal: it happens at once and offers «برگرداندن» (the note comes back with its text, its section and its place).
   * Only when the note holds OPEN thoughts does a short dialog ask first: they stay by default («یادداشت حذف شد» on each), and the user
   * can send them away with the note — the one choice that cannot be undone by the toast.
   */
  const handleDeleteNote = async (id: string, removeThoughts = false) => {
    const r = await attempt(() => dataApi.deleteNote(wid, id, removeThoughts));
    if (!r) return;
    patch((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id), thoughts: r.thoughts }));
    const note = r.note;
    if (!note) return;
    const msg = r.removedThoughts ? `یادداشت و ${formatNumber(r.removedThoughts)} فکر باز آن حذف شد.` : r.keptThoughts ? `یادداشت حذف شد؛ ${formatNumber(r.keptThoughts)} فکر باز مانده است.` : 'یادداشت حذف شد.';
    toast.show({ intent: 'success', message: msg, duration: 10000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.restoreNote(wid, note, r.position)).then((x) => { if (x) patch((d) => ({ ...d, notes: [x.note, ...d.notes], thoughts: x.thoughts, canvas: r.position ? { ...d.canvas, free: [...d.canvas.free.filter((i) => i.itemRef !== `note:${note.id}`), { itemRef: `note:${note.id}`, ...r.position }] } : d.canvas })); }); } } });
  };
  const [noteDeleteAsk, setNoteDeleteAsk] = useState<{ id: string; open: number } | null>(null);
  const [noteDeleteWithThoughts, setNoteDeleteWithThoughts] = useState(false);
  const askDeleteNote = async (id: string) => {
    const open = (data?.thoughts ?? []).filter((t) => t.sourceNoteId === id && t.status === 'open').length;
    if (open === 0) { await handleDeleteNote(id); return; }
    setNoteDeleteWithThoughts(false); setNoteDeleteAsk({ id, open });
  };
  const handleExtractNote = async (id: string) => {
    setExtractingNoteId(id);
    try {
      const r = await attempt(() => dataApi.extractNote(wid, id));
      if (!r) return;
      patch((d) => ({ ...d, objects: [...r.created, ...d.objects], ledger: [r.ledger, ...d.ledger] }));
      toast.show({ intent: r.created.length ? 'success' : 'info', message: r.created.length ? `${formatNumber(r.created.length)} مورد پیشنهادی ساخته شد؛ در وضعیت «پیشنهادی» منتظر تأیید توست.` : 'چیزی برای استخراج در این یادداشت پیدا نشد.' });
    } finally { setExtractingNoteId(null); }
  };
  return { previewTruth, startSectionFromThought, startSectionFromNote, handleThoughtSectioned, handleSaveThought, handleSaveAiThought, handleSaveThoughts, setOptionsItemKey, optionsItem, optionsNote, handleChooseOption, handleAddNote, handleUpdateNote, handleDeleteNote, noteDeleteAsk, setNoteDeleteAsk, noteDeleteWithThoughts, setNoteDeleteWithThoughts, askDeleteNote, handleExtractNote };
}
