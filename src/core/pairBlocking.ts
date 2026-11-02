/**
 * Pair blocking: instead of comparing every object with every other one (N², 32 million pairs at 8000 objects), only
 * pairs that share at least one title word are compared (an inverted index). A word that appears in more than `cap`
 * objects says nothing about topic and is not used to propose pairs — so the cost is bounded by N × words × cap.
 * Pairs come out sorted by (i, j) so callers keep their old, deterministic order.
 */

export function blockedPairs(tokenSets: Array<Set<string>>, opts: { cap?: number; extra?: Array<[number, number]> } = {}): Array<[number, number]> {
  const cap = opts.cap ?? 120;
  const postings = new Map<string, number[]>();
  tokenSets.forEach((set, i) => { for (const t of set) { const p = postings.get(t); if (p) p.push(i); else postings.set(t, [i]); } });
  const partners: Array<Set<number>> = tokenSets.map(() => new Set());
  for (const p of postings.values()) {
    if (p.length > cap || p.length < 2) continue;
    for (let a = 0; a < p.length; a++) for (let b = a + 1; b < p.length; b++) partners[p[a]].add(p[b]);
  }
  for (const [i, j] of opts.extra ?? []) if (i !== j) partners[Math.min(i, j)].add(Math.max(i, j));
  const out: Array<[number, number]> = [];
  partners.forEach((set, i) => { for (const j of [...set].sort((x, y) => x - y)) out.push([i, j]); });
  return out;
}

/** all pairs inside the groups of items that share a key (e.g. the same slot), each group capped */
export function groupPairs(keys: Array<string | undefined>, maxGroup = 40): Array<[number, number]> {
  const groups = new Map<string, number[]>();
  keys.forEach((k, i) => { if (k) groups.set(k, [...(groups.get(k) ?? []), i]); });
  const out: Array<[number, number]> = [];
  for (const g of groups.values()) { const m = g.slice(0, maxGroup); for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) out.push([m[a], m[b]]); }
  return out;
}
