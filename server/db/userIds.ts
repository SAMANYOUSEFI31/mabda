/**
 * DB-PG-01: the showcase workspace and the first-run sample are built from fixed ids (`ws_demo`, `dm_price`, `ws_studio` …),
 * but ids are global primary keys. Two people building the same sample would fight over one row. So for everyone except the
 * local user (whose existing databases already hold the plain ids) every id of the sample gets the person's own suffix, and
 * every reference to it — `nodeId`, `usedContext`, `obj:<id>` on the boards, ids inside JSON — follows, so the copy is whole.
 * Tree node ids are not touched: a node is keyed by (workspace, id) already, and the system nodes have fixed names.
 */
import crypto from 'node:crypto';
import { LOCAL_USER } from '../auth/http.ts';

/** '' for the local user; otherwise a short, stable suffix of this person (the same person always gets the same ids) */
export const idSuffixFor = (userId: string): string => (userId === LOCAL_USER ? '' : `_${crypto.createHash('sha256').update(userId).digest('hex').slice(0, 10)}`);

/** every `id` of the given collections (one level: the entities themselves, not what they contain) */
export function idsOf(...collections: Array<ReadonlyArray<{ id?: unknown }> | { id?: unknown } | undefined>): Set<string> {
  const out = new Set<string>();
  for (const c of collections) for (const x of Array.isArray(c) ? c : c ? [c] : []) if (typeof x?.id === 'string') out.add(x.id);
  return out;
}

/**
 * A deep copy of `value` where every string that IS one of `ids`, or is `<kind>:<id>` (a board's item ref), gets `suffix`.
 * Object keys that are ids are renamed the same way. Free text is never rewritten.
 */
export function remapIds<T>(value: T, ids: ReadonlySet<string>, suffix: string): T {
  if (!suffix || !ids.size) return value;
  const map = (s: string): string => {
    if (ids.has(s)) return s + suffix;
    const i = s.indexOf(':');
    if (i > 0 && i < 12 && /^[a-z]+$/.test(s.slice(0, i)) && ids.has(s.slice(i + 1))) return `${s.slice(0, i + 1)}${s.slice(i + 1)}${suffix}`;
    return s;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return map(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !(v instanceof Date)) return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [map(k), walk(x)]));
    return v;
  };
  return walk(value) as T;
}
