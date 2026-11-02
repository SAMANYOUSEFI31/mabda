/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { GapItem } from '../types';
import { Badge, Button, Card, Icon, TextField, formatNumber } from '../ui';
import type { IconName } from '../ui';

interface Props {
  specTitle: string;
  /** required items still missing/ambiguous for the selected workstream (deterministic Gap engine) */
  gaps: GapItem[];
  contradictionCount: number;
  staleCount: number;
  /** derived «needs review»: dependents whose dependency changed */
  reviews: Array<{ id: string; title: string; dependencyTitles: string[] }>;
  onOpenObject: (id: string) => void;
  onAcceptReview: (id: string) => void;
  proposedCount: number;
  onAnswerGap: (gap: GapItem, answer: string) => void;
  onOpenStudio: () => void;
  onOpenAssets: () => void;
  onOpenProposals: () => void;
  onOpenContradictions: () => void;
  /** «چه چیزی عوض شد»: opens the 7-day change feed */
  onOpenChanges: () => void;
}

const MAX_QUESTIONS = 3;

/** The home of the Context: not a tree, but "what needs you" — open questions first (answer in one line), then conflicts, stale outputs, AI suggestions. */
export const AttentionPanel: React.FC<Props> = ({ specTitle, gaps, contradictionCount, staleCount, reviews, onOpenObject, onAcceptReview, proposedCount, onAnswerGap, onOpenStudio, onOpenAssets, onOpenProposals, onOpenContradictions, onOpenChanges }) => {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const questions = gaps.slice(0, MAX_QUESTIONS);
  const total = gaps.length + contradictionCount + staleCount + proposedCount + reviews.length;

  const submit = (gap: GapItem) => {
    const v = draft[gap.key]?.trim();
    if (!v) return;
    onAnswerGap(gap, v);
    setDraft((d) => ({ ...d, [gap.key]: '' }));
  };

  const chips: Array<{ icon: IconName; label: string; count: number; onClick?: () => void; hint: string }> = [
    { icon: 'Info', label: 'سؤال باز', count: gaps.length, onClick: onOpenStudio, hint: 'برای ساخت خروجی لازم است' },
    { icon: 'TriangleAlert', label: 'تناقض', count: contradictionCount, onClick: onOpenContradictions, hint: 'دو مورد با هم نمی‌خوانند (پایین همین صفحه)' },
    { icon: 'Network', label: 'نیاز به بازبینی', count: reviews.length, onClick: () => document.getElementById('needs-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), hint: 'تصمیمی که به آن وابسته‌ای عوض شده' },
    { icon: 'RefreshCw', label: 'خروجی قدیمی', count: staleCount, onClick: onOpenAssets, hint: 'دانش عوض شده و خروجی هنوز قدیمی است' },
    { icon: 'Inbox', label: 'پیشنهاد AI', count: proposedCount, onClick: onOpenProposals, hint: 'منتظر تأیید تو' },
  ];

  return (
    <Card padding="xl" className="flex flex-col gap-stack-lg" aria-label="چه چیزی به تو نیاز دارد">
      <div className="flex flex-col gap-stack-xs">
        <div className="flex flex-wrap items-center gap-inline-sm">
          <h2 className="heading-sm text-text-default">چه چیزی به تو نیاز دارد؟</h2>
          <Badge intent={total ? 'warning' : 'success'} icon={false}>{total ? `${formatNumber(total)} مورد` : 'همه‌چیز هماهنگ است'}</Badge>
        </div>
        <p className="body-sm text-text-subtle">
          {total ? `هر پاسخ کوتاه همین‌جا ثبت می‌شود و مستقیم وارد منبع حقیقت می‌شود. سؤال‌ها براساس جریان «${specTitle}» هستند.` : 'سؤال بازی، تناقضی یا خروجی قدیمی‌ای وجود ندارد.'}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-inline-md lg:grid-cols-5">
        {chips.map((c) => {
          const inner = (
            <>
              <span className="flex items-center gap-inline-xs label-md text-text-default"><Icon name={c.icon} size="md" className={c.count ? 'text-icon-warning' : 'text-icon-subtle'} />{c.label}</span>
              <span className="text-numeric-md tabular-nums text-text-default">{formatNumber(c.count)}</span>
              <span className="caption text-text-subtle">{c.hint}</span>
            </>
          );
          const cls = 'flex h-full w-full flex-col items-start gap-stack-xs rounded-control border border-border-default bg-surface-sunken p-inset-md text-start';
          return (
            <li key={c.label}>
              {c.onClick && c.count > 0 ? (
                <button type="button" onClick={c.onClick} className={`${cls} min-h-touch-comfortable transition-colors hover:bg-interaction-hover active:bg-interaction-pressed`}>{inner}</button>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <Button variant="ghost" size="sm" iconStart="History" onClick={onOpenChanges}>در ۷ روز اخیر چه چیزی عوض شد؟</Button>
      </div>

      {reviews.length > 0 && (
        <div id="needs-review" className="flex flex-col gap-stack-md border-t border-border-default pt-inset-lg">
          <h3 className="title text-text-default">نیاز به بازبینی</h3>
          <ul className="flex flex-col gap-stack-sm">
            {reviews.slice(0, MAX_QUESTIONS).map((r) => (
              <li key={r.id} className="flex flex-col gap-stack-xs sm:flex-row sm:items-center sm:justify-between">
                <span className="body-md text-text-default">«{r.title}» به {r.dependencyTitles.map((t) => `«${t}»`).join('، ')} وابسته است و آن تغییر کرده.</span>
                <span className="flex gap-inline-xs">
                  <Button size="sm" variant="ghost" onClick={() => onOpenObject(r.id)}>باز کن</Button>
                  <Button size="sm" variant="secondary" onClick={() => onAcceptReview(r.id)}>بدون تغییر بپذیر</Button>
                </span>
              </li>
            ))}
          </ul>
          {reviews.length > MAX_QUESTIONS && <p className="body-sm text-text-subtle">{formatNumber(reviews.length - MAX_QUESTIONS)} مورد دیگر هم هست؛ هرکدام را از ساختار درخت باز کن.</p>}
        </div>
      )}

      {questions.length > 0 && (
        <div className="flex flex-col gap-stack-md border-t border-border-default pt-inset-lg">
          <h3 className="title text-text-default">سؤال‌های باز</h3>
          <ul className="flex flex-col gap-stack-md">
            {questions.map((g) => (
              <li key={g.key} className="flex flex-col gap-stack-xs">
                <span className="label-md text-text-default">{g.label}</span>
                <span className="body-sm text-text-subtle">{g.question}</span>
                <div className="flex flex-col items-stretch gap-inline-sm sm:flex-row sm:items-end">
                  <TextField
                    label={`پاسخ برای «${g.label}»`}
                    placeholder="یک یا دو جمله…"
                    value={draft[g.key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [g.key]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(g); }}
                  />
                  <Button variant="secondary" disabled={!draft[g.key]?.trim()} onClick={() => submit(g)}>ثبت</Button>
                </div>
              </li>
            ))}
          </ul>
          {gaps.length > MAX_QUESTIONS && <p className="caption text-text-subtle">{formatNumber(gaps.length - MAX_QUESTIONS)} سؤال دیگر در استودیوی جریان‌های کار هست.</p>}
        </div>
      )}
    </Card>
  );
};
