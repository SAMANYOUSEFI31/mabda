/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NuqtaState } from '../../ui';
import React, { useMemo, useState } from 'react';
import type { ContextChange } from '../../types';
import { ACTOR_FA } from '../../core/changeLog';
import { draftsLabel, milestoneLabel, newestFirst, versionHistory, versionTexts } from '../../core/versionHistory';
import type { VersionHistory } from '../../core/versionHistory';
import { Badge, Nuqta, Select, formatJalaliDate, formatNumber } from '../../ui';
import { BeforeAfter } from '../shared/BeforeAfter';
import { ChangeEntry } from './ChangeEntry';
import { ClosedSection } from '../shared/ClosedSection';

interface Lookups { titleOf?: (id: string) => string; nodeLabel?: (id: string) => string }

/** «آخرین تأیید: نسخهٔ N» (+ how many drafts came after it). Nothing for an object that was never approved. */
/** `state`: the item's shown state now (displayState), so a contradicting or stale truth never wears the solid dot here */
export const ApprovalBadge: React.FC<{ history: VersionHistory; state?: NuqtaState }> = ({ history: h, state = 'truth' }) => (
  <span className="flex flex-wrap items-center gap-inline-xs">
    {h.lastApproval
      ? <span className="inline-flex items-center gap-inline-xs body-sm text-text-default"><Nuqta state={state} size="sm" />آخرین تأیید: نسخهٔ {formatNumber(h.lastApproval.version)} · {formatJalaliDate(h.lastApproval.at)}</span>
      : <span className="inline-flex items-center gap-inline-xs body-sm text-text-subtle"><Nuqta state="proposed" size="sm" />هنوز تأیید نشده</span>}
    {h.draftsSinceApproval > 0 && <span className="inline-flex items-center gap-inline-xs body-sm text-text-subtle"><Nuqta state="proposed" size="sm" />{formatNumber(h.draftsSinceApproval)} پیش‌نویس {h.lastApproval ? 'پس از آن' : ''}</span>}
  </span>
);

/** The path from the first draft to the approval, newest first: drafts are one closed row («N پیش‌نویس»), an approval is a milestone. */
export const VersionHistoryView: React.FC<{ changes: ContextChange[] } & Lookups> = ({ changes, ...l }) => {
  const history = useMemo(() => versionHistory(changes), [changes]);
  const entries = newestFirst(history);
  const texts = useMemo(() => versionTexts(changes), [changes]);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  if (!entries.length) return <p className="body-md text-text-subtle">هنوز تغییری ثبت نشده است.</p>;
  const a = texts.find((t) => t.version === (from ?? texts[texts.length - 2]?.version));
  const b = texts.find((t) => t.version === (to ?? texts[texts.length - 1]?.version));
  // the newest draft group is open: the last change is seen without a hunt
  const newestDrafts = entries.find((e) => e.type === 'drafts')?.id;
  const opts = texts.map((t) => ({ value: String(t.version), label: `نسخهٔ ${formatNumber(t.version)} · ${formatJalaliDate(t.at)}` }));
  return (
    <div className="flex flex-col gap-stack-sm">
      {texts.length >= 2 && (
        <ClosedSection title="مقایسهٔ دو نسخه">
          <div className="flex flex-col gap-stack-sm" data-testid="compare-versions">
            <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-2">
              <Select label="از نسخهٔ" value={String(a?.version ?? '')} options={opts} onChange={(e) => setFrom(Number(e.target.value))} />
              <Select label="تا نسخهٔ" value={String(b?.version ?? '')} options={opts} onChange={(e) => setTo(Number(e.target.value))} />
            </div>
            {a && b && <>
              {a.title !== b.title && <BeforeAfter before={a.title} after={b.title} />}
              <BeforeAfter before={a.content} after={b.content} />
            </>}
          </div>
        </ClosedSection>
      )}
      <ol className="flex flex-col gap-stack-sm" aria-label="مسیر نسخه‌ها (جدیدترین اول)">
        {entries.map((e) => {
          if (e.type === 'event') return <ChangeEntry key={e.id} change={e.change} {...l} />;
          if (e.type === 'milestone') {
            return (
              <li key={e.id} className="flex flex-col gap-stack-xs border-s border-border-bold ps-inset-md py-inset-xs">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <span className="inline-flex items-center gap-inline-xs label-md text-text-default"><Nuqta state="truth" size="sm" />{milestoneLabel(e, formatNumber)}</span>
                  <span className="body-sm text-text-subtle">{ACTOR_FA[e.actor]}{e.actorLabel ? ` (${e.actorLabel})` : ''} · {formatJalaliDate(e.at)}</span>
                </div>
                {e.reason && <p className="body-sm text-text-default"><span className="label-sm text-text-subtle">دلیل: </span>{e.reason}</p>}
                {e.how === 'edited' && <ul className="flex flex-col gap-stack-xs">{e.changes.map((c) => <ChangeEntry key={c.id} bare change={{ ...c, reason: undefined }} {...l} />)}</ul>}
              </li>
            );
          }
          return (
            <li key={e.id} className="border-s border-border-default ps-inset-md py-inset-xs">
              <details open={e.id === newestDrafts || undefined}>
                <summary className="flex min-h-touch cursor-pointer flex-wrap items-center justify-between gap-inline-sm">
                  <span className="inline-flex items-center gap-inline-xs body-md text-text-default"><Nuqta state="proposed" size="sm" />{draftsLabel(e, formatNumber)}</span>
                  <span className="body-sm text-text-subtle">نسخهٔ {formatNumber(e.fromVersion)} تا {formatNumber(e.toVersion)} · {formatJalaliDate(e.at)}</span>
                </summary>
                <ul className="mt-stack-sm flex flex-col gap-stack-xs" aria-label="پیش‌نویس‌ها (جدیدترین اول)">
                  {[...e.changes].reverse().map((c) => <ChangeEntry key={c.id} change={c} {...l} />)}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
