import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterItems, edgeBudget, lodOf, LOD_FAR_BELOW, LOD_NEAR_FROM } from './canvasLod.ts';

test('three levels of detail by zoom: far = dot, mid = title, near = title + summary', () => {
  assert.equal(lodOf(0.1), 'far');
  assert.equal(lodOf(LOD_FAR_BELOW - 0.01), 'far');
  assert.equal(lodOf(LOD_FAR_BELOW), 'mid');
  assert.equal(lodOf(0.6), 'mid');
  assert.equal(lodOf(LOD_NEAR_FROM), 'near');
  assert.equal(lodOf(2), 'near');
  assert.equal(edgeBudget('far'), 0);
  assert.ok(edgeBudget('near') > edgeBudget('mid'));
});

test('far view of a dense area: items in the same screen cell become one counted cluster, lone items stay themselves', () => {
  const items = [
    { id: 'a', x: 0, y: 0, w: 220, h: 64 }, { id: 'b', x: 10, y: 80, w: 220, h: 64 }, { id: 'c', x: 20, y: 160, w: 220, h: 64 },
    { id: 'far', x: 5000, y: 5000, w: 220, h: 64 },
  ];
  const k = 0.1; // a 36px cell is 360 stage units wide
  const cl = clusterItems(items, k);
  assert.equal(cl.length, 2);
  const big = cl.find((c) => c.count === 3)!;
  assert.deepEqual(big.ids, ['a', 'b', 'c']);
  assert.ok(big.id.startsWith('cluster:'));
  assert.equal(cl.find((c) => c.count === 1)!.id, 'far');
  // zoomed in, the same items no longer share a cell
  assert.equal(clusterItems(items, 1).length, 4);
});

test('8000 items cluster fast and every item is in exactly one cluster', () => {
  const items = Array.from({ length: 8000 }, (_, i) => ({ id: `o${i}`, x: (i % 100) * 250, y: Math.floor(i / 100) * 90, w: 220, h: 64 }));
  const t = Date.now();
  const cl = clusterItems(items, 0.12);
  assert.ok(Date.now() - t < 500);
  assert.equal(cl.reduce((s, c) => s + c.count, 0), 8000);
  assert.ok(cl.length < 8000 / 2, 'clusters really merge');
  assert.equal(new Set(cl.flatMap((c) => c.ids)).size, 8000);
});
