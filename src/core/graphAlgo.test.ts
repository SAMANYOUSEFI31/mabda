import test from 'node:test';
import assert from 'node:assert/strict';
import { layersOf, stronglyConnected } from './graphAlgo';

const g = (pairs: Array<[string, string]>) => { const m = new Map<string, string[]>(); for (const [a, b] of pairs) m.set(a, [...(m.get(a) ?? []), b]); return m; };

test('stronglyConnected finds cycles, self-loops and singletons', () => {
  const out = g([['a', 'b'], ['b', 'a'], ['b', 'c'], ['d', 'd']]);
  const comps = stronglyConnected(['a', 'b', 'c', 'd', 'e'], out).map((c) => c.join('+')).sort();
  assert.deepEqual(comps, ['a+b', 'c', 'd', 'e']);
});

test('layersOf: longest path, cycle members share a layer, a very long chain does not overflow the stack', () => {
  const l = layersOf(['a', 'b', 'c', 'd'], g([['a', 'b'], ['b', 'c'], ['a', 'c'], ['c', 'b'], ['c', 'd']]));
  assert.deepEqual([l.get('a'), l.get('b'), l.get('c'), l.get('d')], [0, 1, 1, 2]);
  const ids = Array.from({ length: 20000 }, (_, i) => `v${i}`);
  const chain = g(ids.slice(1).map((v, i) => [ids[i], v] as [string, string]));
  assert.equal(layersOf(ids, chain).get('v19999'), 19999);
});
