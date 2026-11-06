import test from 'node:test';
import assert from 'node:assert/strict';
import { moveEffect } from './nodeMove';
import { canMove, movedNodeTree, quickMoves, reorderSiblings } from './nodeTree';
import type { ContextObject, TreeNode } from '../types';

const n = (id: string, label: string, parentId?: string, order = 0): TreeNode => ({ id, label, description: '', order, ...(parentId ? { parentId } : {}) });
const nodes = [n('r', 'ریشه'), n('a', 'الف', 'r', 0), n('b', 'ب', 'r', 1), n('w', 'کارگاه', 'a', 0), n('w1', 'جلسه‌ها', 'w', 0)];
const o = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'x', type: 'Constraint', status: 'Confirmed', provenance: 'User Input', title: `خط قرمز ${id}`, content: 'c', nodeId, version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01', reach: 'position', ...p });
const NOW = new Date('2026-06-01');

test('canMove: to the top level (\'\'), under any node that is not itself or inside itself', () => {
  assert.equal(canMove(nodes, 'w', '').ok, true, 'a node can become a main section');
  assert.equal(canMove(nodes, 'w', 'b').ok, true);
  assert.equal(canMove(nodes, 'a', 'w1').ok, false, 'not into its own sub-tree');
  assert.equal(canMove(nodes, 'a', 'a').ok, false);
  assert.equal(canMove(nodes, 'zz', '').ok, false);
  assert.equal(canMove(nodes, 'w', 'ghost').ok, false);
});

test('quickMoves: up / down among siblings, indent under the previous sibling, outdent to the parent\'s level — each only when possible', () => {
  assert.deepEqual(quickMoves(nodes, 'a'), { down: 1, outdent: { parentId: '' } });
  assert.deepEqual(quickMoves(nodes, 'b'), { up: 0, outdent: { parentId: '' }, indent: { parentId: 'a' } });
  assert.deepEqual(quickMoves(nodes, 'w'), { outdent: { parentId: 'r' } });
  assert.deepEqual(quickMoves(nodes, 'r'), {}, 'a lone root: nothing to do');
  assert.deepEqual(reorderSiblings(nodes, 'r', 'b', 0).map((x) => x.id), ['b', 'a']);
});

test('the preview and committed move use one subtree-preserving tree transformation', () => {
  const moved = movedNodeTree(nodes, 'w', 'b');
  assert.equal(moved.find((x) => x.id === 'w')?.parentId, 'b');
  assert.equal(moved.find((x) => x.id === 'w1')?.parentId, 'w');
  assert.equal(moved.find((x) => x.id === 'w1')?.order, nodes.find((x) => x.id === 'w1')?.order);
});

test('moveEffect: knowledge in the moved nodes goes with them; what reaches them from OUTSIDE is reported in plain words', () => {
  const objects = [o('own', 'w'), o('fromA', 'a'), o('fromR', 'r'), o('global', 'r', { reach: 'global' }), o('other', 'b')];
  // «کارگاه» (under الف) moves to the top level: it no longer inherits «الف» and «ریشه»; a global rule still reaches it
  const e = moveEffect(nodes, objects, [], 'w', '', NOW);
  assert.deepEqual(e.lost.map((l) => l.object.id).sort(), ['fromA', 'fromR']);
  assert.deepEqual(e.gained, []);
  assert.ok(!e.lost.some((l) => l.object.id === 'own' || l.object.id === 'global'));
  assert.match(e.sentences.join(' '), /خط قرمز «خط قرمز fromA» \(از «الف»\) دیگر به «کارگاه» و «جلسه‌ها» نمی‌رسد/);
  assert.deepEqual([...e.lost[0].nodes].sort(), ['جلسه‌ها', 'کارگاه']);
  // moving it under «ب»: loses «الف»'s rule, gains «ب»'s
  const e2 = moveEffect(nodes, objects, [], 'w', 'b', NOW);
  assert.deepEqual(e2.lost.map((l) => l.object.id), ['fromA']);
  assert.deepEqual(e2.gained.map((g) => g.object.id), ['other']);
  assert.match(e2.sentences.join(' '), /حالا به .* هم می‌رسد/);
  // moving within the same parent changes nothing
  assert.deepEqual(moveEffect(nodes, objects, [], 'w', 'a', NOW).sentences, []);
  // only APPROVED knowledge counts (a suggestion is not truth, and a draft never changed the text)
  assert.deepEqual(moveEffect(nodes, [o('p', 'a', { status: 'Proposed' })], [], 'w', '', NOW).lost, []);
});

test('moveEffect reports a confirmed global rule that becomes overridden after the subtree moves under its replacement', () => {
  const multipleRoots = [n('r', 'ریشهٔ یک'), n('r2', 'ریشهٔ دو'), n('a', 'الف', 'r'), n('w', 'کارگاه', 'a'), n('w1', 'جلسه‌ها', 'w')];
  const objects = [
    o('global', 'r2', { type: 'Fact', reach: 'global', title: 'قاعدهٔ عمومی' }),
    o('replacement', 'w1', { type: 'Fact', title: 'قاعدهٔ جایگزین' }),
  ];
  const relationships = [{ id: 'override', sourceId: 'replacement', targetId: 'global', type: 'overrides' as const, createdAt: '' }];
  const effect = moveEffect(multipleRoots, objects, relationships, 'w', 'r2', NOW);
  assert.deepEqual(effect.lost.map((x) => x.object.id), ['global']);
  assert.equal(effect.overrideChanges.length, 1);
  assert.equal(effect.overrideChanges[0].object.id, 'global');
  assert.equal(effect.overrideChanges[0].afterBy?.id, 'replacement');
  assert.match(effect.sentences.join(' '), /از این پس به‌خاطر «قاعدهٔ جایگزین» کنار گذاشته می‌شود/);
});
