/**
 * «لازم نیست»: if A depends on B, B depends on C, and A also depends on C directly, the direct link adds nothing — A reaches C
 * through B. This finds those redundant direct links (never changes anything). The same walk gives the INDIRECT reach shown
 * in the details («از راه ... هم اثر می‌پذیرد»), so the user is never asked about it. Only `depends_on` between active objects
 * counts; a cycle is left alone (it is its own warning). Pure.
 */

import type { ContextObject, ContextRelationship } from '../types';
import { dependencyEdges } from './decisionGraph';

export interface RedundantLink { from: string; to: string; via: string[] }

function adjacency(objects: ContextObject[], relationships: ContextRelationship[]) {
  const out = new Map<string, string[]>();
  for (const e of dependencyEdges(objects, relationships)) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  return out;
}

/** a path from `a` to `c` that does NOT use the direct edge a→c: its nodes between (null when none) */
function pathAvoidingDirect(out: Map<string, string[]>, a: string, c: string): string[] | null {
  const prev = new Map<string, string>();
  const queue: string[] = [];
  for (const n of out.get(a) ?? []) if (n !== c && !prev.has(n)) { prev.set(n, a); queue.push(n); }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of out.get(cur) ?? []) {
      if (n === a || prev.has(n)) continue;
      prev.set(n, cur);
      if (n === c) {
        const via: string[] = [];
        for (let x = prev.get(c)!; x !== a; x = prev.get(x)!) via.unshift(x);
        return via;
      }
      queue.push(n);
    }
  }
  return null;
}

export function redundantLinks(objects: ContextObject[], relationships: ContextRelationship[]): RedundantLink[] {
  const out = adjacency(objects, relationships);
  const res: RedundantLink[] = [];
  for (const [from, tos] of out) for (const to of tos) {
    const via = pathAvoidingDirect(out, from, to);
    if (via && via.length) res.push({ from, to, via });
  }
  return res;
}

/** everything `id` depends on, and everything that depends on it, through any number of steps (not including the direct ones) */
export function indirectReach(id: string, objects: ContextObject[], relationships: ContextRelationship[]): { upstream: string[]; downstream: string[] } {
  const out = adjacency(objects, relationships);
  const inn = new Map<string, string[]>();
  for (const [f, ts] of out) for (const t of ts) inn.set(t, [...(inn.get(t) ?? []), f]);
  const walk = (g: Map<string, string[]>) => {
    const seen = new Set<string>();
    const direct = new Set(g.get(id) ?? []);
    const stack = [...direct];
    while (stack.length) { const c = stack.pop()!; if (seen.has(c)) continue; seen.add(c); for (const n of g.get(c) ?? []) stack.push(n); }
    seen.delete(id);
    return [...seen].filter((x) => !direct.has(x));
  };
  return { upstream: walk(out), downstream: walk(inn) };
}
