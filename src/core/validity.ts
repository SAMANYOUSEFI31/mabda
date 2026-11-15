/**
 * CORE-05: the one definition of «valid knowledge» that every engine reads (gaps and readiness, contradictions, the comparison
 * of truth over time, the Context pack, the AI's guardrails).
 *
 *  • live      : not Archived and not Superseded (contextStatus.ts)
 *  • expired   : `validUntil` has passed. A date (YYYY-MM-DD) is valid through the END of that day in Tehran (tehranDate.ts),
 *                so a picked date never ends a day early or runs into the next morning.
 *  • exceptions: an `overrides` link switches an ancestor's item off only inside the overriding item's sub-tree, and only
 *                while that item is itself valid. That is place-dependent, so it lives in effectiveContext.ts (effectiveFor),
 *                which uses `isExpired` from here.
 */
import type { ContextObject } from '../types';
import { isActiveContext } from './contextStatus';
import { tehranDayEnd } from './tehranDate';

const toMs = (d: Date | string | number) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Date.parse(d));

/** `validUntil` is a day (YYYY-MM-DD, Tehran calendar) or a timestamp */
export function isExpired(o: Pick<ContextObject, 'validUntil'>, now: Date | string | number): boolean {
  if (!o.validUntil) return false;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(o.validUntil) ? Date.parse(tehranDayEnd(o.validUntil)) : Date.parse(o.validUntil);
  return Number.isFinite(t) && t < toMs(now);
}

/** live and not expired: may count as knowledge anywhere (exceptions are per place: effectiveFor) */
export const isValidKnowledge = (o: Pick<ContextObject, 'status' | 'validUntil'>, now: Date | string | number): boolean =>
  isActiveContext(o) && !isExpired(o, now);
