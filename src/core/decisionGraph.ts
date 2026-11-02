/**
 * Decision graph (docs/spine.md → Relation `depends_on`). Pure: active objects + `depends_on` relations (+ the change log).
 * `A depends_on B` = relationship { sourceId: A, targetId: B }: A rests on B.
 *
 *  • planDecisions   — layers of an order (what is ready, what is blocked) and «concurrent decisions» (cycles are not errors)
 *  • dependentsOf    — transitive dependents of an object
 *  • needsReview     — DERIVED, never stored: a dependent whose (transitive) dependency changed after the dependent
 *                      was last written or reviewed («بدون تغییر بپذیر» writes a `review_accepted` Change)
 */

import type { ContextChange, ContextObject, ContextRelationship } from '../types';
import { isBaselineChange, isContentChange } from './changeLog';
import { stronglyConnected } from './graphAlgo';

export interface DepEdge { from: string; to: string }

const isActive = (o: ContextObject) => o.status !== 'Superseded' && o.status !== 'Archived';

/** `depends_on` edges between ACTIVE objects (no duplicates; self-loops count as a one-member cycle) */
export function dependencyEdges(objects: ContextObject[], relationships: ContextRelationship[]): DepEdge[] {
  const active = new Set(objects.filter(isActive).map((o) => o.id));
  const seen = new Set<string>();
  const out: DepEdge[] = [];
  for (const r of relationships) {
    if (r.type !== 'depends_on' || !active.has(r.sourceId) || !active.has(r.targetId)) continue;
    const k = `${r.sourceId}>${r.targetId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ from: r.sourceId, to: r.targetId });
  }
  return out;
}

export type UnitState = 'done' | 'ready' | 'blocked';
export interface DecisionUnit {
  /** one object, or the members of a cycle */
  ids: string[];
  /** a cycle (or self-loop): decide these together */
  concurrent: boolean;
  /** done = all members Confirmed · blocked = something it depends on is not Confirmed yet · ready = its inputs are Confirmed */
  state: UnitState;
  /** objects outside the unit it depends on that are not Confirmed */
  blockedBy: string[];
}
export interface DecisionPlan {
  /** layer 0 depends on nothing (outside itself); layer n depends on layers < n. Only objects with at least one `depends_on` edge appear. */
  layers: DecisionUnit[][];
  /** the concurrent units (also present in `layers`) */
  groups: string[][];
}

export function planDecisions(objects: ContextObject[], relationships: ContextRelationship[]): DecisionPlan {
  const edges = dependencyEdges(objects, relationships);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const deps = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const e of edges) { ids.add(e.from); ids.add(e.to); deps.set(e.from, [...(deps.get(e.from) ?? []), e.to]); }
  const sorted = [...ids].sort();
  const comps = stronglyConnected(sorted, deps);
  const compOf = new Map<string, number>();
  comps.forEach((c, i) => c.forEach((id) => compOf.set(id, i)));
  const selfLoop = new Set(edges.filter((e) => e.from === e.to).map((e) => e.from));

  const outside = comps.map((c, i) => [...new Set(c.flatMap((id) => deps.get(id) ?? []).filter((d) => compOf.get(d) !== i))].sort());
  const level = new Map<number, number>();
  const levelOf = (i: number): number => {
    if (level.has(i)) return level.get(i)!;
    level.set(i, 0); // the condensation is a DAG; this only guards against surprises
    const l = outside[i].length ? 1 + Math.max(...outside[i].map((d) => levelOf(compOf.get(d)!))) : 0;
    level.set(i, l);
    return l;
  };

  const layers: DecisionUnit[][] = [];
  comps.forEach((c, i) => {
    const blockedBy = outside[i].filter((d) => byId.get(d)?.status !== 'Confirmed');
    const done = c.every((id) => byId.get(id)?.status === 'Confirmed');
    const unit: DecisionUnit = { ids: c, concurrent: c.length > 1 || selfLoop.has(c[0]), state: done ? 'done' : blockedBy.length ? 'blocked' : 'ready', blockedBy };
    const l = levelOf(i);
    (layers[l] ??= []).push(unit);
  });
  layers.forEach((l) => l.sort((a, b) => a.ids[0].localeCompare(b.ids[0])));
  return { layers, groups: layers.flat().filter((u) => u.concurrent).map((u) => u.ids) };
}

/** every object that rests (directly or through others) on `id`, nearest first; cycle-safe; never includes `id` */
export function dependentsOf(id: string, relationships: ContextRelationship[], objects?: ContextObject[]): string[] {
  const rev = new Map<string, string[]>();
  const active = objects ? new Set(objects.filter(isActive).map((o) => o.id)) : null;
  for (const r of relationships) {
    if (r.type !== 'depends_on' || (active && (!active.has(r.sourceId) || !active.has(r.targetId)))) continue;
    rev.set(r.targetId, [...(rev.get(r.targetId) ?? []), r.sourceId]);
  }
  const seen = new Set<string>([id]);
  const out: string[] = [];
  let frontier = [id];
  while (frontier.length) {
    const next: string[] = [];
    for (const f of frontier) for (const d of (rev.get(f) ?? []).slice().sort()) if (!seen.has(d)) { seen.add(d); out.push(d); next.push(d); }
    frontier = next;
  }
  return out;
}

export interface ReviewNeed {
  /** objects it depends on (transitively) that changed after it was last written or reviewed */
  changedDependencies: Array<{ id: string; at: string }>;
  /** when the newest of those changes happened */
  since: string;
}

/** DERIVED review state. Superseded/Archived dependencies still count (their replacement is exactly what changed). */
export function needsReview(objects: ContextObject[], relationships: ContextRelationship[], changes: ContextChange[]): Map<string, ReviewNeed> {
  const deps = new Map<string, string[]>();
  for (const r of relationships) if (r.type === 'depends_on') deps.set(r.sourceId, [...(deps.get(r.sourceId) ?? []), r.targetId]);
  const latest = (pred: (c: ContextChange) => boolean) => {
    const m = new Map<string, string>();
    for (const c of changes) if (pred(c) && (m.get(c.objectId) ?? '') < c.at) m.set(c.objectId, c.at);
    return m;
  };
  const contentAt = latest(isContentChange);
  const baselineAt = latest(isBaselineChange);
  const out = new Map<string, ReviewNeed>();
  for (const y of objects) {
    if (y.status !== 'Confirmed' && y.status !== 'Needs Review') continue;
    if (!deps.has(y.id)) continue;
    const base = baselineAt.get(y.id) ?? y.createdAt ?? '';
    const seen = new Set<string>([y.id]);
    const stack = [...(deps.get(y.id) ?? [])];
    const hit: Array<{ id: string; at: string }> = [];
    while (stack.length) {
      const p = stack.pop()!;
      if (seen.has(p)) continue;
      seen.add(p);
      const at = contentAt.get(p);
      if (at && at > base) hit.push({ id: p, at });
      stack.push(...(deps.get(p) ?? []));
    }
    if (hit.length) {
      hit.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      out.set(y.id, { changedDependencies: hit, since: hit[hit.length - 1].at });
    }
  }
  return out;
}

export interface WaitingDecisions {
  /** its inputs are Confirmed: it can be decided now */
  ready: DecisionUnit[];
  /** waiting for something else; `blockedBy` says what */
  blocked: DecisionUnit[];
  /** cycles: decide the members together (also counted in neither list above) */
  concurrent: DecisionUnit[];
}

/** what the «تصمیم‌های منتظر» section shows: every unit that is not done yet, split into ready / blocked / decided-together */
export function waitingDecisions(plan: DecisionPlan): WaitingDecisions {
  const open = plan.layers.flat().filter((u) => u.state !== 'done');
  return {
    ready: open.filter((u) => !u.concurrent && u.state === 'ready'),
    blocked: open.filter((u) => !u.concurrent && u.state === 'blocked'),
    concurrent: open.filter((u) => u.concurrent),
  };
}

export interface FlipFlop { id: string; times: number }

/**
 * Soft warning: a decision that has been REPLACED many times (counted from the Change log: `superseded` records, followed
 * back along the chain of replacements). Never blocks anything.
 */
export function flipFlops(objects: ContextObject[], changes: ContextChange[], min = 3): FlipFlop[] {
  const predecessors = new Map<string, string[]>(); // replacement → what it replaced
  for (const c of changes) {
    const by = (c.after as { supersededById?: unknown } | undefined)?.supersededById;
    if (c.kind !== 'superseded' || typeof by !== 'string') continue;
    predecessors.set(by, [...(predecessors.get(by) ?? []), c.objectId]);
  }
  const depth = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return Math.max(0, ...(predecessors.get(id) ?? []).map((p) => 1 + depth(p, seen)));
  };
  return objects
    .filter(isActive)
    .map((o) => ({ id: o.id, times: depth(o.id, new Set()) }))
    .filter((x) => x.times >= min)
    .sort((a, b) => b.times - a.times || a.id.localeCompare(b.id));
}
