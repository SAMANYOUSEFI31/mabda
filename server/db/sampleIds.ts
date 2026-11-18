/**
 * Which rows Mabda wrote as an example, not the person: every id of the first-run spaces (src/core/seedData.ts) and of the
 * showcase (src/core/demoData.ts). Those ids are fixed in the code and carry only the person's suffix (server/db/userIds.ts), so
 * a row's origin can be read from its id alone, for rows made today and for rows made before the `Sample` provenance existed.
 *
 * Goal: a pre-written item is never shown as «نوشتهٔ خودت» and never counted as the person's own work in the test measures.
 */
import { buildDemo, DEMO_ID } from '../../src/core/demoData.ts';
import { INITIAL_CONTEXT_OBJECTS, INITIAL_NOTES, INITIAL_WORKSPACES } from '../../src/core/seedData.ts';
import type { ContextObject } from '../../src/types/index.ts';

const SUFFIX = /_[0-9a-f]{10}$/;
let ids: Set<string> | undefined;
let texts: Map<string, { title: string; content: string }> | undefined;

function baseIds(): Set<string> {
  if (ids) return ids;
  const demo = buildDemo(new Date('2026-01-01T00:00:00Z'));
  ids = new Set<string>([
    ...INITIAL_CONTEXT_OBJECTS.map((o) => o.id), ...INITIAL_NOTES.map((n) => n.id),
    ...demo.objects.map((o) => o.id), ...demo.notes.map((n) => n.id),
  ]);
  texts = new Map([...INITIAL_CONTEXT_OBJECTS, ...demo.objects].map((o) => [o.id, { title: o.title, content: o.content }]));
  return ids;
}

/** the text the code wrote for an example object (to tell an untouched example from one the person wrote over) */
export function seededText(id: string): { title: string; content: string } | undefined {
  baseIds();
  return texts!.get(id.replace(SUFFIX, ''));
}

/** a row whose id is one of the code's example ids (with or without the person's suffix) */
export const isSeededId = (id: unknown): boolean => typeof id === 'string' && baseIds().has(id.replace(SUFFIX, ''));

/** the spaces Mabda makes as examples: the two first-run spaces and the showcase (with or without the suffix) */
export const isSeededSpaceId = (id: unknown): boolean => typeof id === 'string' && [DEMO_ID, ...INITIAL_WORKSPACES.map((w) => w.id)].includes(id.replace(SUFFIX, ''));

/** example objects are stored with the provenance that says so */
export const asSample = <T extends Pick<ContextObject, 'provenance'>>(o: T): T => ({ ...o, provenance: 'Sample' });
