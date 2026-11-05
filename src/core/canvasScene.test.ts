import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene, neighbourInDirection, placeable } from './canvasScene.ts';
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

test('«بوم حقیقت»: the relations map shows only what is approved; «نشان بده چه در راه است» adds suggestions and reviews, flagged pending (drawn faint) — and the relations between them', () => {
  const o = (id: string, status: ContextObject['status'], extra: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status, provenance: 'User Input', title: `t ${id}`, content: `c ${id}`, nodeId: 'offer', version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra });
  const input = { nodes: DEFAULT_TREE_NODES, objects: [o('a', 'Confirmed'), o('b', 'Proposed'), o('c', 'Needs Review')], relationships: [{ id: 'r', type: 'depends_on' as const, sourceId: 'b', targetId: 'a', createdAt: '' }], deliverables: [], notes: [], canvas: { decisions: [], free: [] }, reviewIds: new Set<string>(), staleAssetIds: new Set<string>(), now: new Date('2026-06-01') };
  const ids = (sc: ReturnType<typeof buildScene>) => sc.items.filter((i) => i.kind === 'object').map((i) => i.objectId).sort();
  const base = buildScene('overview', input, {});
  assert.deepEqual(ids(base), ['a']);
  assert.equal(base.edges.length, 0);
  const all = buildScene('overview', input, { showPending: true });
  assert.deepEqual(ids(all), ['a', 'b', 'c']);
  assert.deepEqual(all.items.filter((i) => i.pending).map((i) => i.objectId).sort(), ['b', 'c']);
  assert.ok(!all.items.find((i) => i.objectId === 'a')!.pending);
  assert.equal(all.edges.length, 1, 'the effect of a suggestion is seen before it is approved');
});

test('thinking tray: open thoughts and suggestions with no place yet sit in a «تازه‌ها» zone after everything placed; placing one moves it out', () => {
  const proposed: ContextObject = { ...d.objects[0], id: 'p1', title: 'پیشنهاد تازه', status: 'Proposed', sample: false };
  const note = { id: 'n1', workspaceId: 'w', nodeId: 'content', content: '[ایده] کارگاه آنلاین هم بگذاریم', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' };
  const plain = { id: 'n2', workspaceId: 'w', nodeId: 'content', content: 'فقط یادداشت ساده', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' };
  const base: SceneInput = { ...input, objects: [...d.objects.filter((o) => o.status === 'Confirmed'), proposed], notes: [note, plain], canvas: { decisions: [], free: [{ itemRef: `obj:${d.objects[0].id}`, x: 100, y: 100 }] } };
  assert.equal(buildScene('free', base).items.filter((i) => i.unplaced).length, 0, 'the tray is opt-in: the plain free layout shows placed things only');
  const s = buildScene('free', base, { tray: true });
  const loose = s.items.filter((i) => i.unplaced);
  assert.deepEqual(loose.map((i) => i.id).sort(), ['note:n1', 'o:p1'], 'the thought note and the suggestion; a plain note (no open thought) is not here');
  assert.ok(loose.every((i) => i.x > 100 + 200), 'after the placed card');
  assert.ok(s.boxes.some((b) => b.id === 'zone:tray'));
  const placed = buildScene('free', { ...base, canvas: { decisions: [], free: [...base.canvas.free, { itemRef: 'obj:p1', x: 300, y: 300 }] } }, { tray: true });
  const p1 = placed.items.find((i) => i.objectId === 'p1')!;
  assert.equal(p1.unplaced, undefined);
  assert.deepEqual([p1.x, p1.y], [300, 300]);
  assert.equal(p1.pending, true, 'a suggestion is drawn as a suggestion wherever it sits');
});

test('a relation with a suggestion at one end is a suggested relation (dashed), in both layouts; it needs no data change when approved', () => {
  const a: ContextObject = { ...d.objects[0], id: 'ra', status: 'Confirmed', sample: false };
  const b: ContextObject = { ...d.objects[1], id: 'rb', status: 'Proposed', sample: false };
  const rel = { id: 'r1', sourceId: 'rb', targetId: 'ra', type: 'depends_on' as const, createdAt: '2026-03-01T00:00:00Z' };
  const free: SceneInput = { ...input, objects: [a, b], relationships: [rel], notes: [], canvas: { decisions: [], free: [{ itemRef: 'obj:ra', x: 0, y: 0 }, { itemRef: 'obj:rb', x: 300, y: 0 }] } };
  assert.equal(buildScene('free', free).edges[0].pending, true);
  const rel2 = buildScene('overview', { ...free, deliverables: [] }, { showPending: true });
  assert.equal(rel2.edges.find((e) => e.kind === 'dependency')?.pending, true);
  assert.equal(buildScene('overview', { ...free, deliverables: [] }, {}).edges.filter((e) => e.kind === 'dependency').length, 0, 'the truth map does not draw it until both ends are approved');
  const approved = buildScene('free', { ...free, objects: [a, { ...b, status: 'Confirmed' }] });
  assert.equal(approved.edges[0].pending, undefined, 'approved: the same relation is simply real');
});
