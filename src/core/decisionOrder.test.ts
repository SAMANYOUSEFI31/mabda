import test from 'node:test';
import assert from 'node:assert/strict';
import { orderByStructure, orderWaitingByStructure } from './decisionOrder';
import { planDecisions, waitingDecisions } from './decisionGraph';
import { thinkingSpace } from './thinkingSpace';
import type { ContextObject, ContextRelationship, TreeNode } from '../types';

const node = (id: string, parentId?: string): TreeNode => ({ id, label: id, description: '', ...(parentId ? { parentId } : {}) });
const nodes = [node('root'), node('sub', 'root'), node('gift', 'sub'), node('other', 'root')];
const obj = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Proposed', provenance: 'AI Suggested', title: id, content: id, nodeId, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...p });
const dep = (s: string, t: string): ContextRelationship => ({ id: `${s}>${t}`, sourceId: s, targetId: t, type: 'depends_on', createdAt: '' });
const idOf = (o: ContextObject) => o.id;

test('the upper section item comes first even when the sub-section one was listed first; unrelated items keep their place', () => {
  const items = [obj('gift-price', 'gift'), obj('tone', 'other'), obj('sub-price', 'sub')];
  const r = orderByStructure(items, { idOf, objectOf: (o) => o, nodes });
  assert.deepEqual(r.items.map(idOf), ['sub-price', 'gift-price', 'tone'], 'sub-price jumps in front of gift-price; tone is not pulled along');
  assert.deepEqual(r.below.get('sub-price'), ['gift-price']);
  assert.equal(r.below.has('gift-price'), false);
});

test('no structure relation (siblings / same section) → the order is untouched and there is no reason', () => {
  const items = [obj('b', 'other'), obj('a', 'sub'), obj('c', 'sub')];
  const r = orderByStructure(items, { idOf, objectOf: (o) => o, nodes });
  assert.deepEqual(r.items.map(idOf), ['b', 'a', 'c']);
  assert.equal(r.below.size, 0);
});

test('depends_on wins: if the upper decision rests on the lower one, the lower stays first and no reason is given', () => {
  const up = obj('up', 'sub'), low = obj('low', 'gift');
  const objects = [up, low];
  const plan = planDecisions(objects, [dep('up', 'low')]); // low in layer 0, up in layer 1
  const all = waitingDecisions(plan);
  const r = orderWaitingByStructure({ ready: [...all.ready, ...all.blocked], blocked: [], concurrent: [] }, plan, objects, nodes);
  assert.deepEqual(r.waiting.ready.map((u) => u.ids[0]), ['low', 'up']);
  assert.equal(r.below.has('up'), false, 'no «ارث می‌برند» line against the dependency');
});

test('a Fact is not a decision: no reordering and no reason', () => {
  const f = orderByStructure([obj('g', 'gift'), obj('f', 'root', { type: 'Fact' })], { idOf, objectOf: (o) => o, nodes });
  assert.deepEqual(f.items.map(idOf), ['g', 'f']);
  assert.equal(f.below.size, 0);
});

test('the thinking space puts the upper proposal first and says how many follow; a section filter counts only what is shown', () => {
  const objects = [
    obj('gift-price', 'gift', { source: { kind: 'chat', at: '2026-03-02T00:00:00Z' } as never }),
    obj('sub-price', 'sub', { source: { kind: 'chat', at: '2026-03-01T00:00:00Z' } as never }),
  ];
  const v = thinkingSpace({ objects, notes: [], nodes, relationships: [] });
  assert.deepEqual(v.waiting.map((w) => w.object.id), ['sub-price', 'gift-price'], 'newest-first alone would have put gift-price first');
  assert.equal(v.structure['sub-price'], 1);
  assert.deepEqual(thinkingSpace({ objects, notes: [], nodes, relationships: [] }, { nodeId: 'gift' }).structure, {});
});

test('ordering never changes any data', () => {
  const objects = [obj('g', 'gift'), obj('s', 'sub')];
  const before = JSON.stringify(objects);
  orderByStructure(objects, { idOf, objectOf: (o) => o, nodes });
  thinkingSpace({ objects, notes: [], nodes });
  assert.equal(JSON.stringify(objects), before);
});
