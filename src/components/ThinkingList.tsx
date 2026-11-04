/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, TreeNode } from '../types';
import { convertedTo } from '../core/thinkingMarkers';
import type { NoteThinkingItem } from '../core/thinkingMarkers';
import { aboutTargets, stripAbout } from '../core/thoughtAbout';
import { Badge, Button, Menu, ThinkingBadge, formatNumber } from '../ui';

interface Props {
  items: NoteThinkingItem[];
  objects: ContextObject[];
  /** show the node an item lives in (home) */
  nodes?: TreeNode[];
  onConvert: (item: NoteThinkingItem, opts?: { as?: 'fact' | 'decision' }) => Promise<void>;
  onGoToNode?: (nodeId: string) => void;
  /** the way up: «به دانش ببر» opens the knowledge form prefilled from the line (nothing is saved until she saves it) */
  onPrefill?: (item: NoteThinkingItem) => void;
  /** «ساخت بخش»: the thought becomes a section of the tree (she picks the name and the parent) */
  onToSection?: (item: NoteThinkingItem) => void;
  /** an open decision: its options side by side (the count is how many it has) */
  onOptions?: (item: NoteThinkingItem) => void;
  optionCount?: (item: NoteThinkingItem) => number;
  empty?: string;
}

/**
 * Thinking items derived from note lines. Nothing is stored: converting makes a PROPOSED object whose source is the line,
 * and the item then carries ✓. A question stays a question; an idea can stay a note.
 */
export const ThinkingList: React.FC<Props> = ({ items, objects, nodes, onConvert, onGoToNode, onPrefill, onToSection, onOptions, optionCount, empty }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const label = (id: string) => nodes?.find((n) => n.id === id)?.label ?? id;
  const run = async (item: NoteThinkingItem, opts?: { as?: 'fact' | 'decision' }) => { setBusy(item.key); try { await onConvert(item, opts); } finally { setBusy(null); } };
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
              {onGoToNode && <Button size="sm" variant="ghost" onClick={() => onGoToNode(it.nodeId)}>رفتن به گره</Button>}
              {!done && onOptions && it.kind === 'open_decision' && <Button size="sm" variant="secondary" iconStart="Layers" onClick={() => onOptions(it)}>{optionCount?.(it) ? `گزینه‌ها (${formatNumber(optionCount(it))})` : 'گزینه‌ها'}</Button>}
              {!done && onToSection && <Button size="sm" variant="ghost" iconStart="Network" onClick={() => onToSection(it)}>ساخت بخش</Button>}
              {!done && onPrefill && <Button size="sm" variant="secondary" iconStart="Wand2" onClick={() => onPrefill(it)}>به دانش ببر</Button>}
              {!done && !onPrefill && it.kind === 'idea' && (
                <Menu
                  label="تبدیل ایده"
                  align="end"
                  trigger={<Button size="sm" variant="secondary" iconStart="Wand2" loading={busy === it.key}>تبدیل به قلم دانش</Button>}
                  items={[
                    { label: 'قلم پیشنهادی: واقعیت', icon: 'FileText', onSelect: () => void run(it, { as: 'fact' }) },
                    { label: 'قلم پیشنهادی: تصمیم', icon: 'Target', onSelect: () => void run(it, { as: 'decision' }) },
                    { divider: true },
                    { label: 'همان یادداشت بماند', icon: 'Check', onSelect: () => undefined },
                  ]}
                />
              )}
              {!done && !onPrefill && (it.kind === 'assumption' || it.kind === 'open_decision') && (
                <Button size="sm" variant="secondary" iconStart="Wand2" loading={busy === it.key} onClick={() => run(it)}>تبدیل به قلم دانش</Button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
