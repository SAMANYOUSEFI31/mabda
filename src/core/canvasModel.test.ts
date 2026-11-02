import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanvasModel, dropTarget, laneOf, moveEffect, rankBetween, visibleCards, CARD_H } from './canvasModel';
import type { ContextObject, TreeNode } from '../types';

const node = (id: string, parentId?: string, order = 0): TreeNode => ({ id, label: `گره ${id}`, description: '', ...(parentId ? { parentId } : {}), order });
const obj = (id: string, nodeId: string, status: ContextObject['status'], o: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status, provenance: 'User Input', title: id, content: id, nodeId, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...o });
const nodes = [node('root'), node('a', 'root', 1), node('b', 'root', 2)];
const none = new Set<string>();

test('lane = status; a Confirmed object with a changed dependency sits in «needs review» (derived)', () => {
  assert.equal(laneOf(obj('x', 'a', 'Proposed'), none), 'thinking');
  assert.equal(laneOf(obj('x', 'a', 'Confirmed'), none), 'confirmed');
  assert.equal(laneOf(obj('x', 'a', 'Confirmed'), new Set(['x'])), 'review');
  assert.equal(laneOf(obj('x', 'a', 'Needs Review'), none), 'review');
});

test('rows = nodes in tree order, columns RTL (first lane rightmost), cards ordered by stored rank then age; superseded/archived are not on the board', () => {
  const objects = [obj('c1', 'a', 'Confirmed'), obj('c2', 'a', 'Confirmed', { createdAt: '2026-01-02T00:00:00Z' }), obj('c3', 'a', 'Confirmed'), obj('p1', 'a', 'Proposed'), obj('gone', 'a', 'Superseded'), obj('z', 'b', 'Archived')];
  const m = buildCanvasModel({ nodes, objects, reviewIds: none, ranks: new Map([['c2', 1], ['c1', 5]]) });
  assert.deepEqual(m.rows.map((r) => [r.nodeId, r.depth]), [['root', 0], ['a', 1], ['b', 1]]);
  const cell = m.cells.get('confirmed|a')!;
  assert.deepEqual(cell.map((c) => c.objectId), ['c2', 'c1', 'c3'], 'ranked first (by rank), the unranked one after');
  assert.equal(m.cards.length, 4);
  const thinking = m.lanes.find((l) => l.lane === 'thinking')!, review = m.lanes.find((l) => l.lane === 'review')!;
  assert.ok(thinking.x > review.x, 'RTL');
  assert.ok(m.cards.every((c) => c.x >= 0 && c.x + c.w <= m.width && c.y + c.h <= m.height));
  assert.ok(cell[1].y - cell[0].y >= CARD_H);
});

test('dropTarget: lane from x, node from y, index among the cell’s other cards (the dragged one ignored)', () => {
  const objects = [obj('c1', 'a', 'Confirmed'), obj('c2', 'a', 'Confirmed'), obj('c3', 'a', 'Confirmed')];
  const m = buildCanvasModel({ nodes, objects, reviewIds: none, ranks: new Map([['c1', 1], ['c2', 2], ['c3', 3]]) });
  const [c1, c2] = m.cells.get('confirmed|a')!;
  let t = dropTarget(m, c1.x + 10, c2.y + c2.h - 2)!;
  assert.deepEqual([t.lane, t.nodeId, t.index, t.before?.objectId, t.after?.objectId], ['confirmed', 'a', 2, 'c2', 'c3']);
  t = dropTarget(m, c1.x + 10, c1.y - 2)!;
  assert.deepEqual([t.index, t.before, t.after?.objectId], [0, undefined, 'c1']);
  t = dropTarget(m, c1.x + 10, c2.y + 5, 'c2')!;
  assert.equal(t.index, 1, 'dragging c2 over itself keeps it between c1 and c3');
  assert.equal(dropTarget(m, -500, 0), undefined);
  const empty = m.rows.find((r) => r.nodeId === 'b')!;
  assert.equal(dropTarget(m, m.lanes[0].x + 5, empty.y + 40)!.nodeId, 'b', 'an empty row still accepts a drop');
});

test('rankBetween: start, end, middle, empty', () => {
  assert.equal(rankBetween(), 1);
  assert.equal(rankBetween(undefined, 4), 3);
  assert.equal(rankBetween(4), 5);
  assert.equal(rankBetween(1, 2), 1.5);
});

test('moveEffect: Proposed → confirmed accepts; backward from Confirmed needs an explicit confirmation; derived review → confirmed is «accept unchanged»', () => {
  const p = obj('p', 'a', 'Proposed'), c = obj('c', 'a', 'Confirmed'), n = obj('n', 'a', 'Needs Review');
  assert.deepEqual(moveEffect(p, none, 'confirmed', 'a'), { kind: 'accept', status: 'Confirmed', needsConfirm: false, nodeChanged: false });
  assert.deepEqual(moveEffect(c, none, 'thinking', 'a'), { kind: 'status', status: 'Proposed', needsConfirm: true, nodeChanged: false });
  assert.deepEqual(moveEffect(c, none, 'review', 'a'), { kind: 'status', status: 'Needs Review', needsConfirm: true, nodeChanged: false });
  assert.equal(moveEffect(c, new Set(['c']), 'confirmed', 'a').kind, 'accept_review');
  assert.deepEqual(moveEffect(c, new Set(['c']), 'thinking', 'a').needsConfirm, true, 'a derived-review card is still Confirmed');
  assert.deepEqual(moveEffect(n, none, 'confirmed', 'a'), { kind: 'status', status: 'Confirmed', needsConfirm: false, nodeChanged: false });
  assert.deepEqual(moveEffect(p, none, 'thinking', 'b'), { kind: 'node', needsConfirm: false, nodeChanged: true });
  assert.deepEqual(moveEffect(c, none, 'confirmed', 'a'), { kind: 'rank', needsConfirm: false, nodeChanged: false });
  assert.deepEqual(moveEffect(p, none, 'confirmed', 'b'), { kind: 'accept', status: 'Confirmed', needsConfirm: false, nodeChanged: true });
});

test('8000 objects: the board lays out fast and only the viewport is drawn', () => {
  const ns = [node('root'), ...Array.from({ length: 40 }, (_, i) => node(`n${i}`, 'root', i))];
  const objects = Array.from({ length: 8000 }, (_, i) => obj(`o${i}`, `n${i % 40}`, (['Confirmed', 'Proposed', 'Needs Review'] as const)[i % 3]));
  const t = Date.now();
  const m = buildCanvasModel({ nodes: ns, objects, reviewIds: none, ranks: new Map() });
  assert.ok(Date.now() - t < 1500);
  assert.equal(m.cards.length, 8000);
  assert.ok(visibleCards(m, { x: 0, y: 0, w: 1200, h: 800 }).length < 150);
});
