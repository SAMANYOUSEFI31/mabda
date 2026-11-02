import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveFor, effectiveObjects, guardrailsFor, isExpired, overrideProblem, reachOf } from './effectiveContext';
import type { ContextObject, ContextRelationship, TreeNode } from '../types';

const node = (id: string, parentId?: string): TreeNode => ({ id, label: id, description: '', ...(parentId ? { parentId } : {}) });
// 1 · 2 (2.1 · 2.2 (2.2.1)) · 3
const nodes = [node('r'), node('n1', 'r'), node('n2', 'r'), node('n21', 'n2'), node('n22', 'n2'), node('n221', 'n22'), node('n3', 'r')];
const obj = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Constraint', status: 'Confirmed', provenance: 'User Input', title: id, content: id, nodeId, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...p });
const rel = (type: ContextRelationship['type'], s: string, t: string): ContextRelationship => ({ id: `${type}${s}${t}`, sourceId: s, targetId: t, type, createdAt: '' });
const NOW = new Date('2026-06-01T10:00:00Z');
const ids = (node: string, objects: ContextObject[], rels: ContextRelationship[] = []) => effectiveObjects(node, objects, nodes, rels, NOW).map((o) => o.id).sort();

test('a position-reach constraint in node 2.2 affects 2.2 and its sub-tree — not node 1, node 3, the parent 2 or the sibling 2.1', () => {
  const c = obj('c', 'n22', { reach: 'position' });
  for (const n of ['n1', 'n3', 'n2', 'n21', 'r']) assert.deepEqual(ids(n, [c]), [], `${n} is not touched`);
  assert.deepEqual(ids('n22', [c]), ['c']);
  assert.deepEqual(ids('n221', [c]), ['c']);
  assert.deepEqual(effectiveFor('n22', [c], nodes, [], NOW).map((i) => i.origin), ['own']);
  assert.deepEqual(effectiveFor('n221', [c], nodes, [], NOW).map((i) => i.origin), ['inherited']);
});

test('a global constraint applies everywhere (origin «global» away from its own branch); the type defaults keep old data unchanged', () => {
  const g = obj('g', 'n22', { reach: 'global' });
  for (const n of ['r', 'n1', 'n3', 'n21', 'n221']) assert.deepEqual(ids(n, [g]), ['g'], n);
  assert.deepEqual(effectiveFor('n1', [g], nodes, [], NOW).map((i) => i.origin), ['global']);
  // old data: no reach stored → Constraint = global (today's behaviour), Fact / Decision = position
  const legacy = obj('old', 'n22');
  assert.equal(reachOf(legacy), 'global');
  assert.deepEqual(ids('n1', [legacy]), ['old']);
  assert.equal(reachOf(obj('f', 'n22', { type: 'Fact' })), 'position');
  assert.deepEqual(ids('n1', [obj('f', 'n22', { type: 'Fact' })]), []);
});

test('an expired object is in force nowhere (history only); the end date is valid through that whole day', () => {
  const e = obj('e', 'r', { validUntil: '2026-05-31' });
  for (const n of ['r', 'n1', 'n221']) assert.deepEqual(ids(n, [e]), [], n);
  assert.deepEqual(effectiveFor('n1', [e], nodes, [], NOW).map((i) => i.origin), ['expired']);
  assert.equal(isExpired({ validUntil: '2026-06-01' }, NOW), false, 'still valid on the last day');
  assert.equal(isExpired({ validUntil: '2026-06-01' }, new Date('2026-06-02T00:00:01Z')), true);
  assert.equal(isExpired({}, NOW), false);
});

test('Archived and Superseded objects are never listed; Proposed ones are (consumers decide), guardrails need Confirmed', () => {
  const list = [obj('a', 'r', { status: 'Archived' }), obj('s', 'r', { status: 'Superseded' }), obj('p', 'r', { status: 'Proposed' }), obj('ok', 'r')];
  assert.deepEqual(ids('n1', list), ['ok', 'p']);
  assert.deepEqual(guardrailsFor('n1', list, nodes, [], NOW).map((o) => o.id), ['ok']);
});

test('inheritance flows down only: a parent Decision reaches the sub-tree, a child Decision never reaches the parent', () => {
  const list = [obj('pd', 'n2', { type: 'Decision' }), obj('cd', 'n22', { type: 'Decision' })];
  assert.deepEqual(ids('n221', list), ['cd', 'pd']);
  assert.deepEqual(ids('n2', list), ['pd']);
  assert.deepEqual(ids('n21', list), ['pd']);
});

test('overrides: a child-node object switches an ancestor object off for that sub-tree only, with the origin «overridden»', () => {
  const parent = obj('p', 'r', { reach: 'global' });
  const child = obj('x', 'n22', { type: 'Decision' });
  const rels = [rel('overrides', 'x', 'p')];
  assert.deepEqual(ids('n22', [parent, child], rels), ['x']);
  assert.deepEqual(ids('n221', [parent, child], rels), ['x']);
  assert.deepEqual(ids('n21', [parent, child], rels), ['p'], 'a sibling branch keeps the rule');
  assert.deepEqual(ids('n1', [parent, child], rels), ['p']);
  const item = effectiveFor('n221', [parent, child], nodes, rels, NOW).find((i) => i.object.id === 'p')!;
  assert.deepEqual([item.origin, item.overriddenBy], ['overridden', 'x']);
  // an expired / archived overrider no longer overrides
  assert.deepEqual(ids('n22', [parent, { ...child, validUntil: '2026-01-02' }], rels), ['p']);
  assert.deepEqual(ids('n22', [parent, { ...child, status: 'Archived' }], rels), ['p']);
});

test('an overrides edge only counts from a strict descendant node to an ancestor node (the engine ignores any other)', () => {
  const a = obj('a', 'n21', { type: 'Decision' }), b = obj('b', 'n22', { type: 'Decision' }), top = obj('top', 'n2');
  assert.equal(overrideProblem(a, b, nodes) !== undefined, true, 'siblings');
  assert.equal(overrideProblem(top, a, nodes) !== undefined, true, 'parent → child is the wrong way round');
  assert.equal(overrideProblem(obj('same', 'n2'), top, nodes) !== undefined, true, 'same node');
  assert.equal(overrideProblem(a, top, nodes), undefined);
  assert.deepEqual(ids('n21', [a, b, top], [rel('overrides', 'top', 'a')]), ['a', 'top'], 'ignored edge');
});

test('order: own, inherited, global, then the listed-but-not-in-force ones', () => {
  const list = [obj('g', 'n3', { reach: 'global' }), obj('i', 'r', { type: 'Fact' }), obj('o', 'n22', { type: 'Fact' }), obj('e', 'n22', { type: 'Fact', validUntil: '2020-01-01' })];
  assert.deepEqual(effectiveFor('n22', list, nodes, [], NOW).map((i) => [i.object.id, i.origin]), [['o', 'own'], ['i', 'inherited'], ['g', 'global'], ['e', 'expired']]);
});
