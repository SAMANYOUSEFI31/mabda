/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, ExpectationVerdict } from '../types';
import type { ExpectationRow } from '../core/metrics';
import { suggestVerdict } from '../core/metrics';
import { afterSentence, expectationSentence, MX, VERDICT_FA } from '../core/metricsText';
import { AssumptionBadge, Badge, Button, Textarea, formatJalaliDate, formatNumber } from '../ui';

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
  onOutcome: (id: string, text: string, verdict?: ExpectationVerdict) => Promise<void>;
  /** expectation of a metric, read against the numbers (decisions that carry one get the three-button verdict) */
  expectations?: ExpectationRow[];
}

/** What has come due: assumptions to look at again, and decisions that ask «نتیجه چه شد؟». Derived from dates — nothing notifies anyone. */
export const DueItems: React.FC<Props> = ({ assumptions, decisions, titleOfNode, onStillAssumed, onConfirmed, onDropped, onOutcome, expectations = [] }) => {
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
          {decisions.map((o) => {
            const ex = expectations.find((e) => e.decision.id === o.id);
            const suggested = ex ? suggestVerdict(ex.reading) : null;
            const m = ex?.metric;
            const due = o.record?.reviewOn ?? o.record?.metricExpectation?.by;
            const note = text[o.id] ?? '';
            return (
              <div key={o.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <span className="label-md text-text-default">{o.title}</span>
                  {due && <Badge intent="warning" icon={false}>موعد {formatJalaliDate(due)}</Badge>}
                </div>
                {o.record?.expectation && <p className="body-sm text-text-subtle">انتظار ما: {o.record.expectation}</p>}
                {ex && m && (
                  <>
                    <p className="body-sm text-text-default">{expectationSentence({ metric: m.name, direction: ex.expectation.direction, target: ex.expectation.targetValue !== undefined ? formatNumber(ex.expectation.targetValue) : undefined, unit: m.unit, by: formatJalaliDate(ex.expectation.by) })}</p>
                    <p className="body-sm text-text-subtle">{afterSentence({ decision: o.title, before: ex.reading.before ? formatNumber(ex.reading.before.value) : undefined, after: ex.reading.after ? formatNumber(ex.reading.after.value) : undefined, unit: m.unit })}</p>
                  </>
                )}
                <Textarea label={ex ? `${MX.verdictQuestion} (یادداشت اختیاری)` : MX.verdictQuestion} rows={2} value={note} onChange={(e) => setText((tt) => ({ ...tt, [o.id]: e.target.value }))} />
                {ex ? (
                  <div className="flex flex-wrap gap-inline-xs" role="group" aria-label={MX.verdictQuestion}>
                    {(['met', 'partial', 'missed'] as const).map((v) => (
                      <Button key={v} size="sm" variant="secondary" aria-pressed={suggested === v} loading={busy === `o${o.id}${v}`} onClick={() => run(`o${o.id}${v}`, async () => { await onOutcome(o.id, note.trim(), v); setText((tt) => ({ ...tt, [o.id]: '' })); })}>{VERDICT_FA[v]}{suggested === v ? ' ✓' : ''}</Button>
                    ))}
                    {suggested && <p className="body-sm w-full text-text-subtle">علامت ✓ فقط خوانش حسابی اعداد است؛ داوری با توست.</p>}
                  </div>
                ) : (
                  <div><Button size="sm" variant="secondary" loading={busy === `o${o.id}`} disabled={!note.trim()} onClick={() => run(`o${o.id}`, async () => { await onOutcome(o.id, note.trim()); setText((tt) => ({ ...tt, [o.id]: '' })); })}>ثبت نتیجه</Button></div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
