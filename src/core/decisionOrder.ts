/**
 * «ترتیب پیشنهادی تصمیم‌ها»: when a decision (or red line) of a section AND one of its sub-sections both wait, the upper one is
 * shown first, with one line of reason — the sub-sections inherit from it, so it is the one to settle first.
 *
 * Display order only — never a lock, never a block. Two rules keep it from ever contradicting the engine:
 *  • it only breaks TIES: the existing deterministic order (decisionGraph layers, «با هم تصمیم بگیرید») comes first; two items
 *    are compared only when they sit in the same layer;
 *  • `depends_on` wins: if the upper item rests on the lower one, the lower one is in an earlier layer, so nothing is moved and
 *    no reason is shown. Pure.
 */

import type { ContextObject, TreeNode } from '../types';
import type { DecisionPlan, WaitingDecisions } from './decisionGraph';
import { ancestorIds } from './nodeTree';

export const STRUCTURE_REASON = 'زیربخش‌ها از این ارث می‌برند؛ اول این را روشن کن.';

const BINDING = (o: ContextObject) => o.type === 'Decision' || o.type === 'Constraint';

/** which layer of the plan an object sits in (objects with no `depends_on` edge are layer 0) */
export function layerIndex(plan: DecisionPlan): Map<string, number> {
  const m = new Map<string, number>();
  plan.layers.forEach((layer, i) => layer.forEach((u) => u.ids.forEach((id) => m.set(id, i))));
  return m;
}

export interface Ordered<T> {
  items: T[];
  /** upper item id → ids of the waiting items in its sub-sections (the reason line is shown only for these) */
  below: Map<string, string[]>;
}

/**
 * Stable order that puts a section's item before the items of its sub-sections (same layer only). `objectOf` returns null for
 * things that are not single objects (a decided-together unit): they keep their place.
 */
export function orderByStructure<T>(items: T[], opts: { idOf: (t: T) => string; objectOf: (t: T) => ContextObject | null; nodes: TreeNode[]; layers?: Map<string, number> }): Ordered<T> {
  const objs = items.map((t) => opts.objectOf(t));
  const layer = (i: number) => opts.layers?.get(opts.idOf(items[i])) ?? 0;
  const anc = new Map<string, Set<string>>();
  const ancOf = (nodeId: string) => anc.get(nodeId) ?? anc.set(nodeId, new Set(ancestorIds(opts.nodes, nodeId).slice(1))).get(nodeId)!;

  const after: number[][] = items.map(() => []); // i → items that must come after i
  const indeg = items.map(() => 0);
  const below = new Map<string, string[]>();
  for (let i = 0; i < items.length; i++) {
    const a = objs[i];
    if (!a || !BINDING(a)) continue;
    for (let j = 0; j < items.length; j++) {
      const b = objs[j];
      if (i === j || !b || !BINDING(b) || layer(i) !== layer(j) || a.nodeId === b.nodeId) continue;
      if (!ancOf(b.nodeId).has(a.nodeId)) continue; // a's section is above b's
      after[i].push(j);
      indeg[j]++;
      below.set(opts.idOf(items[i]), [...(below.get(opts.idOf(items[i])) ?? []), opts.idOf(items[j])]);
    }
  }
  // an upper item takes the place of the FIRST item below it (it “jumps in front”); everything else stays where it was
  const pos = items.map((_, i) => i);
  for (let changed = true; changed;) { changed = false; for (let i = 0; i < items.length; i++) for (const j of after[i]) if (pos[j] < pos[i]) { pos[i] = pos[j]; changed = true; } }
  // stable topological order by that effective position
  const out: T[] = [];
  const done = items.map(() => false);
  for (let n = 0; n < items.length; n++) {
    let i = -1;
    for (let k = 0; k < items.length; k++) if (!done[k] && indeg[k] === 0 && (i < 0 || pos[k] < pos[i] || (pos[k] === pos[i] && k < i))) i = k;
    done[i] = true;
    out.push(items[i]);
    for (const j of after[i]) indeg[j]--;
  }
  return { items: out, below };
}

export interface OrderedWaiting { waiting: WaitingDecisions; below: Map<string, string[]> }

/** the home / weekly-review lists: ready and blocked units, ordered inside their layers; decided-together groups stay as they are */
export function orderWaitingByStructure(w: WaitingDecisions, plan: DecisionPlan, objects: ContextObject[], nodes: TreeNode[]): OrderedWaiting {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const layers = layerIndex(plan);
  const opts = { idOf: (u: WaitingDecisions['ready'][number]) => u.ids[0], objectOf: (u: WaitingDecisions['ready'][number]) => (u.concurrent ? null : byId.get(u.ids[0]) ?? null), nodes, layers };
  const ready = orderByStructure(w.ready, opts);
  const blocked = orderByStructure(w.blocked, opts);
  return { waiting: { ready: ready.items, blocked: blocked.items, concurrent: w.concurrent }, below: new Map([...ready.below, ...blocked.below]) };
}
