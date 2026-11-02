import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene, neighbourInDirection, placeable, sceneDrop, sceneNeighbours } from './canvasScene.ts';
import type { SceneInput } from './canvasScene.ts';
import { buildDemo } from './demoData.ts';
import { DEFAULT_TREE_NODES } from './specs.ts';
import { needsReview } from './decisionGraph.ts';
import type { ContextObject, TreeNode } from '../types/index.ts';

const NOW = new Date('2026-03-10T08:00:00Z');
const d = buildDemo(NOW);
const nodes: TreeNode[] = [...DEFAULT_TREE_NODES, ...d.nodes];
const reviewIds = new Set(needsReview(d.objects, d.relationships, d.changes).keys());
const input: SceneInput = { nodes, objects: d.objects, relationships: d.relationships, deliverables: d.deliverables, notes: d.notes, canvas: d.canvas, reviewIds, staleAssetIds: new Set(), now: NOW };

test('relations: every edge is drawn from the influencer to the influenced (dependency B → A, lineage object → asset, replacement new → old)', () => {
  const s = buildScene('relations', input);
  assert.ok(s.items.length > 20 && s.boxes.length > 0 && s.edges.length > 0);
  const byId = new Map(s.items.map((i) => [i.id, i]));
  for (const e of s.edges) { assert.ok(byId.has(e.influencer) && byId.has(e.influenced), e.id); assert.notEqual(e.influencer, e.influenced); }
  const dep = d.relationships.find((r) => r.type === 'depends_on')!; // source depends on target
  const e = s.edges.find((x) => x.kind === 'dependency' && x.influenced === `o:${dep.sourceId}` && x.influencer === `o:${dep.targetId}`);
  assert.ok(e, 'the depended-on decision is the influencer');
  const lin = s.edges.find((x) => x.kind === 'lineage')!;
  assert.ok(lin.influenced.startsWith('a:') && lin.influencer.startsWith('o:'), 'an asset is influenced by the object it was built from');
  const sup = d.relationships.find((r) => r.type === 'supersedes')!;
  const se = buildScene('relations', input, { includeHistory: true }).edges.find((x) => x.kind === 'supersedes' && x.influencer === `o:${sup.sourceId}`);
  assert.ok(se && se.influenced === `o:${sup.targetId}`, 'the new one acts on the old one');
});

test('relations: cards carry badges (review, assumption, expired, global) and a short summary; boxes are the domain unless switched off', () => {
  const s = buildScene('relations', input);
  const objs = s.items.filter((i) => i.kind === 'object');
  assert.ok(objs.some((i) => i.review) && objs.some((i) => i.assumption), 'review and assumption badges exist in the showcase');
  assert.ok(objs.every((i) => i.summary !== undefined && i.summary.length <= 141));
  const flat = buildScene('relations', input, { boxes: false });
  assert.equal(flat.boxes.length, 0);
});

test('board: columns = status by default; the review filter keeps flagged cards only; other columns are display-only (hint says so)', () => {
  const s = buildScene('board', input);
  assert.deepEqual(s.board, { columns: 'status', rows: 'domain' });
  assert.ok(s.boxes.filter((b) => b.kind === 'column').length === 2);
  assert.match(s.boxes.find((b) => b.kind === 'column')!.hint!, /وضعیتش را عوض می‌کند/);
  assert.ok(s.items.every((i) => i.lane === 'thinking' || i.lane === 'confirmed'));
  const f = buildScene('board', input, { onlyReview: true });
  assert.ok(f.items.length > 0 && f.items.length < s.items.length && f.items.every((i) => i.review));
  const layer = buildScene('board', input, { columns: 'layer', rows: 'none' });
  assert.match(layer.boxes.find((b) => b.kind === 'column')!.hint!, /فقط نمایش/);
  assert.equal(layer.boxes.filter((b) => b.kind === 'row').length, 1);
  // every board dependency edge points between two cards that are on the board
  const ids = new Set(s.items.map((i) => i.id));
  assert.ok(s.edges.every((e) => ids.has(e.influencer) && ids.has(e.influenced)));
});

test('free: notes and placed cards sit where they were stored; nothing placed = nothing shown; placeable lists unplaced live objects', () => {
  const s = buildScene('free', input);
  assert.equal(s.summary.notes, d.canvas.free.filter((i) => i.itemRef.startsWith('note:')).length);
  assert.ok(s.items.every((i) => i.kind === 'note' || i.kind === 'object'));
  const placed: SceneInput = { ...input, canvas: { ...input.canvas, free: [...input.canvas.free, { itemRef: `obj:${d.objects[0].id}`, x: 400, y: 300 }] } };
  const s2 = buildScene('free', placed);
  const card = s2.items.find((i) => i.objectId === d.objects[0].id)!;
  assert.deepEqual([card.x, card.y], [400, 300]);
  assert.ok(!placeable(d.objects, placed.canvas.free).some((o: ContextObject) => o.id === d.objects[0].id));
  assert.ok(placeable(d.objects, []).every((o) => o.status !== 'Superseded' && o.status !== 'Archived'));
  assert.equal(buildScene('free', { ...input, canvas: { decisions: [], free: [] } }).items.length, 0);
});

test('the same data in the three layouts gives the same set of objects in «رابطه‌ها» and «تابلو» minus history', () => {
  const rel = new Set(buildScene('relations', input, { showAssets: false }).items.filter((i) => i.kind === 'object').map((i) => i.objectId));
  const board = new Set(buildScene('board', input).items.map((i) => i.objectId));
  for (const id of board) assert.ok(rel.has(id!), `${id} is on the board but not in the relations view`);
});

test('sceneNeighbours: the board card’s column, row and the cards before/after it in the cell (what an undo restores)', () => {
  const s = buildScene('board', input);
  const cell = Object.values(s.cells!).find((l) => l.length >= 3)!;
  assert.ok(cell, 'the showcase has a cell with three cards');
  const n = sceneNeighbours(s, cell[1])!;
  assert.deepEqual([n.beforeId, n.afterId], [cell[0], cell[2]]);
  assert.ok(n.lane === 'thinking' || n.lane === 'confirmed');
  assert.equal(sceneNeighbours(buildScene('relations', input), cell[1]), undefined, 'only the board has cells');
});

test('keyboard navigation: the nearest card in a direction, preferring the one in line', () => {
  const items = [
    { id: 'a', x: 0, y: 0, w: 100, h: 50 }, { id: 'b', x: 200, y: 0, w: 100, h: 50 }, { id: 'c', x: 0, y: 120, w: 100, h: 50 }, { id: 'd', x: 220, y: 300, w: 100, h: 50 },
  ];
  assert.equal(neighbourInDirection(items, 'a', 'right'), 'b');
  assert.equal(neighbourInDirection(items, 'a', 'down'), 'c');
  assert.equal(neighbourInDirection(items, 'b', 'left'), 'a');
  assert.equal(neighbourInDirection(items, 'c', 'up'), 'a');
  assert.equal(neighbourInDirection(items, 'a', 'up'), undefined);
  assert.equal(neighbourInDirection(items, 'zzz', 'up'), undefined);
});

test('sceneDrop: the column from x, the row from y, the slot among the other cards of that cell (the dragged one ignored)', () => {
  const s = buildScene('board', input);
  const key = Object.keys(s.cells!).find((k) => s.cells![k].length >= 3)!;
  const [col, row] = key.split('|');
  const ids = s.cells![key];
  const it = (id: string) => s.items.find((i) => i.objectId === id)!;
  const a = it(ids[0]), b = it(ids[1]);
  const t = sceneDrop(s, a.x + 10, b.y + b.h - 2)!;
  assert.deepEqual([t.col, t.row, t.index, t.beforeId, t.afterId], [col, row, 2, ids[1], ids[2]]);
  const top = sceneDrop(s, a.x + 10, a.y - 2)!;
  assert.deepEqual([top.index, top.beforeId, top.afterId], [0, undefined, ids[0]]);
  const self = sceneDrop(s, a.x + 10, b.y + 5, ids[1])!;
  assert.equal(self.index, 1, 'dragging a card over itself keeps it between its neighbours');
  assert.equal(sceneDrop(s, -900, 0), undefined);
  assert.equal(sceneDrop(buildScene('relations', input), 10, 10), undefined, 'only the board has cells');
});
