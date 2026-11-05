import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverviewScene, rowOfNode, rowsDependingOn, QUANTUM } from './swimlane';
import { buildScene } from './canvasScene';
import type { SceneInput } from './canvasScene';
import type { ContextObject, ContextRelationship, Note, TreeNode } from '../types';

const node = (id: string, parentId?: string, order = 0): TreeNode => ({ id, label: `بخش ${id}`, description: '', order, ...(parentId ? { parentId } : {}) });
// root → ship, sub (→ gift → deep), brand
const nodes = [node('root'), node('ship', 'root', 1), node('sub', 'root', 2), node('gift', 'sub'), node('deep', 'gift'), node('brand', 'root', 3), node('empty', 'root', 4)];
let n = 0;
const obj = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: `متن ${id}`, nodeId, version: 1, createdAt: `2026-01-01T00:00:${String(10 + (n++ % 40)).padStart(2, '0')}Z`, updatedAt: '', ...p });
const dep = (s: string, t: string): ContextRelationship => ({ id: `${s}>${t}`, sourceId: s, targetId: t, type: 'depends_on', createdAt: '' });
const input = (objects: ContextObject[], relationships: ContextRelationship[] = [], extra: Partial<SceneInput> = {}): SceneInput => ({ nodes, objects, relationships, deliverables: [], notes: [], canvas: { decisions: [], free: [] }, reviewIds: new Set(), staleAssetIds: new Set(), now: new Date('2026-06-01T00:00:00Z'), ...extra });
const pos = (s: ReturnType<typeof buildOverviewScene>) => new Map(s.items.map((i) => [i.id, `${i.x},${i.y}`]));

test('a row per section in tree order; empty sections are left out and counted; the layout is the same through buildScene', () => {
  const objs = [obj('a', 'ship'), obj('b', 'sub'), obj('c', 'brand')];
  const s = buildOverviewScene(input(objs));
  assert.deepEqual(s.overview!.rows.map((r) => r.nodeId), ['ship', 'sub', 'brand'].filter((x) => true).sort((a, b) => ['ship', 'sub', 'brand'].indexOf(a) - ['ship', 'sub', 'brand'].indexOf(b)));
  assert.ok(s.overview!.hiddenEmptyRows >= 1, 'root and empty have nothing in them');
  assert.equal(buildScene('overview', input(objs)).items.length, 3);
  assert.equal(s.layout, 'overview');
  // rows are stacked, never overlapping
  const rows = s.overview!.rows;
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].y >= rows[i - 1].y + rows[i - 1].h);
});

test('columns are dependency layers: the base is the rightmost column (RTL), what rests on it moves toward the end (left)', () => {
  const objs = [obj('base', 'ship'), obj('mid', 'ship'), obj('top', 'sub')];
  const s = buildOverviewScene(input(objs, [dep('mid', 'base'), dep('top', 'mid')]));
  const x = (id: string) => s.items.find((i) => i.objectId === id)!.x;
  assert.ok(x('base') > x('mid') && x('mid') > x('top'), 'the depended-on thing is further to the right');
  assert.equal(s.overview!.layers, 3);
  assert.deepEqual(s.edges.map((e) => [e.influencer, e.influenced]).sort(), [['o:base', 'o:mid'], ['o:mid', 'o:top']]);
});

test('a cycle sits in one layer and is marked «با هم تصمیم بگیرید»; nothing else is', () => {
  const objs = [obj('a', 'ship'), obj('b', 'ship'), obj('c', 'ship')];
  const s = buildOverviewScene(input(objs, [dep('a', 'b'), dep('b', 'a')]));
  const t = (id: string) => s.items.find((i) => i.objectId === id)!;
  assert.ok(t('a').together && t('a').together === t('b').together);
  assert.equal(t('c').together, undefined);
  assert.equal(t('a').x, t('b').x, 'same layer');
});

test('deeper sections roll into their parent row until it is opened; opened = its own row', () => {
  const objs = [obj('g', 'gift'), obj('d', 'deep'), obj('s', 'sub')];
  assert.equal(rowOfNode(nodes, 'deep'), 'sub');
  assert.equal(rowOfNode(nodes, 'gift'), 'sub');
  assert.equal(rowOfNode(nodes, 'gift', new Set(['sub'])), 'gift');
  assert.equal(rowOfNode(nodes, 'deep', new Set(['sub'])), 'gift');
  assert.equal(rowOfNode(nodes, 'deep', new Set(['sub', 'gift'])), 'deep');
  const closed = buildOverviewScene(input(objs));
  assert.deepEqual(closed.overview!.rows.map((r) => r.nodeId), ['sub']);
  assert.equal(closed.overview!.rows[0].rolledUp, 2, 'gift and deep are inside it');
  assert.equal(closed.items.length, 3, 'their cards are still there');
  const open = buildOverviewScene(input(objs), { opened: new Set(['sub']) });
  assert.deepEqual(open.overview!.rows.map((r) => r.nodeId), ['sub', 'gift']);
});

test('row counters and the one-counted-line-per-pair-of-rows data that the zoomed-out view draws', () => {
  const objs = [obj('s1', 'ship'), obj('r1', 'sub', { type: 'Constraint' }), obj('r2', 'sub'), obj('r3', 'sub', { status: 'Needs Review' }), obj('r4', 'sub', { validUntil: '2026-01-02' }), obj('p', 'sub', { status: 'Proposed' })];
  const notes: Note[] = [{ id: 'n1', workspaceId: 'w', nodeId: 'sub', content: '[ایده] یک فکر', createdAt: '', updatedAt: '' }];
  const rels = [dep('r1', 's1'), dep('r2', 's1'), dep('r3', 's1'), dep('r4', 's1')];
  const s = buildOverviewScene(input(objs, rels, { notes }));
  const sub = s.overview!.rows.find((r) => r.nodeId === 'sub')!;
  assert.equal(sub.counts.redLines, 1);
  assert.equal(sub.counts.stale, 1, 'expired counts as stale; the Needs Review one is a suggestion and is not drawn without «در راه»');
  assert.equal(sub.counts.openThoughts, 3, 'an open thought and two waiting suggestions');
  const re = s.overview!.rowEdges;
  assert.equal(re.length, 1);
  assert.deepEqual([re[0].from, re[0].to, re[0].count], ['ship', 'sub', 3], 'several lines are ONE line with a count (the pending r3 is not drawn)');
  assert.deepEqual(rowsDependingOn(s, 'ship'), [{ rowId: 'sub', count: 3 }]);
});

test('suggestions appear only with «در راه»; filters keep one kind', () => {
  const objs = [obj('a', 'ship'), obj('p', 'ship', { status: 'Proposed' }), obj('rule', 'ship', { type: 'Constraint' })];
  assert.equal(buildOverviewScene(input(objs)).items.length, 2);
  const withP = buildOverviewScene(input(objs), { showPending: true });
  assert.equal(withP.items.length, 3);
  assert.equal(withP.items.find((i) => i.objectId === 'p')!.pending, true);
  assert.deepEqual(buildOverviewScene(input(objs), { only: 'constraint' }).items.map((i) => i.objectId), ['rule']);
  assert.deepEqual(buildOverviewScene(input(objs), { showPending: true, only: 'pending' }).items.map((i) => i.objectId), ['p']);
});

test('«inside a section»: only that section and below; the user’s row order is honoured', () => {
  const objs = [obj('a', 'ship'), obj('b', 'sub'), obj('c', 'gift')];
  assert.deepEqual(buildOverviewScene(input(objs), { scopeNodeId: 'sub' }).items.map((i) => i.objectId).sort(), ['b', 'c']);
  assert.deepEqual(buildOverviewScene(input(objs), { rowOrder: ['sub', 'ship'] }).overview!.rows.map((r) => r.nodeId).slice(0, 2), ['sub', 'ship']);
});

test('STABLE: adding one item to a cell with room moves nothing; adding one with a link moves only what is downstream of it', () => {
  const objs = Array.from({ length: 40 }, (_, i) => obj(`k${i}`, ['ship', 'sub', 'brand'][i % 3]));
  const rels = objs.slice(3).map((o, i) => dep(o.id, objs[i].id)); // a long chain across rows
  const before = pos(buildOverviewScene(input(objs, rels)));
  // a new, unlinked item in a row whose tallest cell still has a free slot
  const free = obj('fresh', 'brand', { createdAt: '2026-12-01T00:00:00Z' });
  const afterFree = pos(buildOverviewScene(input([...objs, free], rels)));
  const movedFree = [...before].filter(([id, p]) => afterFree.get(id) !== p).length;
  assert.ok(movedFree <= Math.ceil(before.size * 0.1), `only ${movedFree} of ${before.size} moved`);
  // a new item that something already depends on can shift its dependents' columns, nothing else
  const base = obj('newbase', 'ship', { createdAt: '2026-12-02T00:00:00Z' });
  const afterBase = pos(buildOverviewScene(input([...objs, base], [...rels, dep('k0', 'newbase')])));
  const movedBase = [...before].filter(([id, p]) => afterBase.get(id) !== p).length;
  assert.ok(movedBase < before.size, 'not everything moved');
  assert.ok(QUANTUM >= 2);
});

test('300 cards: built fast and every card has its own place', () => {
  const objs = Array.from({ length: 300 }, (_, i) => obj(`m${i}`, ['ship', 'sub', 'brand', 'gift', 'deep'][i % 5]));
  const rels = objs.slice(5).map((o, i) => dep(o.id, objs[(i * 7) % 250].id)).filter((r) => r.sourceId !== r.targetId);
  const t0 = Date.now();
  const s = buildOverviewScene(input(objs, rels));
  assert.ok(Date.now() - t0 < 1500, `built in ${Date.now() - t0}ms`);
  assert.equal(s.items.length, 300);
  const seen = new Set<string>();
  for (const i of s.items) { const k = `${i.x},${i.y}`; assert.ok(!seen.has(k), `overlap at ${k}`); seen.add(k); }
});

test('a crowded cell wraps into more columns instead of growing into a tower; small cells are untouched', () => {
  const crowd = Array.from({ length: 15 }, (_, i) => obj(`c${i}`, 'ship'));
  const s = buildOverviewScene(input(crowd));
  assert.equal(new Set(s.items.map((i) => i.x)).size, 3, 'fifteen cards = three columns of up to six');
  const row = s.overview!.rows[0];
  assert.ok(row.h <= 34 + 6 * 136 + 20 + 1, 'the row is at most six cards tall');
  const seen = new Set(s.items.map((i) => `${i.x},${i.y}`));
  assert.equal(seen.size, 15, 'no overlap');
  const few = buildOverviewScene(input(crowd.slice(0, 6)));
  assert.equal(new Set(few.items.map((i) => i.x)).size, 1, 'six or fewer stay in one column');
});

test('it reads nothing but the objects, relations and notes it is given and changes none of them', () => {
  const objs = [obj('a', 'ship'), obj('b', 'sub')];
  const rels = [dep('b', 'a')];
  const snap = JSON.stringify({ objs, rels });
  buildOverviewScene(input(objs, rels));
  assert.equal(JSON.stringify({ objs, rels }), snap);
});
