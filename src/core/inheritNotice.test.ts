import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInheritNotices, governedBelow, inheritSentence } from './inheritNotice';
import { needsReview } from './decisionGraph';
import type { ContextChange, ContextObject, ContextRelationship, TreeNode } from '../types';

const node = (id: string, parentId?: string): TreeNode => ({ id, label: `بخش ${id}`, description: '', ...(parentId ? { parentId } : {}) });
// sub (اشتراک) → gift (بستهٔ هدیه), annual (سالانه); leaf has no sub-sections; other is a sibling branch
const nodes = [node('root'), node('sub', 'root'), node('gift', 'sub'), node('annual', 'sub'), node('leaf', 'root'), node('other', 'root')];
const NOW = new Date('2026-06-10T10:00:00Z');
const obj = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: id, nodeId, version: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...p });
let n = 0;
const edit = (objectId: string, at: string, after: Record<string, unknown> = { content: 'جدید' }, kind: ContextChange['kind'] = 'edited'): ContextChange => ({ id: `c${++n}`, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 2, kind, actor: 'user', at, after });
const fa = (x: number) => String(x);

test('a confirmed change in a section WITH sub-sections: one notice listing the sub-sections where it governs', () => {
  const price = obj('قیمت اشتراک', 'sub');
  const r = buildInheritNotices({ changes: [edit('قیمت اشتراک', '2026-06-09T08:00:00Z')], objects: [price], nodes, relationships: [], now: NOW });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].subNodes.map((s) => s.nodeId).sort(), ['annual', 'gift']);
  assert.equal(r[0].everywhere, false);
  assert.match(inheritSentence(r[0], fa), /در 2 زیربخش هم حاکم است/);
});

test('no sub-sections → no news; a sibling branch is never counted', () => {
  const leaf = obj('x', 'leaf');
  assert.deepEqual(buildInheritNotices({ changes: [edit('x', '2026-06-09T08:00:00Z')], objects: [leaf], nodes, relationships: [], now: NOW }), []);
});

test('a sub-section that set the knowledge aside (overrides) is not counted; the others still are', () => {
  const price = obj('p', 'sub', { title: 'قیمت اشتراک' });
  const mine = obj('mine', 'gift', { title: 'قیمت هدیه' });
  const overrides: ContextRelationship = { id: 'o', sourceId: 'mine', targetId: 'p', type: 'overrides', createdAt: '' };
  const r = buildInheritNotices({ changes: [edit('p', '2026-06-09T08:00:00Z')], objects: [price, mine], nodes, relationships: [overrides], now: NOW });
  assert.deepEqual(r[0].subNodes.map((s) => s.nodeId), ['annual']);
  assert.equal(governedBelow(price, [price, mine], nodes, [overrides], NOW).includes('gift'), false);
  // if it is set aside everywhere below, nothing is left to tell
  const mine2 = obj('mine2', 'annual');
  const both = [overrides, { ...overrides, id: 'o2', sourceId: 'mine2' }];
  assert.deepEqual(buildInheritNotices({ changes: [edit('p', '2026-06-09T08:00:00Z')], objects: [price, mine, mine2], nodes, relationships: both, now: NOW }), []);
});

test('expired, unconfirmed (draft/proposed) and archived knowledge make no notice', () => {
  const ch = (id: string) => edit(id, '2026-06-09T08:00:00Z');
  const objects = [obj('e', 'sub', { validUntil: '2026-06-01' }), obj('pr', 'sub', { status: 'Proposed' }), obj('ar', 'sub', { status: 'Archived' }), obj('nr', 'sub', { status: 'Needs Review' })];
  assert.deepEqual(buildInheritNotices({ changes: objects.map((o) => ch(o.id)), objects, nodes, relationships: [], now: NOW }), []);
});

test('a global red line: the notice says it governs everywhere; a replacement counts for the object that REPLACED', () => {
  const rule = obj('rule', 'sub', { type: 'Constraint' });
  assert.equal(buildInheritNotices({ changes: [edit('rule', '2026-06-09T08:00:00Z')], objects: [rule], nodes, relationships: [], now: NOW })[0].everywhere, true);
  const old = obj('old', 'sub', { status: 'Superseded' });
  const neu = obj('neu', 'sub');
  const sup = edit('old', '2026-06-09T08:00:00Z', { supersededById: 'neu' }, 'superseded');
  const r = buildInheritNotices({ changes: [sup], objects: [old, neu], nodes, relationships: [], now: NOW });
  assert.deepEqual(r[0].objects.map((o) => o.id), ['neu']);
});

test('a scope change (reach / node) counts; a status change or a view does not; old changes fall out of the window', () => {
  const k = obj('k', 'sub', { type: 'Fact' });
  const one = (c: ContextChange) => buildInheritNotices({ changes: [c], objects: [k], nodes, relationships: [], now: NOW }).length;
  assert.equal(one(edit('k', '2026-06-09T08:00:00Z', { reach: 'global' })), 1);
  assert.equal(one(edit('k', '2026-06-09T08:00:00Z', { status: 'Confirmed' })), 0);
  assert.equal(one(edit('k', '2026-05-01T08:00:00Z')), 0, 'older than a week');
});

test('changes of one section close in time are ONE notice; far apart (or another section) are separate', () => {
  const a = obj('a', 'sub'), b = obj('b', 'sub'), c = obj('c', 'sub'), d = obj('d', 'root');
  const r = buildInheritNotices({ changes: [edit('a', '2026-06-09T08:00:00Z'), edit('b', '2026-06-09T09:30:00Z'), edit('c', '2026-06-08T01:00:00Z'), edit('d', '2026-06-09T09:00:00Z')], objects: [a, b, c, d], nodes, relationships: [], now: NOW });
  const sub = r.filter((x) => x.nodeId === 'sub');
  assert.equal(sub.length, 2, 'a + b together, c apart');
  assert.deepEqual(sub.find((x) => x.objects.length === 2)!.objects.map((o) => o.id).sort(), ['a', 'b']);
  assert.equal(r.filter((x) => x.nodeId === 'root').length, 1);
});

test('topic overlap lists the sub-section’s own approved knowledge first; «دیدم» closes the notice', () => {
  const price = obj('p', 'sub', { title: 'قیمت' });
  const giftPrice = obj('gp', 'gift', { title: 'قیمت بستهٔ هدیه' });
  const tone = obj('t', 'annual', { title: 'لحن برند' });
  const input = { changes: [edit('p', '2026-06-09T08:00:00Z')], objects: [price, giftPrice, tone], nodes, relationships: [] as ContextRelationship[], now: NOW };
  const r = buildInheritNotices(input);
  assert.equal(r[0].subNodes[0].nodeId, 'gift');
  assert.deepEqual(r[0].subNodes[0].overlapping.map((x) => x.id), ['gp']);
  assert.deepEqual(r[0].subNodes[1].overlapping, []);
  assert.deepEqual(buildInheritNotices({ ...input, seen: [r[0].key] }), []);
});

test('a notice is only a hint: it changes no data and creates no needsReview', () => {
  const price = obj('p', 'sub'), giftPrice = obj('gp', 'gift');
  const objects = [price, giftPrice];
  const changes = [edit('p', '2026-06-09T08:00:00Z')];
  const snapshot = JSON.stringify({ objects, changes });
  assert.equal(buildInheritNotices({ changes, objects, nodes, relationships: [], now: NOW }).length, 1);
  assert.equal(JSON.stringify({ objects, changes }), snapshot);
  assert.equal(needsReview(objects, [], changes).size, 0);
});
