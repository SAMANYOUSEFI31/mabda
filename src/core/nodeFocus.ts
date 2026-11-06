/**
 * «واردِ یک بخش شدن»: the numbers and the path of a focused section — like opening a folder, but with Mabda's inheritance.
 * The path (breadcrumb, abbreviated on a phone), a summary of each sub-section (knowledge · open thoughts · stale), and what reaches
 * the section FROM ABOVE (inherited and «همه‌جا», with where it came from). Pure; nothing here changes data.
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { effectiveFor } from './effectiveContext';
import type { EffectiveItem } from './effectiveContext';
import { childrenOf, subtreeIds } from './nodeTree';
import { isActiveContext } from './contextStatus';

export interface Crumb { id: string; label: string }

/** the root-first path to a node (including it); empty when the node does not exist */
export function pathTo(nodes: TreeNode[], id: string): Crumb[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Crumb[] = [];
  const seen = new Set<string>();
  for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) { seen.add(cur.id); out.unshift({ id: cur.id, label: cur.label }); }
  return out;
}

/** a long path is shortened for a narrow screen: first · … · the last two (the hidden ones stay reachable through `hidden`) */
export function abbreviate(path: Crumb[], keepTail = 2): { shown: Crumb[]; hidden: Crumb[] } {
  if (path.length <= keepTail + 1) return { shown: path, hidden: [] };
  return { shown: [path[0], ...path.slice(-keepTail)], hidden: path.slice(1, path.length - keepTail) };
}

export interface ChildSummary { node: TreeNode; knowledge: number; openThoughts: number; stale: number; subSections: number }

/** one calm summary per direct sub-section: counts over its whole sub-tree (nothing hidden inside a deeper level) */
export function childSummaries(nodes: TreeNode[], objects: Pick<ContextObject, 'nodeId' | 'status'>[], openCounts: Map<string, number>, staleIds: Set<string>, parentId: string): ChildSummary[] {
  return childrenOf(nodes, parentId).map((node) => {
    const inside = new Set(subtreeIds(nodes, node.id));
    const mine = objects.filter((o) => inside.has(o.nodeId) && isActiveContext(o));
    let thoughts = 0;
    for (const id of inside) thoughts += openCounts.get(id) ?? 0;
    return {
      node,
      knowledge: mine.filter((o) => o.status === 'Confirmed').length,
      openThoughts: thoughts,
      stale: mine.filter((o) => staleIds.has((o as ContextObject).id)).length,
      subSections: inside.size - 1,
    };
  });
}

export interface FromAbove { item: EffectiveItem; fromLabel: string }

/** what reaches a section from outside it (inherited from a parent, or «همه‌جا»): the strongest first, with the section it comes from */
export function fromAbove(nodes: TreeNode[], objects: ContextObject[], relationships: ContextRelationship[], nodeId: string, now: Date | string | number): FromAbove[] {
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? '';
  const weight = (o: ContextObject) => (o.type === 'Constraint' ? 0 : o.type === 'Decision' ? 1 : 2);
  return effectiveFor(nodeId, objects.filter((o) => o.status === 'Confirmed' && !o.sample), nodes, relationships, now)
    .filter((i) => i.origin === 'inherited' || i.origin === 'global')
    .map((item) => ({ item, fromLabel: label(item.fromNodeId) }))
    .sort((a, b) => weight(a.item.object) - weight(b.item.object) || a.item.object.title.localeCompare(b.item.object.title));
}
