import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateUnder, canDelete, canMove, canRename, reorderSiblings, subtreeIds, ancestorIds, flatten, defaultNodeId, resolveNodeId, treeOrder, defaultTransferTarget } from './nodeTree';
import { DEFAULT_TREE_NODES } from './specs';
import type { TreeNode } from '../types';

const nodes: TreeNode[] = [...DEFAULT_TREE_NODES, { id: 'u1', label: 'کمپین', parentId: 'content', description: '', order: 0 }, { id: 'u2', label: 'اینستاگرام', parentId: 'u1', description: '', order: 0 }];

test('subtree and ancestors', () => {
  assert.deepEqual(subtreeIds(nodes, 'content').sort(), ['content', 'u1', 'u2']);
  assert.deepEqual(ancestorIds(nodes, 'u2'), ['u2', 'u1', 'content', 'brand', 'business']);
  assert.equal(flatten(nodes)[0].node.id, 'business');
});

test('no node is locked: the nodes of the default start rename and move like any other; a node with a child needs a place for it; the last root stays', () => {
  assert.equal(canRename(nodes, 'brand', 'برند من').ok, true);
  assert.equal(canMove(nodes, 'brand', 'product').ok, true);
  const d = canDelete(nodes, 'brand', [], []);
  assert.ok(!d.ok && 'needsTransfer' in d, 'its child must go somewhere');
  assert.equal(canDelete(nodes, 'brand', [], [], 'product').ok, true);
  const last = canDelete(nodes, 'business', [], [], 'brand');
  assert.ok(!last.ok && /آخرین گرهٔ اصلی/.test(last.reason), 'the only root is not deleted');
  const two = [...nodes, { id: 'r2', label: 'دوم', description: '', order: 9 }];
  assert.equal(canDelete(two, 'r2', [], []).ok, true, 'with another root, a root can go');
});

test('defaultNodeId / resolveNodeId / treeOrder / defaultTransferTarget: everything is computed from the tree, no id is known', () => {
  assert.equal(defaultNodeId(nodes), 'business');
  const renamed = nodes.map((n) => (n.id === 'business' ? { ...n, id: 'x1', label: 'خدمات' } : n.parentId === 'business' ? { ...n, parentId: 'x1' } : n));
  assert.equal(defaultNodeId(renamed), 'x1', 'the first root of the tree, whatever it is called');
  assert.equal(defaultNodeId([]), '');
  assert.equal(resolveNodeId(renamed, 'business'), 'x1', 'a hint that is gone falls back to the default place');
  assert.equal(resolveNodeId(renamed, 'offer'), 'offer');
  assert.equal(resolveNodeId(renamed, undefined), 'x1');
  assert.deepEqual(treeOrder(nodes).slice(0, 2), ['business', 'brand']);
  assert.equal(defaultTransferTarget(nodes, 'offer'), 'product');
  assert.equal(defaultTransferTarget(nodes, 'business'), undefined, 'the only root has nowhere to send its content');
  assert.equal(defaultTransferTarget([...nodes, { id: 'r2', label: 'دوم', description: '', order: 9 }], 'business'), 'r2', 'a root sends its content to another root');
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
