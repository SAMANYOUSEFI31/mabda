/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, ThoughtKind, TreeNode } from '../types';
import { convertedTo } from '../core/thinkingMarkers';
import type { NoteThinkingItem } from '../core/thinkingMarkers';
import { promotionTypesForThought, THINKING_FA, THOUGHT_KINDS } from '../core/thoughts';
import { aboutTargets, stripAbout } from '../core/thoughtAbout';
import { Badge, Button, Checkbox, Dialog, Menu, SegmentedControl, Textarea, ThinkingBadge, formatNumber } from '../ui';

interface Props {
  items: NoteThinkingItem[];
  objects: ContextObject[];
  /** show the node an item lives in (home) */
  nodes?: TreeNode[];
  onConvert: (item: NoteThinkingItem, type: ContextObject['type']) => Promise<void>;
  onGoToNode?: (nodeId: string) => void;
  /** «ساخت بخش»: the thought becomes a section of the tree (she picks the name and the parent) */
  onToSection?: (item: NoteThinkingItem) => void;
  onRevise?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  onDerive?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  selectedIds?: string[];
  onToggleSelection?: (id: string, selected: boolean) => void;
  /** an open decision: its options side by side (the count is how many it has) */
  onOptions?: (item: NoteThinkingItem) => void;
  optionCount?: (item: NoteThinkingItem) => number;
  empty?: string;
}

/**
 * Persisted Thoughts are presented in the existing compact list; promotion always requires an explicit Knowledge type.
 */
export const ThinkingList: React.FC<Props> = ({ items, objects, nodes, onConvert, onGoToNode, onToSection, onRevise, onDerive, onOptions, optionCount, empty, selectedIds = [], onToggleSelection }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [manage, setManage] = useState<{ item: NoteThinkingItem; mode: 'revise' | 'derive' } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftKind, setDraftKind] = useState<ThoughtKind>('idea');
  const label = (id: string) => nodes?.find((n) => n.id === id)?.label ?? id;
  const run = async (item: NoteThinkingItem, type: ContextObject['type']) => { setBusy(item.key); try { await onConvert(item, type); } finally { setBusy(null); } };
  const runManage = async () => {
    if (!manage || !manage.item.id || !draftText.trim()) return;
    setBusy(manage.item.key);
    try {
      const saved = manage.mode === 'revise'
        ? await onRevise?.(manage.item, draftText, draftKind)
        : await onDerive?.(manage.item, draftText, draftKind);
      if (saved) setManage(null);
    } finally { setBusy(null); }
  };
  if (items.length === 0) return empty ? <p className="body-sm text-text-subtle">{empty}</p> : null;
  return (
    <ul className="flex flex-col gap-stack-xs" aria-label="مورد فکری">
      {items.map((it) => {
        const done = !!convertedTo(it, objects);
        return (
          <li key={it.key} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
            <span className="flex min-w-space-0 flex-1 flex-wrap items-center gap-inline-sm">
              <ThinkingBadge kind={it.kind} />
              <span className="body-md whitespace-pre-wrap text-text-default">{stripAbout(it.text) || it.text}</span>
              {nodes && <span className="caption text-text-subtle">· {label(it.nodeId)}</span>}
              {nodes && (() => { const t = aboutTargets(it.text, objects, nodes); return t.length ? <span className="caption text-text-subtle">· دربارهٔ {t.map((x) => x.label).join('، ')}</span> : null; })()}
              {done && <Badge intent="success" icon="Check">تبدیل شد ✓</Badge>}
            </span>
            <span className="flex flex-wrap items-center gap-inline-xs">
              {onToggleSelection && it.id && <Checkbox label={`انتخاب فکر «${stripAbout(it.text).slice(0, 40)}»`} checked={selectedIds.includes(it.id)} onChange={(e) => { if (it.id) onToggleSelection(it.id, e.target.checked); }} />}
              {onGoToNode && <Button size="sm" variant="ghost" onClick={() => onGoToNode(it.nodeId)}>رفتن به گره</Button>}
              {!done && onOptions && it.kind === 'open_decision' && it.noteId && <Button size="sm" variant="secondary" iconStart="Layers" onClick={() => onOptions(it)}>{optionCount?.(it) ? `گزینه‌ها (${formatNumber(optionCount(it))})` : 'گزینه‌ها'}</Button>}
              {!done && onToSection && it.noteId && <Button size="sm" variant="ghost" iconStart="Network" onClick={() => onToSection(it)}>ساخت بخش</Button>}
              {!done && promotionTypesForThought(it.kind).length > 0 && (
                <Menu
                  label="انتقال فکر به دانش"
                  align="end"
                  trigger={<Button size="sm" variant="secondary" iconStart="Wand2" loading={busy === it.key}>به دانش ببر</Button>}
                  items={promotionTypesForThought(it.kind).map((type) => ({
                    label: `قلم پیشنهادی: ${type === 'Fact' ? 'واقعیت' : type === 'Decision' ? 'تصمیم' : 'خط قرمز'}`,
                    icon: type === 'Fact' ? 'FileText' : type === 'Decision' ? 'Target' : 'Shield',
                    onSelect: () => void run(it, type),
                  }))}
                />
              )}
              {!done && it.id && (onRevise || onDerive) && (
                <Menu
                  label="کارهای بیشتر برای فکر"
                  align="end"
                  trigger={<Button size="sm" variant="ghost">بیشتر</Button>}
                  items={[
                    ...(onRevise ? [{ label: 'بازنگری متن یا نوع', icon: 'Pencil' as const, onSelect: () => { setDraftText(it.text); setDraftKind(it.kind); setManage({ item: it, mode: 'revise' }); } }] : []),
                    ...(onDerive ? [{ label: 'ساخت فکر تازه از این', icon: 'Network' as const, onSelect: () => { setDraftText(''); setDraftKind('idea'); setManage({ item: it, mode: 'derive' }); } }] : []),
                  ]}
                />
              )}
            </span>
          </li>
        );
      })}
      {manage && (
        <Dialog
          open
          onClose={() => setManage(null)}
          size="md"
          title={manage.mode === 'revise' ? 'بازنگری فکر' : 'ساخت فکر تازه از این'}
          description={manage.mode === 'revise' ? 'تغییر متن یا نوع، شناسهٔ همین فکر را نگه می‌دارد؛ فقط تغییر معنایی متن در تاریخچه می‌آید.' : 'فکر تازه شناسهٔ جدا دارد و به فکر مبدأ پیوند می‌خورد؛ فکر مبدأ دست‌نخورده می‌ماند.'}
          footer={<><Button variant="ghost" disabled={busy !== null} onClick={() => setManage(null)}>انصراف</Button><Button variant="primary" loading={busy === manage.item.key} disabled={!draftText.trim()} onClick={() => void runManage()}>{manage.mode === 'revise' ? 'ذخیرهٔ بازنگری' : 'ساخت فکر مشتق'}</Button></>}
        >
          <div className="flex flex-col gap-stack-md">
            <Textarea label="متن فکر" rows={4} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
            <SegmentedControl label="نوع فکر" value={draftKind} onChange={(value) => setDraftKind(value as ThoughtKind)} items={THOUGHT_KINDS.map((kind) => ({ id: kind, label: THINKING_FA[kind] }))} />
          </div>
        </Dialog>
      )}
    </ul>
  );
};
