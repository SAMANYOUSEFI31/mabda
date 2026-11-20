import test from 'node:test';
import assert from 'node:assert/strict';
import { timed } from './timing.testkit';
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
  const { ms, value: cl } = timed(() => clusterItems(items, 0.12), 500);
  assert.ok(ms < 500, `clustered in ${ms}ms`);
  assert.equal(cl.reduce((s, c) => s + c.count, 0), 8000);
  assert.ok(cl.length < 8000 / 2, 'clusters really merge');
  assert.equal(new Set(cl.flatMap((c) => c.ids)).size, 8000);
});

// ── semantic zoom (docs/ux/decisions.md §۵۰) ──
import { clampView, FAR_MIN_K, FIRST_VIEW_K, MID_MARKS_FROM, MIN_SCREEN_TEXT, midLayout, readablePx, readableScale, ZOOM_MAX, zoomRange } from './canvasLod.ts';

test('text inside the stage never reads under the floor on screen, and is never shrunk under its natural size', () => {
  for (const k of [0.25, 0.45, 0.6, 0.8, 1, 1.25]) {
    assert.ok(readablePx(k) * k >= MIN_SCREEN_TEXT - 1e-9, `k=${k}`);
    assert.ok(readablePx(k) >= 14);
    assert.ok(readableScale(k) >= 1);
  }
  assert.equal(readablePx(1.25), 14);
});

test('mid: marks and title fit the 120px card; the first view keeps the marks and two title lines', () => {
  const first = midLayout(FIRST_VIEW_K, 120, FIRST_VIEW_K >= MID_MARKS_FROM);
  assert.ok(FIRST_VIEW_K >= MID_MARKS_FROM, 'marks (a proposal must not read as a fact) are drawn in the first view');
  assert.ok(first.lines >= 2);
  for (const k of [LOD_FAR_BELOW, 0.5, MID_MARKS_FROM, 0.75, LOD_NEAR_FROM - 0.01]) {
    const m = midLayout(k, 120, k >= MID_MARKS_FROM);
    assert.ok(m.lines >= 1, `k=${k}`);
    // drawn height (marks + lines, in the card's own units) fits inside the card
    assert.ok(((k >= MID_MARKS_FROM ? 30 : 0) + m.lines * 21) * m.s <= 120 - 16 + 1e-9, `k=${k}`);
  }
});

test('zoom range: out to a little under fit-all but never under the far floor; in to the natural size or a little more', () => {
  const desk = zoomRange({ stageW: 650, stageH: 536, contentW: 1366, contentH: 8846, cardW: 220 });
  assert.equal(desk.min, FAR_MIN_K, 'a tall board: the floor is where the far summaries still read, not fit-all');
  assert.equal(desk.max, ZOOM_MAX);
  const phone = zoomRange({ stageW: 322, stageH: 338, contentW: 1366, contentH: 8846, cardW: 220 });
  assert.equal(phone.max, 1, 'on a phone a card past 1× would take most of the stage');
  const small = zoomRange({ stageW: 1200, stageH: 800, contentW: 400, contentH: 300, cardW: 220 });
  assert.equal(small.min, LOD_NEAR_FROM, 'a small board can step back a little, but not shrink into a speck');
  const mid = zoomRange({ stageW: 1000, stageH: 700, contentW: 1600, contentH: 900, cardW: 220 });
  assert.ok(mid.min > FAR_MIN_K && mid.min < mid.fit);
});

test('the board never leaves the stage: smaller stays inside, larger leaves no gap past the margin', () => {
  const o = { stageW: 600, stageH: 400, contentW: 400, contentH: 300, marginX: 24, marginY: 24 };
  assert.deepEqual(clampView({ x: -900, y: 900, k: 0.5 }, o), { x: 24, y: 400 - 24 - 150, k: 0.5 });
  const big = { ...o, contentW: 4000, contentH: 3000 };
  assert.deepEqual(clampView({ x: 200, y: -99999, k: 1 }, big), { x: 24, y: 400 - 24 - 3000, k: 1 });
  // the room kept for the pinned row labels is outside the clamp's stage
  assert.equal(clampView({ x: 9999, y: 0, k: 1 }, { ...big, endInset: 180 }).x, 24);
  assert.equal(clampView({ x: -9999, y: 0, k: 1 }, { ...big, endInset: 180 }).x, 600 - 180 - 24 - 4000);
});
