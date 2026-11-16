/**
 * CORE-06: two pieces of knowledge can contradict only where BOTH govern the same place at the same time. The same rules as
 * «what is in force here» (effectiveContext.ts), made cheap enough to ask for thousands of pairs:
 *
 *  • both are valid knowledge now (validity.ts: live and not expired);
 *  • an item governs its own section and every sub-section; a «همه‌جا» item (a red line, or reach = global) governs everywhere;
 *  • an exception (`overrides`, from an item in a sub-section, valid itself) switches the ancestor's item off in that sub-tree.
 *
 * The overlap of two places is the deeper item's section (or, when one is everywhere, the other's section): they conflict iff the
 * other one is in force there. Two «همه‌جا» items always meet. Two sibling sections never govern the same place.
 */
import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { ancestorIds } from './nodeTree';
import { reachOf } from './effectiveContext';
import { isValidKnowledge } from './validity';

export interface GovernanceInput { objects: ContextObject[]; nodes?: TreeNode[]; relationships?: ContextRelationship[]; now?: Date | string | number }

/** builds `(a, b) => do they govern a common place now?` with every ancestor chain and exception computed once */
export function governanceOf(input: GovernanceInput): (a: ContextObject, b: ContextObject) => boolean {
  const now = input.now ?? Date.now();
  const nodes = input.nodes ?? [];
  const chains = new Map<string, Set<string>>();
  /** the node and its ancestors */
  const chain = (nodeId: string) => { let c = chains.get(nodeId); if (!c) { c = new Set(nodes.length ? ancestorIds(nodes, nodeId) : [nodeId]); chains.set(nodeId, c); } return c; };
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  // target id → the sections where a valid exception switches it off (each a strict descendant of the target's section)
  const offIn = new Map<string, string[]>();
  for (const r of input.relationships ?? []) {
    if (r.type !== 'overrides') continue;
    const by = byId.get(r.sourceId), target = byId.get(r.targetId);
    if (!by || !target || !isValidKnowledge(by, now) || by.nodeId === target.nodeId || !chain(by.nodeId).has(target.nodeId)) continue;
    offIn.set(target.id, [...(offIn.get(target.id) ?? []), by.nodeId]);
  }
  /** is `o` in force at section `nodeId`? */
  const governs = (o: ContextObject, nodeId: string) => {
    const here = chain(nodeId);
    if (!here.has(o.nodeId) && reachOf(o) !== 'global') return false;
    return !(offIn.get(o.id) ?? []).some((n) => here.has(n));
  };
  return (a, b) => {
    if (!isValidKnowledge(a, now) || !isValidKnowledge(b, now)) return false;
    if (!nodes.length) return true; // without the tree nothing is known about places: every valid pair may meet
    const ga = reachOf(a) === 'global', gb = reachOf(b) === 'global';
    if (ga && gb) return true;
    if (ga) return governs(a, b.nodeId);
    if (gb) return governs(b, a.nodeId);
    if (a.nodeId === b.nodeId) return true;
    if (chain(b.nodeId).has(a.nodeId)) return governs(a, b.nodeId); // a is in an ancestor section of b
    if (chain(a.nodeId).has(b.nodeId)) return governs(b, a.nodeId);
    return false; // sibling sections
  };
}
