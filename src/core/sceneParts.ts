/** small pieces every scene builder shares (a card's extract and badges) */

import type { ContextObject } from '../types';
import { isExpired, reachOf } from './effectiveContext';

export const extract = (s: string, n = 140) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
export const badges = (o: ContextObject, review: boolean, now: Date) => ({
  ...(review ? { review: true } : {}), ...(o.assumption ? { assumption: true } : {}), ...(isExpired(o, now) ? { expired: true } : {}), ...(reachOf(o) === 'global' && o.reach === 'global' ? { global: true } : {}), ...(o.sample ? { sample: true } : {}),
});

