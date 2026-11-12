import type { ContextObject } from '../types';
import { detectContradictions } from './contextEngine';

/**
 * The ONE knowledge state a person sees for an object, wherever it is shown (tree, table, search, versions): the stored
 * status, overridden by the deterministic contradiction engine. Words are the Nuqta's names (src/ui/Nuqta.tsx).
 */
export type DisplayState = 'truth' | 'proposed' | 'stale' | 'conflict' | 'past';

export const DISPLAY_LABEL: Record<DisplayState, string> = { truth: 'حقیقت', proposed: 'پیشنهاد', stale: 'قدیمی', conflict: 'تناقض', past: 'گذشته' };

/** each object in an unresolved rule contradiction → the other side (first found). Samples never take part. */
export function conflictPartners(objects: ContextObject[]): Map<string, ContextObject> {
  const m = new Map<string, ContextObject>();
  for (const c of detectContradictions(objects.filter((o) => !o.sample))) {
    if (!m.has(c.itemA.id)) m.set(c.itemA.id, c.itemB);
    if (!m.has(c.itemB.id)) m.set(c.itemB.id, c.itemA);
  }
  return m;
}

export function displayState(o: Pick<ContextObject, 'id' | 'status'>, partners?: Map<string, unknown>): DisplayState {
  if (o.status === 'Superseded' || o.status === 'Archived') return 'past';
  if (partners?.has(o.id)) return 'conflict';
  if (o.status === 'Needs Review') return 'stale';
  if (o.status === 'Proposed') return 'proposed';
  return 'truth';
}
