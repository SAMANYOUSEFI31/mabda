/**
 * «در این فضا»: one count of the space, in the words of the knowledge states (content.md واژه‌نامه; meaning-map.md):
 * دانش is any piece of the source in any state; حقیقت is دانش that is confirmed. Home and «منبع حقیقت» both read their numbers
 * from here, so the same thing is never called by two words or counted two ways. Pure.
 */

import type { ContextObject } from '../types';

export interface SpaceTally {
  /** confirmed knowledge (a confirmed assumption is truth too: it is used, in its own «فرض» part) */
  truth: number;
  /** confirmed knowledge that something it rests on changed under («قدیمی») */
  stale: number;
  /** suggestions waiting for a yes */
  proposed: number;
  /** open thoughts (every kind) */
  thoughts: number;
}

const live = (o: Pick<ContextObject, 'status' | 'sample'>) => o.status !== 'Archived' && o.status !== 'Superseded' && !o.sample;

export function spaceTally(objects: Array<Pick<ContextObject, 'status' | 'sample'>>, openThoughts: number): SpaceTally {
  const mine = objects.filter(live);
  return {
    truth: mine.filter((o) => o.status === 'Confirmed').length,
    stale: mine.filter((o) => o.status === 'Needs Review').length,
    proposed: mine.filter((o) => o.status === 'Proposed').length,
    thoughts: Math.max(0, openThoughts),
  };
}
