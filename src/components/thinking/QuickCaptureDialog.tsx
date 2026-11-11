/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ContextObject, Thought, TreeNode } from '../../types';
import { Alert, Button, Checkbox, Dialog, Select, formatNumber } from '../../ui';
import { composeThought, guessThoughtKind } from '../../core/thoughts';
import { composeThoughtBatch, isBatch, parseThoughtBatch } from '../../core/thoughtBatch';
import { insertSoftBreak } from '../../core/batchLines';
import { flatten } from '../../core/nodeTree';
import { findExactDuplicate } from '../../core/quickCapture';
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
export const QuickCaptureDialog: React.FC<Props> = ({ open, onClose, nodes, objects, thoughts, text, onTextChange, node, onNodeChange, continuous, onContinuousChange, onSave, onSaveMany }) => {
  const [perLine, setPerLine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const focusBox = () => requestAnimationFrame(() => box.current?.querySelector('textarea')?.focus());
  useEffect(() => { if (open) { setSaved(0); const t = setTimeout(focusBox, 30); return () => clearTimeout(t); } }, [open]);

  const several = isBatch(text);
  const split = perLine && several;
  const lines = split ? parseThoughtBatch(text) : [];
  const count = split ? lines.length : 1;
  const sectionOptions = useMemo(() => [{ value: '', label: 'تازه‌ها — جایش را بعداً مشخص می‌کنم' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${'— '.repeat(depth)}${n.label}` }))], [nodes]);
  const exact = useMemo(() => (open ? findExactDuplicate(text, thoughts, objects) : null), [open, text, thoughts, objects]);
  const maybeDup = useSlot('duplicate', text, node, open && !exact);
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
        ok = await onSaveMany(notes, lines.length, true);
      } else {
        const content = composeThought(text, guessThoughtKind(text));
        if (!content) return;
        ok = await onSave(node, content, true);
      }
      if (!ok) return; // the error toast («دوباره») is already shown and the draft stays
      setSaved((n) => n + count);
      onTextChange('');
      setPerLine(false);
      if (continuous) focusBox(); else onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onClose={onClose} size="md" title="ثبت سریع"
      description="جایش را لازم نیست الان بدانی."
      footer={<><Button variant="ghost" onClick={onClose}>{saved > 0 ? 'تمام' : 'انصراف'}</Button><Button variant="primary" loading={busy} disabled={!text.trim() || (split && lines.length === 0)} onClick={save}>{count > 1 ? `ثبت ${formatNumber(count)} فکر` : 'ثبت'}</Button></>}
    >
      <div className="flex flex-col gap-stack-md" onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); void save(); return; }
        if (e.shiftKey && box.current?.contains(e.target as Node)) { e.preventDefault(); softBreak(); }
      }}>
        <div ref={box} className="flex flex-col gap-stack-xs">
          <MentionTextarea
            label="چه چیزی به ذهنت رسید؟" rows={4} value={text} onValueChange={onTextChange} objects={objects}
            placeholder="هر طولی، هر شکلی؛ مرتب نبودنش مشکلی نیست."
            hint={split ? 'Enter: فکر بعدی · Shift+Enter: خط تازه در همین فکر · Ctrl/⌘+Enter: ثبت' : 'Ctrl/⌘+Enter: ثبت · متنی که با ؟ تمام شود «سؤال» می‌شود.'}
          />
          <div className="flex flex-wrap items-center gap-inline-sm">
            {several && <Checkbox label="هر خط یک فکر جدا" checked={perLine} onChange={(e) => setPerLine(e.target.checked)} />}
            {split && <Button type="button" size="sm" variant="ghost" iconStart="CornerDownLeft" onClick={softBreak}>خط تازه در همین فکر</Button>}
          </div>
        </div>
        <Select label="کجا برود؟ (اختیاری)" value={node} onChange={(e) => onNodeChange(e.target.value)} options={sectionOptions} hint={node ? 'همین بخشی که الان در آن هستی؛ می‌توانی عوضش کنی.' : 'بدون انتخاب، در «تازه‌ها» می‌ماند تا بعداً جایش را بگذاری.'} />
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
        {saved > 0 && <p className="body-sm text-text-subtle" role="status">{formatNumber(saved)} مورد ثبت شد.</p>}
        <Checkbox label="بعد از ثبت باز بماند تا مورد بعدی را بنویسم" checked={continuous} onChange={(e) => onContinuousChange(e.target.checked)} />
      </div>
    </Dialog>
  );
};
