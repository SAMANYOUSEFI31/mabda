/**
 * What a node move changes, said BEFORE it is confirmed: moving a node (with its sub-tree) changes which ancestors it inherits
 * from, so some approved knowledge stops reaching it (and other knowledge starts to). The knowledge, notes, files, relations and
 * history that live IN the moved nodes go with them untouched; this only reports what reaches them from OUTSIDE. Pure.
 * (Global rules reach everywhere either way; a rule «only for this section» is the usual case that is lost.)
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { effectiveFor, inForce } from './effectiveContext';
import { subtreeIds } from './nodeTree';

export interface MoveEffect {
  /** approved knowledge that reached the moved nodes before and will not after */
  lost: Array<{ object: ContextObject; nodes: string[] }>;
  gained: Array<{ object: ContextObject; nodes: string[] }>;
  /** plain sentences for the confirm dialog */
  sentences: string[];
}

const TYPE_WORD = { Constraint: 'خط قرمز', Decision: 'تصمیم', Fact: 'دانش' } as const;

export function moveEffect(nodes: TreeNode[], objects: ContextObject[], relationships: ContextRelationship[], id: string, newParentId: string, now: Date | string | number): MoveEffect {
  const moved = nodes.map((n) => (n.id === id ? (newParentId ? { ...n, parentId: newParentId } : { ...n, parentId: undefined }) : n));
  const inside = new Set(subtreeIds(nodes, id));
  const truth = objects.filter((o) => o.status === 'Confirmed' && !o.sample);
  const lostBy = new Map<string, { object: ContextObject; nodes: string[] }>();
  const gainBy = new Map<string, { object: ContextObject; nodes: string[] }>();
  const label = (nid: string) => nodes.find((n) => n.id === nid)?.label ?? nid;
  for (const nid of inside) {
    const before = new Map(inForce(effectiveFor(nid, truth, nodes, relationships, now)).map((i) => [i.object.id, i.object]));
    const after = new Map(inForce(effectiveFor(nid, truth, moved, relationships, now)).map((i) => [i.object.id, i.object]));
    for (const [oid, o] of before) if (!after.has(oid) && !inside.has(o.nodeId)) { const e = lostBy.get(oid) ?? { object: o, nodes: [] }; e.nodes.push(label(nid)); lostBy.set(oid, e); }
    for (const [oid, o] of after) if (!before.has(oid) && !inside.has(o.nodeId)) { const e = gainBy.get(oid) ?? { object: o, nodes: [] }; e.nodes.push(label(nid)); gainBy.set(oid, e); }
  }
  const lost = [...lostBy.values()], gained = [...gainBy.values()];
  const where = (ns: string[]) => (ns.length <= 2 ? ns.map((x) => `«${x}»`).join(' و ') : `«${ns[0]}» و ${ns.length - 1} بخش دیگر`);
  const sentences = [
    ...lost.map((l) => `${TYPE_WORD[l.object.type]} «${l.object.title}» (از «${label(l.object.nodeId)}») دیگر به ${where(l.nodes)} نمی‌رسد.`),
    ...gained.map((g) => `${TYPE_WORD[g.object.type]} «${g.object.title}» (از «${label(g.object.nodeId)}») حالا به ${where(g.nodes)} هم می‌رسد.`),
  ];
  return { lost, gained, sentences };
}
