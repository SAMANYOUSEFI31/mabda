/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { ContextObject, TreeNode } from '../../types';
import { composeThought, guessThoughtKind, THINKING_FA, THOUGHT_KINDS } from '../../core/thoughts';
import type { ThinkingKind } from '../../core/thinkingMarkers';
import { flatten } from '../../core/nodeTree';
import { Button, Dialog, IconButton, SegmentedControl, Select, formatNumber } from '../../ui';
import { composeThoughtBatch, isBatch, parseThoughtBatch } from '../../core/thoughtBatch';
import { insertSoftBreak, joinToPrevious, splitFromPrevious } from '../../core/batchLines';
import type { NotePayload } from '../../core/thoughtBatch';
import { MentionTextarea } from '../shared/MentionTextarea';
import { AboutPicker } from './AboutPicker';
import { aboutToken } from '../../core/thoughtAbout';
import type { AboutTarget } from '../../core/thoughtAbout';

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: TreeNode[];
  objects: ContextObject[];
  /** the node it is opened from (a node page): chosen for her; empty = no particular place */
  nodeId?: string;
  initialKind?: ThinkingKind;
  initialAbout?: AboutTarget[];
  onSave: (nodeId: string, content: string) => Promise<unknown>;
  /** several thoughts at once: one note per section */
  onSaveMany?: (notes: NotePayload[], count: number) => Promise<unknown>;
}

/**
 * «فکر تازه»: one box, four chips (ایده by default; a text that ends with «؟» becomes a سؤال by itself, and she can change it).
 * No bracket to learn: the marker is written FOR her. A Thought is never Knowledge; it reaches AI only when explicitly selected for a request.
 */
export const ThoughtDialog: React.FC<Props> = ({ open, onClose, nodes, objects, nodeId = '', initialKind, initialAbout, onSave, onSaveMany }) => {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ThinkingKind>('idea');
  const [touched, setTouched] = useState(false);
  const [node, setNode] = useState(nodeId);
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState<AboutTarget[]>([]);
  const box = React.useRef<HTMLDivElement>(null);
  /** a new line INSIDE the same thought (Shift+Enter; the button is for a phone keyboard, which has no Shift+Enter) */
  const softBreak = () => {
    const ta = box.current?.querySelector('textarea');
    const at = ta ? ta.selectionStart : text.length;
    const r = insertSoftBreak(text, at, ta ? ta.selectionEnd : at);
    setText(r.value); setDropped(new Set());
    requestAnimationFrame(() => { const t = box.current?.querySelector('textarea'); if (t) { t.focus(); t.setSelectionRange(r.caret, r.caret); } });
  };
  const tokens = about.map((t) => aboutToken(t.label)).join(' ');
  // batch preview: the default kind for lines no rule decided, and per-line changes (kept by the line's position in the text)
  const [defKind, setDefKind] = useState<ThinkingKind>('idea');
  const [lineKind, setLineKind] = useState<Record<number, ThinkingKind>>({});
  const [lineNode, setLineNode] = useState<Record<number, string>>({});
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  useEffect(() => { if (open) { setText(''); setKind(initialKind ?? 'idea'); setTouched(!!initialKind); setNode(nodeId); setDefKind('idea'); setAbout(initialAbout ?? []); setLineKind({}); setLineNode({}); setDropped(new Set()); } }, [open, nodeId, initialKind, initialAbout]);
  const batch = !!onSaveMany && isBatch(text);
  const lines = batch ? parseThoughtBatch(text, defKind).filter((l) => !dropped.has(l.id)) : [];
  const sectionOptions = [{ value: '', label: 'بدون بخش مشخص' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${'— '.repeat(depth)}${n.label}` }))];
  useEffect(() => { if (!touched) setKind(guessThoughtKind(text)); }, [text, touched]);

  const save = async () => {
    if (batch && onSaveMany) {
      const notes = composeThoughtBatch(lines.map((l) => ({ text: `${l.text} ${tokens}`.trim(), kind: lineKind[l.id] ?? l.kind, nodeId: lineNode[l.id] ?? node })));
      if (!notes.length) return;
      setBusy(true);
      try { await onSaveMany(notes, lines.length); onClose(); } finally { setBusy(false); }
      return;
    }
    const content = composeThought(tokens ? `${text.trim()} ${tokens}` : text, kind);
    if (!content) return;
    setBusy(true);
    try { await onSave(node, content); onClose(); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open} onClose={onClose} size="md" title="فکر تازه" description="یک فکر یا چند فکر؛ هر خط یک فکر. هرچه هنوز حقیقت نیست: ایده، سؤال، فرض یا تصمیم باز. جدا از دانش می‌ماند و فقط با انتخاب صریح تو به درخواست AI می‌رسد."
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={busy} disabled={!text.trim() || (batch && lines.length === 0)} onClick={save}>{batch ? `ذخیرهٔ ${formatNumber(lines.length)} فکر` : 'ذخیره'}</Button></>}
    >
      <div className="flex flex-col gap-stack-md" onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); void save(); return; }
        if (e.shiftKey && box.current?.contains(e.target as Node)) { e.preventDefault(); softBreak(); }
      }}>
        <div ref={box} className="flex flex-col gap-stack-xs">
        <MentionTextarea label="فکرت را بنویس" rows={batch ? 4 : 3} value={text} onValueChange={(v) => { setText(v); setDropped(new Set()); }} objects={objects} placeholder="مثلاً: قیمت اشتراک سه‌ماهه چقدر باشد؟" hint="Enter: فکر بعدی · Shift+Enter: خط تازه در همین فکر · Ctrl/⌘+Enter: ذخیره. متنی که با ؟ تمام شود «سؤال» می‌شود؛ می‌توانی عوضش کنی." />
        <div><Button type="button" size="sm" variant="ghost" iconStart="CornerDownLeft" onClick={softBreak}>خط تازه در همین فکر</Button></div>
        </div>
        {!batch && <SegmentedControl label="این یک…" value={kind} onChange={(v) => { setKind(v as ThinkingKind); setTouched(true); }} items={THOUGHT_KINDS.map((k) => ({ id: k, label: THINKING_FA[k] }))} />}
        {batch && <SegmentedControl label="نوع خط‌هایی که نوعشان معلوم نیست" value={defKind} onChange={(v) => setDefKind(v as ThinkingKind)} items={THOUGHT_KINDS.map((k) => ({ id: k, label: THINKING_FA[k] }))} />}
        <Select label={batch ? 'بخش همهٔ فکرها (اختیاری)' : 'دربارهٔ کدام بخش؟ (اختیاری)'} value={node} onChange={(e) => setNode(e.target.value)} options={sectionOptions} />
        <AboutPicker objects={objects} nodes={nodes} value={about} onChange={setAbout} />
        {batch && (
          <div className="flex flex-col gap-stack-sm" data-testid="thought-batch-preview">
            <p className="body-sm text-text-subtle" aria-live="polite">{formatNumber(lines.length)} فکر پیدا شد. نوع هر خط را می‌توانی عوض کنی یا خطی را برداری؛ چیزی ذخیره نشده است.</p>
            <ul className="flex flex-col gap-stack-sm overflow-auto" style={{ maxBlockSize: '40vh' }}>
              {lines.map((l) => (
                <li key={l.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default bg-surface-raised p-inset-sm">
                  <div className="flex items-start justify-between gap-inline-sm">
                    <p className="body-md min-w-space-0 flex-1 whitespace-pre-wrap text-text-default">{l.text}</p>
                    <IconButton icon="X" label={`برداشتن «${l.text.slice(0, 30)}»`} onClick={() => setDropped((d) => new Set(d).add(l.id))} />
                  </div>
                  <div className="flex flex-wrap gap-inline-xs">
                    {l.id > 0 && <Button type="button" size="sm" variant="ghost" iconStart="ArrowRight" onClick={() => setText((t) => joinToPrevious(t, l.id))}>به قبلی بچسبان</Button>}
                    {l.rest.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setText((t) => splitFromPrevious(t, l.rest[l.rest.length - 1]))}>خط آخر را جدا کن</Button>}
                  </div>
                  <SegmentedControl label="نوع" value={lineKind[l.id] ?? l.kind} onChange={(v) => setLineKind((m) => ({ ...m, [l.id]: v as ThinkingKind }))} items={THOUGHT_KINDS.map((k) => ({ id: k, label: THINKING_FA[k] }))} />
                  <Select label="بخش این خط" value={lineNode[l.id] ?? node} onChange={(e) => setLineNode((m) => ({ ...m, [l.id]: e.target.value }))} options={sectionOptions} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
};
