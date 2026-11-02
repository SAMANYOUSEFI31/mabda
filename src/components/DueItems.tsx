/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject } from '../types';
import { AssumptionBadge, Badge, Button, Textarea, formatJalaliDate } from '../ui';

interface Props {
  assumptions: ContextObject[];
  decisions: ContextObject[];
  titleOfNode: (nodeId: string) => string;
  /** «هنوز فرض است»: look again later (the review date moves) */
  onStillAssumed: (id: string) => Promise<void>;
  /** «واقعیت شد»: no longer an assumption; it becomes knowledge */
  onConfirmed: (id: string) => Promise<void>;
  /** «رد شد»: archived, history stays */
  onDropped: (id: string) => Promise<void>;
  /** «نتیجه چه شد؟» → a Change (`outcome_noted`) */
  onOutcome: (id: string, text: string) => Promise<void>;
}

/** What has come due: assumptions to look at again, and decisions that ask «نتیجه چه شد؟». Derived from dates — nothing notifies anyone. */
export const DueItems: React.FC<Props> = ({ assumptions, decisions, titleOfNode, onStillAssumed, onConfirmed, onDropped, onOutcome }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  if (assumptions.length === 0 && decisions.length === 0) return null;
  return (
    <section className="flex flex-col gap-stack-md" aria-label="سررسیدها">
      {assumptions.length > 0 && (
        <div className="flex flex-col gap-stack-sm">
          <h3 className="label-md text-text-default">فرض‌هایی که وقت بازبینی‌شان رسیده</h3>
          {assumptions.map((o) => (
            <div key={o.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="label-md text-text-default">{o.title}</span>
                <span className="flex items-center gap-inline-xs"><AssumptionBadge object={o} /><Badge intent="warning" icon={false}>موعد {formatJalaliDate(o.reviewBy!)}</Badge></span>
              </div>
              <p className="body-sm text-text-subtle">{titleOfNode(o.nodeId)} · {o.content}</p>
              <div className="flex flex-wrap gap-inline-xs">
                <Button size="sm" variant="secondary" loading={busy === `s${o.id}`} onClick={() => run(`s${o.id}`, () => onStillAssumed(o.id))}>هنوز فرض است</Button>
                <Button size="sm" variant="secondary" loading={busy === `c${o.id}`} onClick={() => run(`c${o.id}`, () => onConfirmed(o.id))}>واقعیت شد</Button>
                <Button size="sm" variant="ghost" loading={busy === `d${o.id}`} onClick={() => run(`d${o.id}`, () => onDropped(o.id))}>رد شد</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {decisions.length > 0 && (
        <div className="flex flex-col gap-stack-sm">
          <h3 className="label-md text-text-default">تصمیم‌هایی که وقت نگاه به عقب‌شان رسیده</h3>
          {decisions.map((o) => (
            <div key={o.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="label-md text-text-default">{o.title}</span>
                <Badge intent="warning" icon={false}>موعد {formatJalaliDate(o.record!.reviewOn!)}</Badge>
              </div>
              {o.record?.expectation && <p className="body-sm text-text-subtle">انتظار ما: {o.record.expectation}</p>}
              <Textarea label="نتیجه چه شد؟" rows={2} value={text[o.id] ?? ''} onChange={(e) => setText((t) => ({ ...t, [o.id]: e.target.value }))} />
              <div><Button size="sm" variant="secondary" loading={busy === `o${o.id}`} disabled={!(text[o.id] ?? '').trim()} onClick={() => run(`o${o.id}`, async () => { await onOutcome(o.id, text[o.id].trim()); setText((t) => ({ ...t, [o.id]: '' })); })}>ثبت نتیجه</Button></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
