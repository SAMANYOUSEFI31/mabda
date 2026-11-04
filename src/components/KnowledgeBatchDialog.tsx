/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { ContextType, TreeNode } from '../types';
import { parseKnowledgeBatch } from '../core/knowledgeBatch';
import { insertSoftBreak, joinToPrevious, splitFromPrevious } from '../core/batchLines';
import { TYPE_CHIP_FA } from '../core/knowledgeGuess';
import { flatten } from '../core/nodeTree';
import { Button, Dialog, IconButton, SegmentedControl, Select, Textarea, formatNumber } from '../ui';

export interface BatchProposal { type: ContextType; title: string; content: string; nodeId: string }
interface Props {
  open: boolean;
  onClose: () => void;
  nodes: TreeNode[];
  onPropose: (items: BatchProposal[]) => Promise<void>;
}

const TYPES: ContextType[] = ['Fact', 'Decision', 'Constraint'];

/** «چند دانش با هم» without an AI: paste lines → look (type and section per line) → confirm. Everything lands as a proposal. */
export const KnowledgeBatchDialog: React.FC<Props> = ({ open, onClose, nodes, onPropose }) => {
  const [text, setText] = useState('');
  const [node, setNode] = useState('');
  const [kind, setKind] = useState<Record<number, ContextType>>({});
  const [lineNode, setLineNode] = useState<Record<number, string>>({});
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  /** a new line INSIDE the same piece of knowledge (Shift+Enter; the button is for a phone) */
  const softBreak = () => {
    const ta = box.current?.querySelector('textarea');
    const at = ta ? ta.selectionStart : text.length;
    const r = insertSoftBreak(text, at, ta ? ta.selectionEnd : at);
    setText(r.value); setDropped(new Set());
    requestAnimationFrame(() => { const t = box.current?.querySelector('textarea'); if (t) { t.focus(); t.setSelectionRange(r.caret, r.caret); } });
  };
  useEffect(() => { if (open) { setText(''); setNode(''); setKind({}); setLineNode({}); setDropped(new Set()); } }, [open]);
  const lines = parseKnowledgeBatch(text).filter((l) => !dropped.has(l.id));
  const sections = [{ value: '', label: 'بدون بخش مشخص' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${'— '.repeat(depth)}${n.label}` }))];
  const save = async () => {
    if (!lines.length) return;
    setBusy(true);
    try { await onPropose(lines.map((l) => ({ type: kind[l.id] ?? l.type, title: l.title, content: l.content, nodeId: lineNode[l.id] ?? node }))); onClose(); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open} onClose={onClose} size="lg" title="چند دانش با هم" description="هر خط یک دانش. همه‌شان «پیشنهادی» می‌شوند و تا تأیید نکنی واقعیت نیستند؛ به AI هم نمی‌رسند."
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={busy} disabled={!lines.length} onClick={save}>{lines.length ? `ثبت ${formatNumber(lines.length)} پیشنهاد` : 'ثبت پیشنهادها'}</Button></>}
    >
      <div className="flex flex-col gap-stack-md" onKeyDown={(e) => { if (e.key === 'Enter' && e.shiftKey && !e.nativeEvent.isComposing && box.current?.contains(e.target as Node)) { e.preventDefault(); softBreak(); } }}>
        <div ref={box} className="flex flex-col gap-stack-xs">
        <Textarea label="دانش‌ها را بنویس یا بچسبان" rows={5} value={text} onChange={(e) => { setText(e.target.value); setDropped(new Set()); }} placeholder={'لحن ما گرم و محترمانه است\nهرگز تخفیف بیش از ۲۰٪ نمی‌دهیم'} hint="Enter: دانش بعدی · Shift+Enter: خط تازه در همین دانش. نوع هر مورد را خودمان حدس می‌زنیم و می‌توانی عوضش کنی؛ یا اول خط [واقعیت]، [تصمیم] یا [قید] بنویس." />
        <div><Button type="button" size="sm" variant="ghost" iconStart="CornerDownLeft" onClick={softBreak}>خط تازه در همین دانش</Button></div>
        </div>
        <Select label="بخش همه (اختیاری)" value={node} onChange={(e) => setNode(e.target.value)} options={sections} />
        {lines.length > 0 && (
          <div className="flex flex-col gap-stack-sm" data-testid="knowledge-batch-preview">
            <p className="body-sm text-text-subtle" aria-live="polite">{formatNumber(lines.length)} دانش پیشنهادی پیدا شد؛ هنوز چیزی ذخیره نشده.</p>
            <ul className="flex flex-col gap-stack-sm overflow-auto" style={{ maxBlockSize: '40vh' }}>
              {lines.map((l) => (
                <li key={l.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default bg-surface-raised p-inset-sm">
                  <div className="flex items-start justify-between gap-inline-sm">
                    <p className="body-md min-w-space-0 flex-1 whitespace-pre-wrap text-text-default">{l.content}</p>
                    <IconButton icon="X" label={`برداشتن «${l.title}»`} onClick={() => setDropped((d) => new Set(d).add(l.id))} />
                  </div>
                  <div className="flex flex-wrap gap-inline-xs">
                    {l.id > 0 && <Button type="button" size="sm" variant="ghost" iconStart="ArrowRight" onClick={() => setText((t) => joinToPrevious(t, l.id))}>به قبلی بچسبان</Button>}
                    {l.rest.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setText((t) => splitFromPrevious(t, l.rest[l.rest.length - 1]))}>خط آخر را جدا کن</Button>}
                  </div>
                  <SegmentedControl label="نوع" value={kind[l.id] ?? l.type} onChange={(v) => setKind((m) => ({ ...m, [l.id]: v as ContextType }))} items={TYPES.map((t) => ({ id: t, label: TYPE_CHIP_FA[t] }))} />
                  <Select label="بخش این خط" value={lineNode[l.id] ?? node} onChange={(e) => setLineNode((m) => ({ ...m, [l.id]: e.target.value }))} options={sections} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
};
