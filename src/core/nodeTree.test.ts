import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateUnder, canDelete, canMove, canRename, reorderSiblings, subtreeIds, ancestorIds, flatten } from './nodeTree';
import { DEFAULT_TREE_NODES } from './specs';
import type { TreeNode } from '../types';

const nodes: TreeNode[] = [...DEFAULT_TREE_NODES, { id: 'u1', label: 'کمپین', parentId: 'content', description: '', order: 0 }, { id: 'u2', label: 'اینستاگرام', parentId: 'u1', description: '', order: 0 }];

test('subtree and ancestors', () => {
  assert.deepEqual(subtreeIds(nodes, 'content').sort(), ['content', 'u1', 'u2']);
  assert.deepEqual(ancestorIds(nodes, 'u2'), ['u2', 'u1', 'content', 'brand', 'business']);
  assert.equal(flatten(nodes)[0].node.id, 'business');
});

test('system nodes: rename only', () => {
  assert.equal(canRename(nodes, 'brand', 'برند من').ok, true);
  assert.equal(canMove(nodes, 'brand', 'product').ok, false);
  assert.equal(canDelete(nodes, 'brand', [], []).ok, false);
});

test('user nodes: create under any node, move but never into own subtree', () => {
  assert.equal(canCreateUnder(nodes, 'offer', 'تازه').ok, true);
  assert.equal(canCreateUnder(nodes, 'offer', '  ').ok, false);
  assert.equal(canMove(nodes, 'u1', 'offer').ok, true);
  assert.equal(canMove(nodes, 'u1', 'u2').ok, false);
  assert.equal(canMove(nodes, 'u1', 'u1').ok, false);
});

test('delete: only empty, or with transfer to a valid target', () => {
  assert.equal(canDelete(nodes, 'u2', [], []).ok, true);
  const withObj = canDelete(nodes, 'u2', [{ nodeId: 'u2' }], []);
  assert.equal(withObj.ok, false);
  assert.equal('needsTransfer' in withObj && withObj.needsTransfer, true);
  assert.equal(canDelete(nodes, 'u2', [{ nodeId: 'u2' }], [], 'brand').ok, true);
  assert.equal(canDelete(nodes, 'u1', [], [], 'u2').ok, false, 'target inside the deleted subtree');
  assert.equal(canDelete(nodes, 'u1', [], [], 'nope').ok, false);
  assert.equal(canDelete(nodes, 'u1', [], []).ok, false, 'has a child');
});

test('reorderSiblings puts the node at the index', () => {
  const ns: TreeNode[] = [
    { id: 'a', label: 'a', description: '', order: 0, parentId: 'p' }, { id: 'b', label: 'b', description: '', order: 1, parentId: 'p' }, { id: 'c', label: 'c', description: '', order: 2, parentId: 'p' },
  ];
  assert.deepEqual(reorderSiblings(ns, 'p', 'c', 0).map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(reorderSiblings(ns, 'p', 'a', 99).map((x) => x.id), ['b', 'c', 'a']);
});
