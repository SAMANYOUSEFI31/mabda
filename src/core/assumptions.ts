/**
 * Assumptions and decision records — what a model may be told, and what it must NOT take as fact.
 *
 *  • an assumption is a Fact the user wrote down as «we think so»: it is never «confirmed knowledge», even when its
 *    status is Confirmed; it travels to a model only in its own labelled section, with an explicit instruction
 *  • a Decision's record keeps the options that were weighed; the rejected ones go to the model so it does not propose
 *    them again
 *  • due dates (`reviewBy`, `record.reviewOn`) are derived — nothing is scheduled or sent
 * Pure.
 */

import { tehranDay } from './tehranDate';
import type { ContextChange, ContextObject } from '../types';
import { isActiveContext } from './contextStatus';

export const ASSUMPTION_RULE = 'این‌ها فرض‌اند، نه واقعیت. آن‌ها را واقعیت نگیر و چیزی را بر پایه‌شان قطعی ننویس؛ اگر لازم شد، صریح بگو «بر پایهٔ فرض …».';
export const REJECTED_RULE = 'این گزینه‌ها بررسی و رد شده‌اند. دوباره پیشنهادشان نکن مگر کاربر خودش بخواهد.';

export const isAssumption = (o: Pick<ContextObject, 'assumption' | 'status'>) => o.assumption === true && isActiveContext(o);
/** confirmed KNOWLEDGE: Confirmed and not an assumption */
export const isEstablished = (o: Pick<ContextObject, 'assumption' | 'status'>) => o.status === 'Confirmed' && o.assumption !== true;

export interface RejectedOption { objectId: string; objectTitle: string; title: string; reason: string }
/** options that were weighed and rejected, from live Decisions (a superseded decision's rejections are history, not a rule) */
export function rejectedOptions(objects: ContextObject[]): RejectedOption[] {
  const out: RejectedOption[] = [];
  for (const o of objects) {
    if (o.type !== 'Decision' || !isActiveContext(o) || o.status === 'Proposed') continue;
    for (const opt of o.record?.options ?? []) if (opt.rejectedReason) out.push({ objectId: o.id, objectTitle: o.title, title: opt.title, reason: opt.rejectedReason });
  }
  return out;
}

// «today» is the Tehran day (tehranDate.ts): a date due today is due from 00:00 in Tehran, not from 03:30
const today = (now: Date | string | number) => tehranDay(now);

/** assumptions whose review date has come (inclusive) */
export function assumptionsDue(objects: ContextObject[], now: Date | string | number): ContextObject[] {
  const t = today(now);
  return objects.filter((o) => isAssumption(o) && !!o.reviewBy && o.reviewBy <= t).sort((a, b) => a.reviewBy!.localeCompare(b.reviewBy!) || a.id.localeCompare(b.id));
}

/** decisions whose «look back» date (or the date of their metric expectation) has come and whose outcome nobody has written down yet */
export function decisionsDue(objects: ContextObject[], changes: Pick<ContextChange, 'objectId' | 'kind' | 'at'>[], now: Date | string | number): ContextObject[] {
  const t = today(now);
  const noted = new Set(changes.filter((c) => c.kind === 'outcome_noted').map((c) => c.objectId));
  const dueOn = (o: ContextObject) => o.record?.reviewOn ?? o.record?.metricExpectation?.by;
  return objects.filter((o) => o.type === 'Decision' && o.status === 'Confirmed' && !!dueOn(o) && dueOn(o)! <= t && !noted.has(o.id)).sort((a, b) => dueOn(a)!.localeCompare(dueOn(b)!) || a.id.localeCompare(b.id));
}

/**
 * The next look at something the user could not judge yet — «هنوز زود است» on a decision's look-back, «هنوز فرض است» on an
 * assumption's review: how many days until the next look (decisions.md §۵۱).
 * Principle: the next look comes when there can be NEW EVIDENCE, not after a fixed number.
 *  • tied to a metric: two more numbers at its cadence (one number is a point; two give a direction) — 14 days weekly, 60 monthly
 *  • no metric: the user's own horizon — the wait they set the LAST time this date was set (that moment → the review date), kept in a
 *    sane band (a week at least, so it is not asked again tomorrow; a quarter at most, so it is not forgotten). Counted from the
 *    last look, not from when the item was written: an item written a year ago with a review in a month means «a month»
 *  • nothing to go on: 30 days
 * The new date is always counted from today, the look that just happened. For a monitor the date stands for «two numbers have
 * come»: numbers come at the monitor's cadence (Home asks for each one), so the date is where they are expected; when they have
 * not come, the look still happens and shows that the evidence is missing, which is itself worth seeing.
 */
export const TOO_EARLY_MIN_DAYS = 7;
export const TOO_EARLY_MAX_DAYS = 90;
/** when the review date of an item was last set: the latest change that wrote it, else when the item was written */
const reviewOnOf = (r: unknown) => (typeof r === 'object' && r !== null ? (r as { reviewOn?: unknown }).reviewOn : undefined);
export const lastLookAt = (o: Pick<ContextObject, 'id' | 'createdAt'>, changes: Array<Pick<ContextChange, 'objectId' | 'at' | 'after'> & { before?: Record<string, unknown> }>): string => {
  // a change that wrote the date: `reviewBy`, or a record whose `reviewOn` differs from before (editing a decision's options is not a look)
  const set = changes.filter((c) => c.objectId === o.id && c.after && ('reviewBy' in c.after || ('record' in c.after && reviewOnOf(c.after.record) !== undefined && reviewOnOf(c.after.record) !== reviewOnOf(c.before?.record))));
  return set.reduce((m, c) => (c.at > m ? c.at : m), '') || o.createdAt;
};
export const nextLookDays = (input: { cadence?: 'week' | 'month'; decidedAt?: string; reviewOn?: string }): number => {
  if (input.cadence) return input.cadence === 'week' ? 14 : 60;
  const from = input.decidedAt ? Date.parse(input.decidedAt.slice(0, 10)) : NaN;
  const to = input.reviewOn ? Date.parse(input.reviewOn.slice(0, 10)) : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 30;
  const horizon = Math.round((to - from) / 86_400_000);
  return Math.min(TOO_EARLY_MAX_DAYS, Math.max(TOO_EARLY_MIN_DAYS, horizon));
};
/** «هنوز زود است» (a decision's look-back) */
export const tooEarlyWaitDays = nextLookDays;
