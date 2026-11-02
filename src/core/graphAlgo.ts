/**
 * Small graph helpers (pure, iterative — a chain of thousands of objects must not overflow the call stack).
 */

/** Tarjan's strongly connected components. `out` maps a vertex to the vertices it points to. Components come out sinks first; members are sorted. */
export function stronglyConnected(ids: string[], out: Map<string, string[]>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const comps: string[][] = [];
  for (const root of ids) {
    if (index.has(root)) continue;
    const work: Array<{ v: string; i: number }> = [{ v: root, i: 0 }];
    index.set(root, counter); low.set(root, counter); counter++;
    stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const next = out.get(frame.v) ?? [];
      if (frame.i < next.length) {
        const w = next[frame.i++];
        if (!index.has(w)) {
          index.set(w, counter); low.set(w, counter); counter++;
          stack.push(w); onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
      } else {
        work.pop();
        if (work.length) { const p = work[work.length - 1].v; low.set(p, Math.min(low.get(p)!, low.get(frame.v)!)); }
        if (low.get(frame.v) === index.get(frame.v)) {
          const comp: string[] = [];
          let w: string;
          do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== frame.v);
          comps.push(comp.sort());
        }
      }
    }
  }
  return comps;
}

/**
 * Longest-path layers of a directed graph that may contain cycles: members of a cycle share a layer, every edge between
 * components points from a lower layer to a higher one. Returns vertex → layer (0-based).
 */
export function layersOf(ids: string[], out: Map<string, string[]>): Map<string, number> {
  const comps = stronglyConnected(ids, out);
  const compOf = new Map<string, number>();
  comps.forEach((c, i) => c.forEach((v) => compOf.set(v, i)));
  const succ: Array<Set<number>> = comps.map(() => new Set());
  const indeg = comps.map(() => 0);
  comps.forEach((c, i) => c.forEach((v) => { for (const w of out.get(v) ?? []) { const j = compOf.get(w); if (j !== undefined && j !== i && !succ[i].has(j)) { succ[i].add(j); indeg[j]++; } } }));
  const level = comps.map(() => 0);
  const queue = comps.map((_, i) => i).filter((i) => indeg[i] === 0);
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    for (const j of succ[i]) { level[j] = Math.max(level[j], level[i] + 1); if (--indeg[j] === 0) queue.push(j); }
  }
  return new Map(ids.map((v) => [v, level[compOf.get(v)!]]));
}
