import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPoint, facingSides, pathHitsAny, roundedPath, routeEdge, routeEdges, segmentHitsRect } from './edgeRouting.ts';
import type { Rect, Route } from './edgeRouting.ts';

const R = (x: number, y: number, w = 220, h = 64): Rect => ({ x, y, w, h });
const segsOf = (r: Route) => r.points.slice(1).map((p, i) => [r.points[i], p] as const);
const orthogonal = (r: Route) => segsOf(r).every(([p, q]) => Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01);
const monotonic = (vals: number[]) => vals.every((v, i) => i === 0 || v >= vals[i - 1] - 0.01) || vals.every((v, i) => i === 0 || v <= vals[i - 1] + 0.01);

test('cards stacked on each other: the facing sides (bottom → top), no hook', () => {
  const a = R(0, 0), b = R(10, 140);
  assert.deepEqual(facingSides(a, b), ['s', 'n']);
  assert.deepEqual(facingSides(b, a), ['n', 's']);
  const r = routeEdge(a, b);
  assert.equal(r.start.y, a.y + a.h);
  assert.equal(r.end.y, b.y);
  assert.ok(monotonic(r.points.map((p) => p.y)), 'the line only goes down — it never loops back out of the card');
  assert.ok(orthogonal(r));
  assert.equal(r.detour, false);
  assert.deepEqual(r.endDir, { x: 0, y: 1 }, 'the arrow enters the second card from above');
});

test('cards side by side: the facing sides (east → west or west → east)', () => {
  const a = R(0, 0), b = R(400, 10);
  assert.deepEqual(facingSides(a, b), ['e', 'w']);
  assert.deepEqual(facingSides(b, a), ['w', 'e']);
  const r = routeEdge(a, b);
  assert.equal(r.start.x, a.x + a.w);
  assert.equal(r.end.x, b.x);
  assert.ok(monotonic(r.points.map((p) => p.x)));
  assert.deepEqual(r.endDir, { x: 1, y: 0 });
  const back = routeEdge(b, a);
  assert.deepEqual(back.endDir, { x: -1, y: 0 }, 'direction follows influencer → influenced');
});

test('diagonal cards leave along the axis with more room', () => {
  assert.deepEqual(facingSides(R(0, 0), R(500, 120)), ['e', 'w']);
  assert.deepEqual(facingSides(R(0, 0), R(40, 400)), ['s', 'n']);
});

test('a card in the way: the line does not pass through it', () => {
  const a = R(0, 100), b = R(600, 100), c = R(300, 90, 120, 90);
  const r = routeEdge(a, b, { obstacles: [a, b, c] });
  assert.equal(pathHitsAny(r.points, [c]), false);
  assert.ok(orthogonal(r));
  assert.equal(r.points[0].x, a.x + a.w);
  assert.equal(r.points.at(-1)!.x, b.x);
});

test('a wall of cards between: the line goes around through a free corridor', () => {
  const a = R(0, 200), b = R(700, 200);
  const wall = [R(300, 0, 100, 140), R(300, 150, 100, 140), R(300, 300, 100, 140)]; // gaps are too small for the line (cards are inflated)
  const r = routeEdge(a, b, { obstacles: wall });
  assert.equal(pathHitsAny(r.points, wall), false, 'never through a card');
  assert.equal(r.detour, true);
  assert.ok(Math.min(...r.points.map((p) => p.y)) < 0 || Math.max(...r.points.map((p) => p.y)) > 440, 'around the wall');
});

test('random layouts: orthogonal, never through another card, endpoints on the facing sides', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let detours = 0;
  for (let n = 0; n < 150; n++) {
    const rects: Rect[] = [];
    for (let i = 0; i < 9; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const c = R(Math.round(rnd() * 1400), Math.round(rnd() * 700), 160 + Math.round(rnd() * 80), 56 + Math.round(rnd() * 40));
        if (!rects.some((o) => segmentHitsRect({ x: c.x - 24, y: c.y + c.h / 2 }, { x: c.x + c.w + 24, y: c.y + c.h / 2 }, o) || (c.x < o.x + o.w + 24 && c.x + c.w + 24 > o.x && c.y < o.y + o.h + 24 && c.y + c.h + 24 > o.y))) { rects.push(c); break; }
      }
    }
    if (rects.length < 3) continue;
    const [a, b] = [rects[0], rects[1]];
    const r = routeEdge(a, b, { obstacles: rects });
    assert.ok(orthogonal(r), 'orthogonal');
    if (!r.detour) assert.equal(pathHitsAny(r.points, rects.filter((x) => x !== a && x !== b)), false, `layout ${n}: through a card`);
    else detours++;
    const [sa] = facingSides(a, b);
    assert.equal(r.sideA, sa);
    assert.ok(r.length >= 1);
  }
  assert.ok(detours < 90, 'most routes are direct');
});

test('detour routes avoid cards too whenever a free corridor exists', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let n = 0; n < 80; n++) {
    const a = R(0, 300, 200, 60), b = R(800, 300, 200, 60);
    const others = Array.from({ length: 4 }, (_, i) => R(260 + i * 130, 200 + Math.round(rnd() * 160), 90, 70 + Math.round(rnd() * 40)));
    const r = routeEdge(a, b, { obstacles: [a, b, ...others] });
    assert.equal(pathHitsAny(r.points, others), false, `layout ${n}`);
  }
});

test('two edges between the same cards do not sit on each other (lanes); many edges on one side get separate slots', () => {
  const a = R(0, 0), b = R(0, 200);
  const l0 = routeEdge(a, b, { lane: -0.5 }), l1 = routeEdge(a, b, { lane: 0.5 });
  const xs = (r: Route) => r.points.map((p) => p.x);
  assert.notDeepEqual(xs(l0), xs(l1));
  const cards = new Map<string, Rect>([['p', R(0, 0)], ['q', R(0, 200)], ['r', R(300, 220)], ['s', R(-300, 220)]]);
  const rs = routeEdges([{ id: 'pq1', from: 'p', to: 'q' }, { id: 'pq2', from: 'p', to: 'q' }, { id: 'pr', from: 'p', to: 'r' }, { id: 'ps', from: 'p', to: 's' }], cards);
  assert.equal(rs.size, 4);
  const pq1 = rs.get('pq1')!, pq2 = rs.get('pq2')!;
  assert.notEqual(pq1.start.x, pq2.start.x, 'separate attachment points on the same side');
  assert.ok(pq1.start.x > cards.get('p')!.x && pq1.start.x < cards.get('p')!.x + 220);
  // edges to the right and left of the same card order by where the other end is, so they do not cross at the card
  const south = [...rs.values()].filter((r) => r.sideA === 's' && r.start.y === 64);
  assert.ok(south.length >= 2);
});

test('slots are clamped inside the side; the rounded path starts and ends exactly at the attachment points', () => {
  const a = R(0, 0, 100, 64);
  const p = attachPoint(a, 's', 9999);
  assert.ok(p.x <= 100 && p.x >= 0);
  const r = routeEdge(R(0, 0), R(500, 300));
  assert.match(r.d, /^M [\d.-]+ [\d.-]+/);
  assert.ok(r.d.includes('Q'), 'rounded corners');
  assert.equal(roundedPath([{ x: 0, y: 0 }]), '');
  assert.deepEqual(r.points[0], r.start);
  assert.deepEqual(r.points.at(-1), r.end);
  assert.ok(r.mid.x >= Math.min(r.start.x, r.end.x) && r.mid.x <= Math.max(r.start.x, r.end.x));
});
