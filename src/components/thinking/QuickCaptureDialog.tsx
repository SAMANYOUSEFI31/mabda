/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ADD_DESCRIPTION } from '../../core/addRequest';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ContextObject, Thought, TreeNode } from '../../types';
import { Alert, Button, Checkbox, Dialog, formatNumber } from '../../ui';
import { NodePickerField } from '../structure/NodePicker';
import { THINKING_FA, THOUGHT_KINDS, composeThought, guessThoughtKind } from '../../core/thoughts';
import type { ThinkingKind } from '../../core/thinkingMarkers';
import { composeThoughtBatch, isBatch, parseThoughtBatch } from '../../core/thoughtBatch';
import { insertSoftBreak } from '../../core/batchLines';
import { defaultNodeId } from '../../core/nodeTree';
import { findExactDuplicate, findNearDuplicate } from '../../core/quickCapture';
import { getSlotProvider } from '../../core/suggestionSlots';
import type { SlotSuggestion } from '../../core/suggestionSlots';
import type { NotePayload } from '../../core/thoughtBatch';
import { MentionTextarea } from '../shared/MentionTextarea';

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: TreeNode[];
  objects: ContextObject[];
  thoughts: Thought[];
  /** the draft lives in the caller: closing with Esc never loses what she typed */
  text: string;
  onTextChange: (text: string) => void;
  /** the section she is in right now ('' = none): the default place */
  node: string;
  onNodeChange: (id: string) => void;
  continuous: boolean;
  onContinuousChange: (on: boolean) => void;
  /** the SAME save path as «فکر تازه» (useNotes); both return false when saving failed, so the draft is kept */
  onSave: (nodeId: string, content: string, quiet?: boolean) => Promise<boolean>;
  onSaveMany: (notes: NotePayload[], count: number, quiet?: boolean) => Promise<boolean>;
  /** «فکر · حقیقت · فایل» at the top (patterns.md §۳) */
  switcher?: React.ReactNode;
}

/** a connection point of the intelligence layer: nothing at all (no space, no placeholder) while it has no provider or no answer */
function useSlot(slot: 'place' | 'duplicate', text: string, node: string, enabled: boolean): SlotSuggestion | null {
  const [hit, setHit] = useState<SlotSuggestion | null>(null);
  useEffect(() => {
    const provider = getSlotProvider(slot);
    if (!provider || !enabled || text.trim().length < 3) { setHit(null); return; }
    let live = true;
    const t = setTimeout(() => { provider({ text, nodeId: node || undefined }).then((r) => { if (live) setHit(r[0] ?? null); }).catch(() => { if (live) setHit(null); }); }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [slot, text, node, enabled]);
  return hit;
}

/**
 * «ثبت سریع»: one box, from anywhere. No place needed: with no section chosen the thought lands in «تازه‌ها» and gets its place later.
 * It saves through the same path as «فکر تازه» (a note with a marker → a Thought); there is no second way to store anything.
 * Enter: new line · Shift+Enter: a line inside the same thought (matters when «هر خط یک فکر») · Ctrl/⌘+Enter: save.
 */
export const QuickCaptureDialog: React.FC<Props> = ({ open, onClose, nodes, objects, thoughts, text, onTextChange, node, onNodeChange, continuous, onContinuousChange, onSave, onSaveMany, switcher }) => {
  const [perLine, setPerLine] = useState(false);
  // the kind is guessed from the text (؟ → سؤال, otherwise ایده) and SHOWN, like the type of new knowledge: she sees it and can change it
  const [kind, setKind] = useState<ThinkingKind>('idea');
  const [kindTouched, setKindTouched] = useState(false);
  useEffect(() => { if (!kindTouched) setKind(guessThoughtKind(text)); }, [text, kindTouched]);
  useEffect(() => { if (open && !text.trim()) setKindTouched(false); }, [open, text]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const focusBox = () => requestAnimationFrame(() => box.current?.querySelector('textarea')?.focus());
  useEffect(() => { if (open) { setSaved(0); const t = setTimeout(focusBox, 30); return () => clearTimeout(t); } }, [open]);

  const several = isBatch(text);
  const split = perLine && several;
  const lines = split ? parseThoughtBatch(text) : [];
  const count = split ? lines.length : 1;
  // there is no «no place» in the data: a thought with no section chosen lands in the default section (the first one). The list says so
  // by name instead of promising a «تازه‌ها» that does not exist (docs/ux/decisions.md §۷)
  const fallback = defaultNodeId(nodes);
  const shownNode = node || fallback;
  const exact = useMemo(() => (open ? findExactDuplicate(text, thoughts, objects) : null), [open, text, thoughts, objects]);
  const slotDup = useSlot('duplicate', text, node, open && !exact);
  // with the intelligence layer off the slot is silent; the deterministic word-overlap check still gives the soft hint
  const nearDup = useMemo(() => (open && !exact && !slotDup ? findNearDuplicate(text, thoughts, objects) : null), [open, exact, slotDup, text, thoughts, objects]);
  const maybeDup = slotDup ?? (nearDup ? { label: `«${nearDup.text.length > 80 ? `${nearDup.text.slice(0, 80)}…` : nearDup.text}»` } : null);
  const place = useSlot('place', text, node, open && !node);
  const placeNode = place?.targetId && nodes.some((n) => n.id === place.targetId) ? place : null;

  const softBreak = () => {
    const ta = box.current?.querySelector('textarea');
    const at = ta ? ta.selectionStart : text.length;
    const r = insertSoftBreak(text, at, ta ? ta.selectionEnd : at);
    onTextChange(r.value);
    requestAnimationFrame(() => { const t = box.current?.querySelector('textarea'); if (t) { t.focus(); t.setSelectionRange(r.caret, r.caret); } });
  };

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      let ok: boolean;
      if (split) {
        const notes = composeThoughtBatch(lines.map((l) => ({ text: l.text, kind: l.kind, nodeId: node })));
        if (!notes.length) return;
        ok = await onSaveMany(notes, lines.length, continuous);
      } else {
        const content = composeThought(text, kind);
        if (!content) return;
        // quiet only while the dialog stays open and its footer says it; closing, the toast says where it went (§۴۸)
        ok = await onSave(node, content, continuous);
      }
      if (!ok) return; // the error toast («دوباره») is already shown and the draft stays
      setSaved((n) => n + count);
      onTextChange('');
      setPerLine(false);
      setKindTouched(false);
      if (continuous) focusBox(); else onClose();
    } finally { setBusy(false); }
  };

  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return (
    <Dialog
      open={open} onClose={onClose} size="md" title={switcher ? 'افزودن' : 'افزودن فکر'} steady={!!switcher}
      // × / Esc with words in the box asks first; «دور بریز» empties it (the draft lives in the caller, so «ادامه» loses nothing)
      dirty={!!text.trim()} onDiscard={() => { onTextChange(''); setPerLine(false); }}
      description={switcher ? ADD_DESCRIPTION : 'هرچه هنوز حقیقت نیست: ایده، سؤال، فرض یا تصمیم باز.'}
      // «باز بماند» sits by the button it changes (like «Create more» beside «Create»): never below the fold of the body
      footer={<><Button variant="ghost" onClick={onClose}>{saved > 0 ? 'تمام' : 'انصراف'}</Button><Button variant="primary" loading={busy} disabled={!text.trim() || (split && lines.length === 0)} onClick={save}>{count > 1 ? `افزودن ${formatNumber(count)} فکر` : 'افزودن فکر'}</Button>
        <div className="flex flex-wrap items-center gap-inline-sm md:order-first md:me-auto"><Checkbox label="بعد از ثبت باز بماند" checked={continuous} onChange={(e) => onContinuousChange(e.target.checked)} />
          {/* the proof of a save sits in the footer, which is always on screen: in the body it fell below a phone's fold (§۴۸) */}
          <span className="body-sm text-text-subtle" role="status">{saved > 0 ? `${formatNumber(saved)} مورد ثبت شد.` : ''}</span></div></>}
    >
      <div className="flex flex-col gap-stack-md" onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); void save(); return; }
        if (e.shiftKey && box.current?.contains(e.target as Node)) { e.preventDefault(); softBreak(); }
      }}>
        {switcher}
        <div ref={box} className="flex flex-col gap-stack-xs">
          <MentionTextarea
            label="چه چیزی به ذهنت رسید؟" rows={4} value={text} onValueChange={onTextChange} objects={objects}
            placeholder="هر طولی، هر شکلی؛ مرتب نبودنش مشکلی نیست."
            // a keyboard hint only where there is a keyboard; Persian first so the line reads in order (Latin keys sit at the end of each part)
            hint={touch ? (split ? 'هر خط یک فکر جدا می‌شود.' : undefined)
              : split ? 'فکر بعدی با Enter · خط تازه در همین فکر با Shift+Enter · ثبت با Ctrl/⌘+Enter' : 'ثبت با Ctrl/⌘+Enter'}
          />
          <div className="flex flex-wrap items-center gap-inline-sm">
            {several && <Checkbox label="هر خط یک فکر جدا" checked={perLine} onChange={(e) => setPerLine(e.target.checked)} />}
            {split && <Button type="button" size="sm" variant="ghost" iconStart="CornerDownLeft" onClick={softBreak}>خط تازه در همین فکر</Button>}
          </div>
        </div>
        {!split && (
          // the same «انتخاب بزرگ» chips as the type of new knowledge (ContextDetailModal): one pattern for «what kind is this?»
          <div className="flex flex-col gap-stack-xs">
            <div role="radiogroup" aria-label="نوع فکر" className="flex flex-wrap gap-inline-xs">
              {THOUGHT_KINDS.map((k) => (
                <Button key={k} type="button" size="sm" role="radio" aria-checked={kind === k} variant={kind === k ? 'secondary' : 'ghost'} iconStart={kind === k ? 'Check' : undefined} onClick={() => { setKind(k); setKindTouched(true); }}>{THINKING_FA[k]}</Button>
              ))}
            </div>
            {!kindTouched && text.trim() && <p className="body-sm text-text-subtle">نوع را خودمان حدس زدیم؛ اگر درست نیست، عوضش کن.</p>}
          </div>
        )}
        <NodePickerField label="کجا برود؟" nodes={nodes} value={shownNode} onChange={onNodeChange} marks={fallback ? { [fallback]: 'پیش‌فرض' } : undefined} hint={node ? undefined : `اگر جای دیگری انتخاب نکنی، در «${nodes.find((n) => n.id === fallback)?.label ?? ''}» می‌ماند.`} />
        {placeNode && (
          <div className="flex flex-wrap items-center gap-inline-sm" data-testid="quick-capture-place">
            <span className="body-sm text-text-subtle">جای پیشنهادی: {placeNode.label}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => onNodeChange(placeNode.targetId!)}>همین‌جا</Button>
          </div>
        )}
        {exact && !split && (
          <Alert intent="warning" title="تکراری است">
            {exact.kind === 'thought' ? 'همین فکر پیش‌تر ثبت شده' : 'همین دانش پیش‌تر ثبت شده'}: «{exact.text.length > 80 ? `${exact.text.slice(0, 80)}…` : exact.text}». اگر باز هم می‌خواهی، ثبتش کن.
          </Alert>
        )}
        {!exact && maybeDup && <p className="body-sm text-text-subtle" data-testid="quick-capture-maybe-dup">شاید تکراری باشد: {maybeDup.label}</p>}
      </div>
    </Dialog>
  );
};
