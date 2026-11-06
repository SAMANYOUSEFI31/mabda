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

const today = (now: Date | string | number) => new Date(now).toISOString().slice(0, 10);

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
