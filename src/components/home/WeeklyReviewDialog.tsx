/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STRUCTURE_REASON } from '../../core/decisionOrder';
import type { InheritNotice } from '../../core/inheritNotice';
import { InheritNoticeList } from './InheritNoticeList';
import { DueItems } from './DueItems';
import React, { useMemo, useState } from 'react';
import type { ContextObject, GeneratedDeliverable, Measurement, Metric } from '../../types';
import { MetricQuickEntry } from '../metrics/MetricQuickEntry';
import type { WeeklyReviewData, WorkstreamReadiness } from '../../core/weeklyReview';
import { ACTOR_FA, CHANGE_KIND_FA } from '../../core/changeLog';
import { Badge, Button, Dialog, Progress, ReadinessBadge, formatJalaliDate, formatNumber } from '../../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  data: WeeklyReviewData;
  inheritNotices?: InheritNotice[];
  onSeenInherit?: (key: string) => void;
  onOpenSection?: (nodeId: string) => void;
  readiness: WorkstreamReadiness[];
  objects: ContextObject[];
  deliverables: GeneratedDeliverable[];
  onAcceptReview: (id: string) => Promise<void>;
  /** Proposed → Confirmed (the same action as the inbox's «تأیید») */
  onConfirm: (id: string) => Promise<void>;
  onOpenObject: (o: ContextObject) => void;
  onDone: () => Promise<void>;
  /** what has come due (assumptions to look at again, decisions asking «نتیجه چه شد؟») */
  dueProps: React.ComponentProps<typeof DueItems>;
  /** the numbers of this week: shown as a step only when there is an active metric; recording stays optional */
  metricsEntry?: { metrics: Metric[]; measurements: Measurement[]; onSubmit: React.ComponentProps<typeof MetricQuickEntry>['onSubmit']; onCsv: React.ComponentProps<typeof MetricQuickEntry>['onCsv'] };
}

const BASE_STEPS = ['تغییرها', 'نیاز به بازبینی', 'تصمیم‌های منتظر'] as const;

/** «این هفته» — five minutes, three sections one after another, every item with a one-click action. No timers, no pressure. */
export const WeeklyReviewDialog: React.FC<Props> = (props) => (props.open ? <Review {...props} /> : null);

const Review: React.FC<Props> = ({ onClose, data, inheritNotices = [], onSeenInherit, onOpenSection, readiness, objects, deliverables, onAcceptReview, onConfirm, onOpenObject, onDone, dueProps, metricsEntry }) => {
  const hasMetrics = !!metricsEntry && metricsEntry.metrics.some((m) => !m.archived);
  const STEPS = hasMetrics ? [...BASE_STEPS, 'اعداد این هفته'] : [...BASE_STEPS];
  const LAST = STEPS.length; // the summary
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [handled, setHandled] = useState<string[]>([]); // objects the user accepted / confirmed during this review
  const title = (id: string) => objects.find((o) => o.id === id)?.title ?? id;
  const open = (id: string) => { const o = objects.find((x) => x.id === id); if (o) onOpenObject(o); };

  const run = async (key: string, ids: string[], fn: (id: string) => Promise<void>) => {
    setBusy(key);
    try { for (const id of ids) { await fn(id); setHandled((h) => [...h, id]); } } finally { setBusy(null); }
  };
  const reviewsLeft = data.reviews.filter((r) => !handled.includes(r.object.id));
  const notDone = (ids: string[]) => ids.filter((id) => objects.find((o) => o.id === id)?.status !== 'Confirmed' && !handled.includes(id));
  const outputs = useMemo(() => new Set(deliverables.filter((d) => handled.some((id) => (d.usedContext ?? []).some((u) => u.id === id))).map((d) => d.id)).size, [handled, deliverables]);

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={step < LAST ? `این هفته — بخش ${formatNumber(step + 1)} از ${formatNumber(LAST)}: ${STEPS[step]}` : 'این هفته — جمع‌بندی'}
      description="پنج دقیقه کافی است: چند بخش پشت‌سرهم و برای هر مورد یک اقدام. هر چیزی که بپذیری یا تأیید کنی در تاریخچهٔ تغییرها ثبت می‌شود."
      footer={
        step < LAST ? (
          <>
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>قبلی</Button>
            <Button variant="secondary" iconEnd="ArrowLeft" onClick={() => setStep(step + 1)}>{step === LAST - 1 ? 'جمع‌بندی' : 'دیدم؛ بعدی'}</Button>
          </>
        ) : (
          <><Button variant="ghost" onClick={() => setStep(0)}>از اول</Button><Button variant="primary" loading={busy === 'done'} onClick={async () => { setBusy('done'); try { await onDone(); onClose(); } finally { setBusy(null); } }}>بازبینی تمام شد</Button></>
        )
      }
    >
      <ol className="mb-stack-md flex flex-wrap gap-inline-xs" aria-label="گام‌های بازبینی">
        {STEPS.map((s, i) => <li key={s}><Badge icon={false} aria-current={i === step ? 'step' : undefined} className={i === step ? 'text-text-default' : undefined}>{formatNumber(i + 1)}. {s}</Badge></li>)}
      </ol>

      {step === 0 && (
        data.digest.total === 0 ? <p className="body-md text-text-subtle">در این هفته چیزی عوض نشده است.</p> : (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">{formatNumber(data.digest.total)} تغییر در هفتهٔ اخیر{data.digest.assetsToReview ? `؛ ${formatNumber(data.digest.assetsToReview)} خروجی نیاز به بازبینی دارد` : ''}.</p>
            {data.digest.groups.map((g) => (
              <section key={g.key} aria-label={`تغییرهای ${ACTOR_FA[g.actor]}`} className="flex flex-col gap-stack-xs">
                <h3 className="title text-text-default">{ACTOR_FA[g.actor]}{g.label ? ` (${g.label})` : ''} · {formatNumber(g.entries.length)}</h3>
                <ul className="flex flex-col gap-stack-xs">
                  {g.entries.slice(0, 6).map((e) => (
                    <li key={e.change.id} className="body-sm flex flex-wrap items-center justify-between gap-inline-sm text-text-default">
                      <span>{CHANGE_KIND_FA[e.change.kind]}: «{e.title}»{e.change.reason ? ` — ${e.change.reason}` : ''}</span>
                      <span className="flex items-center gap-inline-xs text-text-subtle">{formatJalaliDate(e.change.at)}<Button size="sm" variant="ghost" onClick={() => open(e.change.objectId)}>باز کن</Button></span>
                    </li>
                  ))}
                </ul>
                {g.entries.length > 6 && <p className="body-sm text-text-subtle">{formatNumber(g.entries.length - 6)} تغییر دیگر هم هست؛ در «چه چیزی عوض شد» دیده می‌شود.</p>}
              </section>
            ))}
            {onSeenInherit && onOpenSection && <InheritNoticeList notices={inheritNotices} onSeen={onSeenInherit} onOpenSection={onOpenSection} onOpenObject={(id) => open(id)} />}
          </div>
        )
      )}

      {step === 1 && (
        reviewsLeft.length === 0 ? <p className="body-md text-text-subtle">چیزی نیاز به بازبینی ندارد.</p> : (
          <div className="flex flex-col gap-stack-md">
            <div><Button size="sm" variant="secondary" loading={busy === 'all-reviews'} onClick={() => run('all-reviews', reviewsLeft.map((r) => r.object.id), onAcceptReview)}>همه را بدون تغییر بپذیر ({formatNumber(reviewsLeft.length)})</Button></div>
            <ul className="flex flex-col gap-stack-sm">
              {reviewsLeft.map((r) => (
                <li key={r.object.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md sm:flex-row sm:items-center sm:justify-between">
                  <span className="body-md text-text-default">«{r.object.title}» به {r.dependencyTitles.map((t) => `«${t}»`).join('، ')} وابسته است و آن تغییر کرده.</span>
                  <span className="flex gap-inline-xs">
                    <Button size="sm" variant="ghost" onClick={() => open(r.object.id)}>باز کن</Button>
                    <Button size="sm" variant="secondary" loading={busy === r.object.id} onClick={() => run(r.object.id, [r.object.id], onAcceptReview)}>بدون تغییر بپذیر</Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {step === 2 && (
        data.waiting.ready.length + data.waiting.blocked.length + data.waiting.concurrent.length === 0 && dueProps.assumptions.length + dueProps.decisions.length === 0 ? <p className="body-md text-text-subtle">تصمیم منتظری نیست.</p> : (
          <div className="flex flex-col gap-stack-lg">
            <DueItems {...dueProps} />
            {data.waiting.ready.length > 0 && (
              <section className="flex flex-col gap-stack-xs" aria-label="آمادهٔ تصمیم">
                <h3 className="title text-text-default">آمادهٔ تصمیم</h3>
                <ul className="flex flex-col gap-stack-xs">
                  {data.waiting.ready.map((u) => (
                    <li key={u.ids[0]} className="flex flex-wrap items-center justify-between gap-inline-sm">
                      <span className="flex flex-col gap-stack-xs"><span className="body-md text-text-default">«{title(u.ids[0])}»</span>{data.structure[u.ids[0]] ? <span className="body-sm text-text-subtle">{STRUCTURE_REASON}</span> : null}</span>
                      <span className="flex gap-inline-xs">
                        <Button size="sm" variant="ghost" onClick={() => open(u.ids[0])}>باز کن</Button>
                        <Button size="sm" variant="secondary" disabled={!notDone(u.ids).length} loading={busy === u.ids[0]} onClick={() => run(u.ids[0], notDone(u.ids), onConfirm)}>تأیید</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.waiting.concurrent.length > 0 && (
              <section className="flex flex-col gap-stack-xs" aria-label="تصمیم همزمان">
                <h3 className="title text-text-default">تصمیم همزمان</h3>
                <p className="body-sm text-text-subtle">هرکدام روی دیگری سوار است؛ با هم بررسی و با هم تأیید می‌شوند.</p>
                <ul className="flex flex-col gap-stack-sm">
                  {data.waiting.concurrent.map((u) => (
                    <li key={u.ids.join('+')} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                      <span className="body-md text-text-default">{u.ids.map((id) => `«${title(id)}»`).join('، ')}</span>
                      <span><Button size="sm" variant="secondary" disabled={!notDone(u.ids).length} loading={busy === u.ids.join('+')} onClick={() => run(u.ids.join('+'), notDone(u.ids), onConfirm)}>همه را با هم تأیید کن</Button></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.waiting.blocked.length > 0 && (
              <section className="flex flex-col gap-stack-xs" aria-label="بلاک‌شده">
                <h3 className="title text-text-default">بلاک‌شده</h3>
                <ul className="flex flex-col gap-stack-xs">
                  {data.waiting.blocked.map((u) => <li key={u.ids[0]} className="body-md text-text-default">«{title(u.ids[0])}» منتظر تأیید {u.blockedBy.map((b) => `«${title(b)}»`).join('، ')} است.</li>)}
                </ul>
              </section>
            )}
          </div>
        )
      )}

      {hasMetrics && step === 3 && metricsEntry && (
        <MetricQuickEntry metrics={metricsEntry.metrics} measurements={metricsEntry.measurements} onSubmit={metricsEntry.onSubmit} onCsv={metricsEntry.onCsv} />
      )}

      {step === LAST && (
        <div className="flex flex-col gap-stack-lg">
          <p className="body-md text-text-default">
            {handled.length ? `در این بازبینی ${formatNumber(handled.length)} مورد را پذیرفتی یا تأیید کردی.${outputs ? ` چون این موارد را تأیید کردی، ${formatNumber(outputs)} خروجی تو از آن‌ها استفاده می‌کنند.` : ''}` : 'این هفته چیزی را تغییر ندادی؛ هرچه دیدی همان‌طور که بود ماند.'}
          </p>
          <section aria-label="آمادگی جریان‌های کار" className="flex flex-col gap-stack-sm">
            <h3 className="title text-text-default">آمادگی برای هر جریان کار</h3>
            <ul className="flex flex-col gap-stack-sm">
              {readiness.map((r) => (
                <li key={r.specId} className="flex flex-col gap-stack-xs">
                  <span className="flex flex-wrap items-center justify-between gap-inline-sm"><span className="label-md text-text-default">{r.title}</span><ReadinessBadge value={r.status} /></span>
                  <Progress value={r.score} max={100} label="آمادگی" showValue={false} intent={r.status === 'ready' ? 'success' : 'neutral'} />
                  <span className="body-sm text-text-subtle">{r.missing ? `${formatNumber(r.missing)} مورد ضروری هنوز کم است.` : 'همهٔ موارد ضروری هست.'}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Dialog>
  );
};
