/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import type { ContextChange } from '../types';
import { ACTOR_FA } from '../core/changeLog';
import { draftsLabel, milestoneLabel, newestFirst, versionHistory } from '../core/versionHistory';
import type { VersionHistory } from '../core/versionHistory';
import { Badge, formatJalaliDate, formatNumber } from '../ui';
import { ChangeEntry } from './ChangeEntry';

interface Lookups { titleOf?: (id: string) => string; nodeLabel?: (id: string) => string }

/** «آخرین تأیید: نسخهٔ N» (+ how many drafts came after it). Nothing for an object that was never approved. */
export const ApprovalBadge: React.FC<{ history: VersionHistory }> = ({ history: h }) => (
  <span className="flex flex-wrap items-center gap-inline-xs">
    {h.lastApproval
      ? <Badge intent="success" icon="Check">آخرین تأیید: نسخهٔ {formatNumber(h.lastApproval.version)} · {formatJalaliDate(h.lastApproval.at)}</Badge>
      : <Badge intent="neutral" icon={false}>هنوز تأیید نشده</Badge>}
    {h.draftsSinceApproval > 0 && <Badge intent="warning" icon={false}>{formatNumber(h.draftsSinceApproval)} پیش‌نویس {h.lastApproval ? 'پس از آن' : ''}</Badge>}
  </span>
);

/** The path from the first draft to the approval, newest first: drafts are one closed row («N پیش‌نویس»), an approval is a milestone. */
export const VersionHistoryView: React.FC<{ changes: ContextChange[] } & Lookups> = ({ changes, ...l }) => {
  const history = useMemo(() => versionHistory(changes), [changes]);
  const entries = newestFirst(history);
  if (!entries.length) return <p className="body-md text-text-subtle">هنوز تغییری ثبت نشده است.</p>;
  return (
    <div className="flex flex-col gap-stack-sm">
      <ol className="flex flex-col gap-stack-sm" aria-label="مسیر نسخه‌ها (جدیدترین اول)">
        {entries.map((e) => {
          if (e.type === 'event') return <ChangeEntry key={e.id} change={e.change} {...l} />;
          if (e.type === 'milestone') {
            return (
              <li key={e.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-success bg-surface-sunken p-inset-md">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <Badge intent="success" icon="Check">{milestoneLabel(e, formatNumber)}</Badge>
                  <span className="body-sm text-text-subtle">{ACTOR_FA[e.actor]}{e.actorLabel ? ` (${e.actorLabel})` : ''} · {formatJalaliDate(e.at)}</span>
                </div>
                {e.reason && <p className="body-sm text-text-default"><span className="label-sm text-text-subtle">دلیل: </span>{e.reason}</p>}
                {e.how === 'edited' && <ul className="flex flex-col gap-stack-xs">{e.changes.map((c) => <ChangeEntry key={c.id} change={{ ...c, reason: undefined }} {...l} />)}</ul>}
              </li>
            );
          }
          return (
            <li key={e.id} className="rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
              <details>
                <summary className="flex min-h-touch cursor-pointer flex-wrap items-center justify-between gap-inline-sm">
                  <Badge intent="neutral" icon="Pencil">{draftsLabel(e, formatNumber)}</Badge>
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
