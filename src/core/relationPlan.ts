/**
 * «روی چه اثر دارد» is NOT a new kind of relation: it is `depends_on` read the other way round (spine: depends_on is the only
 * source of precedence). Choosing «A روی B اثر دارد» means B depends on A, i.e. the dependency set of B gains A.
 * This turns the user's choice of «what this affects» into the dependency sets that have to be written. Pure.
 */

import type { ContextRelationship } from '../types';

/** the ids that currently depend on `id` (it affects them) */
export const affectedBy = (id: string, relationships: Pick<ContextRelationship, 'type' | 'sourceId' | 'targetId'>[]): string[] =>
  relationships.filter((r) => r.type === 'depends_on' && r.targetId === id).map((r) => r.sourceId);

/** the ids `id` depends on */
export const restsOn = (id: string, relationships: Pick<ContextRelationship, 'type' | 'sourceId' | 'targetId'>[]): string[] =>
  relationships.filter((r) => r.type === 'depends_on' && r.sourceId === id).map((r) => r.targetId);

/**
 * `id` should affect exactly `wanted`: for every object whose dependency set must change, its NEW full dependency set
 * (the same call the editor already uses for «بر چه تکیه دارد»). Objects that do not change are not listed; an object
 * is never made to depend on itself.
 */
export function affectPlan(id: string, wanted: string[], relationships: Pick<ContextRelationship, 'type' | 'sourceId' | 'targetId'>[]): Array<{ objectId: string; dependsOn: string[] }> {
  const now = new Set(affectedBy(id, relationships));
  const want = new Set(wanted.filter((w) => w !== id));
  const out: Array<{ objectId: string; dependsOn: string[] }> = [];
  for (const x of [...new Set([...now, ...want])].sort()) {
    if (now.has(x) === want.has(x)) continue;
    const cur = restsOn(x, relationships);
    out.push({ objectId: x, dependsOn: want.has(x) ? [...new Set([...cur, id])] : cur.filter((d) => d !== id) });
  }
  return out;
}
