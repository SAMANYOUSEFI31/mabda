/**
 * What a node move changes, said BEFORE it is confirmed: moving a node (with its sub-tree) changes which ancestors it inherits
 * from, so some approved knowledge stops reaching it (and other knowledge starts to). The knowledge, notes, files, relations and
 * history that live IN the moved nodes go with them untouched; this only reports what reaches them from OUTSIDE. Pure.
 * (Global rules reach everywhere either way; a rule «only for this section» is the usual case that is lost.)
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { effectiveFor, inForce } from './effectiveContext';
import { movedNodeTree, subtreeIds } from './nodeTree';

export interface OverrideChange {
  object: ContextObject;
  nodes: string[];
  beforeBy?: ContextObject;
  afterBy?: ContextObject;
}
export interface MoveEffect {
  /** approved knowledge that reached the moved nodes before and will not after */
  lost: Array<{ object: ContextObject; nodes: string[] }>;
  gained: Array<{ object: ContextObject; nodes: string[] }>;
  /** confirmed knowledge whose active override changes for one or more moved nodes */
  overrideChanges: OverrideChange[];
  /** plain sentences for the confirm dialog */
  sentences: string[];
}

const TYPE_WORD = { Constraint: 'خط قرمز', Decision: 'تصمیم', Fact: 'دانش' } as const;

export function moveEffect(nodes: TreeNode[], objects: ContextObject[], relationships: ContextRelationship[], id: string, newParentId: string, now: Date | string | number): MoveEffect {
  const moved = movedNodeTree(nodes, id, newParentId);
  const inside = new Set(subtreeIds(nodes, id));
  const context = objects.filter((o) => !o.sample);
  const lostBy = new Map<string, { object: ContextObject; nodes: string[] }>();
  const gainBy = new Map<string, { object: ContextObject; nodes: string[] }>();
  const overrideBy = new Map<string, OverrideChange>();
  const label = (nid: string) => nodes.find((n) => n.id === nid)?.label ?? nid;
  for (const nid of inside) {
    const beforeItems = effectiveFor(nid, context, nodes, relationships, now);
    const afterItems = effectiveFor(nid, context, moved, relationships, now);
    const before = new Map(inForce(beforeItems).filter((i) => i.object.status === 'Confirmed').map((i) => [i.object.id, i.object]));
    const after = new Map(inForce(afterItems).filter((i) => i.object.status === 'Confirmed').map((i) => [i.object.id, i.object]));
    for (const [oid, o] of before) if (!after.has(oid) && !inside.has(o.nodeId)) { const e = lostBy.get(oid) ?? { object: o, nodes: [] }; e.nodes.push(label(nid)); lostBy.set(oid, e); }
    for (const [oid, o] of after) if (!before.has(oid) && !inside.has(o.nodeId)) { const e = gainBy.get(oid) ?? { object: o, nodes: [] }; e.nodes.push(label(nid)); gainBy.set(oid, e); }

    const beforeById = new Map(beforeItems.filter((i) => i.object.status === 'Confirmed' && i.origin !== 'expired').map((i) => [i.object.id, i]));
    const afterById = new Map(afterItems.filter((i) => i.object.status === 'Confirmed' && i.origin !== 'expired').map((i) => [i.object.id, i]));
    for (const [oid, beforeItem] of beforeById) {
      const afterItem = afterById.get(oid);
      if (!afterItem || beforeItem.overriddenBy === afterItem.overriddenBy || (!beforeItem.overriddenBy && !afterItem.overriddenBy)) continue;
      const key = `${oid}:${beforeItem.overriddenBy ?? ''}>${afterItem.overriddenBy ?? ''}`;
      const current = overrideBy.get(key) ?? { object: beforeItem.object, nodes: [] };
      current.nodes.push(label(nid));
      if (beforeItem.overriddenBy) current.beforeBy = objects.find((o) => o.id === beforeItem.overriddenBy);
      if (afterItem.overriddenBy) current.afterBy = objects.find((o) => o.id === afterItem.overriddenBy);
      overrideBy.set(key, current);
    }
  }
  const lost = [...lostBy.values()], gained = [...gainBy.values()], overrideChanges = [...overrideBy.values()];
  const where = (ns: string[]) => (ns.length <= 2 ? ns.map((x) => `«${x}»`).join(' و ') : `«${ns[0]}» و ${ns.length - 1} بخش دیگر`);
  const sentences = [
    ...lost.map((l) => `${TYPE_WORD[l.object.type]} «${l.object.title}» (از «${label(l.object.nodeId)}») دیگر به ${where(l.nodes)} نمی‌رسد.`),
    ...gained.map((g) => `${TYPE_WORD[g.object.type]} «${g.object.title}» (از «${label(g.object.nodeId)}») حالا به ${where(g.nodes)} هم می‌رسد.`),
    ...overrideChanges.map((change) => {
      const byTitle = (object?: ContextObject) => object ? `«${object.title}»` : 'قاعدهٔ دیگری';
      if (change.beforeBy && !change.afterBy) return `«${change.object.title}» در ${where(change.nodes)} دیگر به‌خاطر ${byTitle(change.beforeBy)} کنار گذاشته نیست.`;
      if (!change.beforeBy && change.afterBy) return `«${change.object.title}» در ${where(change.nodes)} از این پس به‌خاطر ${byTitle(change.afterBy)} کنار گذاشته می‌شود.`;
      return `قاعدهٔ کنارگذار «${change.object.title}» در ${where(change.nodes)} از ${byTitle(change.beforeBy)} به ${byTitle(change.afterBy)} تغییر می‌کند.`;
    }),
  ];
  return { lost, gained, overrideChanges, sentences };
}
