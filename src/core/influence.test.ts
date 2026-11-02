import test from 'node:test';
import assert from 'node:assert/strict';
import { influenceOf } from './influence';
import type { ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../types';

const node = (id: string, parentId?: string): TreeNode => ({ id, label: id, description: '', ...(parentId ? { parentId } : {}) });
const nodes = [node('r'), node('a', 'r'), node('b', 'a'), node('c', 'a')];
const obj = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: id, nodeId, version: 1, createdAt: `2026-01-0${id.length}`, updatedAt: '', ...p });
const rel = (type: ContextRelationship['type'], s: string, t: string): ContextRelationship => ({ id: `${type}${s}${t}`, sourceId: s, targetId: t, type, createdAt: '' });
const asset = (id: string, used: string[]): GeneratedDeliverable => ({ id, title: id, usedContext: used.map((u) => ({ id: u, version: 1 })) } as unknown as GeneratedDeliverable);
const NOW = new Date('2026-06-01T00:00:00Z');

const objects = [
  obj('base', 'r', { type: 'Fact' }), obj('rule', 'a', { type: 'Constraint', reach: 'position' }), obj('glob', 'c', { type: 'Constraint', reach: 'global' }),
  obj('x', 'b'), obj('dep', 'b'), obj('child', 'b'), obj('exc', 'b'), obj('old', 'a', { type: 'Constraint', validUntil: '2026-01-01' }),
];
const rels = [rel('depends_on', 'x', 'dep'), rel('depends_on', 'child', 'x'), rel('overrides', 'exc', 'rule')];
const assets = [asset('direct', ['x']), asset('viaChild', ['child']), asset('other', ['base'])];

test('above: dependencies, constraints in force WITH their origin, inherited inputs, exceptions — expired ones are not in force', () => {
  const i = influenceOf('x', objects, nodes, rels, assets, NOW)!;
  assert.deepEqual(i.shapedBy.dependencies.map((o) => o.id), ['dep']);
  assert.deepEqual(i.shapedBy.constraints.map((c) => [c.object.id, c.origin]).sort(), [['glob', 'global']].sort(), '«rule» is set aside for this branch by «exc»; «old» expired');
  assert.deepEqual(i.shapedBy.inputs.map((c) => [c.object.id, c.origin]), [['base', 'inherited']]);
  assert.deepEqual(i.shapedBy.exceptions, [], 'x itself is not part of an exception');
});

test('exceptions are shown from both sides: the one that sets aside and the one set aside', () => {
  const exc = influenceOf('exc', objects, nodes, rels, assets, NOW)!;
  assert.deepEqual(exc.shapedBy.exceptions.map((e) => [e.by.id, e.target.id, e.role]), [['exc', 'rule', 'overrides']]);
  const rule = influenceOf('rule', objects, nodes, rels, assets, NOW)!;
  assert.deepEqual(rule.shapedBy.exceptions.map((e) => e.role), ['overridden']);
  assert.deepEqual(rule.shapes.scope.exceptNodeIds, ['b'], 'it no longer reaches the exception\'s branch');
  assert.deepEqual(rule.shapes.scope.nodeIds.sort(), ['a', 'c']);
});

test('below: everything that rests on it (transitively), the assets built from it or from those, and where it is in force', () => {
  const i = influenceOf('dep', objects, nodes, rels, assets, NOW)!;
  assert.deepEqual(i.shapes.dependents.map((o) => o.id).sort(), ['child', 'x']);
  assert.deepEqual(i.shapes.assets.map((d) => d.id).sort(), ['direct', 'viaChild']);
  assert.deepEqual([i.shapes.scope.kind, i.shapes.scope.nodeIds], ['subtree', ['b']]);
  assert.equal(influenceOf('glob', objects, nodes, rels, assets, NOW)!.shapes.scope.kind, 'global');
  assert.equal(influenceOf('glob', objects, nodes, rels, assets, NOW)!.shapes.scope.nodeIds.length, nodes.length);
  assert.equal(influenceOf('nope', objects, nodes, rels, assets, NOW), undefined);
});

test('an object nothing rests on shapes nothing but its own sub-tree; archived dependents are ignored', () => {
  const i = influenceOf('child', [...objects.filter((o) => o.id !== 'dep'), obj('dep', 'b', { status: 'Archived' })], nodes, rels, assets, NOW)!;
  assert.deepEqual(i.shapes.dependents, []);
  assert.deepEqual(i.shapes.assets.map((d) => d.id), ['viaChild']);
  assert.deepEqual(i.shapedBy.dependencies.map((o) => o.id), ['x'], 'child rests on x');
});
