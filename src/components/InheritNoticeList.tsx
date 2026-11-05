/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { inheritSentence } from '../core/inheritNotice';
import type { InheritNotice } from '../core/inheritNotice';
import { Button, Icon, formatNumber } from '../ui';

interface Props {
  notices: InheritNotice[];
  /** «دیدم»: closes it (kept on this device only) */
  onSeen: (key: string) => void;
  /** go into a section (its sub-sections and their approved knowledge are listed there) */
  onOpenSection: (nodeId: string) => void;
  onOpenObject: (id: string) => void;
  /** how many to show at once (the rest are counted) */
  max?: number;
}

/**
 * The calm «این تغییر در N زیربخش هم حاکم است» news. Deliberately quiet: no warning colour, no counter anywhere, no status change —
 * it is a hint from the tree, not a verdict. One tap on «دیدم» closes it.
 */
export const InheritNoticeList: React.FC<Props> = ({ notices, onSeen, onOpenSection, onOpenObject, max = 3 }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (!notices.length) return null;
  return (
    <section className="flex flex-col gap-stack-sm" aria-label="اثر تغییرها در زیربخش‌ها" data-testid="inherit-notices">
      <h3 className="label-md text-text-subtle">اثر در زیربخش‌ها</h3>
      <ul className="flex flex-col gap-stack-sm">
        {notices.slice(0, max).map((n) => (
          <li key={n.key} className="flex flex-col gap-stack-xs rounded-control-sm bg-surface-sunken p-inset-md">
            <div className="flex flex-wrap items-center justify-between gap-inline-sm">
              <span className="body-sm flex w-full items-center gap-inline-xs text-text-default sm:w-auto sm:min-w-space-0 sm:flex-1">
                <Icon name="FolderTree" size="md" className="shrink-0 text-icon-subtle" />
                <span>{inheritSentence(n, formatNumber)}{n.everywhere ? ' (خط قرمز است و جاهای دیگر هم اثر دارد.)' : ''}</span>
              </span>
              <span className="flex items-center gap-inline-xs">
                <Button size="sm" variant="ghost" aria-expanded={open === n.key} onClick={() => setOpen(open === n.key ? null : n.key)}>{open === n.key ? 'ببند' : 'ببین کجاها'}</Button>
                <Button size="sm" variant="secondary" onClick={() => onSeen(n.key)}>دیدم</Button>
              </span>
            </div>
            {open === n.key && (
              <ul className="flex flex-col gap-stack-xs ps-inset-lg">
                {n.subNodes.map((s) => (
                  <li key={s.nodeId} className="flex flex-col gap-stack-xs">
                    <span className="flex flex-wrap items-center justify-between gap-inline-sm">
                      <span className="body-sm text-text-default">«{s.label}»</span>
                      <Button size="sm" variant="ghost" onClick={() => onOpenSection(s.nodeId)}>برو به بخش</Button>
                    </span>
                    {s.overlapping.length > 0 && (
                      <ul className="flex flex-col gap-stack-xs ps-inset-md">
                        {s.overlapping.map((o) => (
                          <li key={o.id} className="body-sm flex flex-wrap items-center justify-between gap-inline-sm text-text-subtle">
                            <span>هم‌موضوع: «{o.title}»</span>
                            <Button size="sm" variant="ghost" onClick={() => onOpenObject(o.id)}>باز کن</Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {notices.length > max && <p className="body-sm text-text-subtle">{formatNumber(notices.length - max)} خبر دیگر هم هست؛ در بازبینی هفتگی می‌آید.</p>}
    </section>
  );
};
