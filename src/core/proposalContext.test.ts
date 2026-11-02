import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalContext } from './proposalContext';
import type { ContextObject } from '../types';

const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: id, nodeId: 'offer', version: 1, createdAt: '', updatedAt: '', ...p,
});

test('same slot → the proposal replaces that live object', () => {
  const r = proposalContext(o('p', { status: 'Proposed', slotKey: 'audience', title: 'مخاطب جدید' }), [o('a', { slotKey: 'audience', title: 'مخاطب' }), o('b')]);
  assert.equal(r.replaces?.id, 'a');
});

test('same node + type + identical title (spacing/case ignored) → replaces; a different type is only «related»', () => {
  const p = o('p', { status: 'Proposed', title: 'قیمت  پایه' });
  assert.equal(proposalContext(p, [o('a', { title: 'قیمت پایه' })]).replaces?.id, 'a');
  const r = proposalContext(p, [o('c', { type: 'Fact', title: 'قیمت پایه' })]);
  assert.equal(r.replaces, undefined);
  assert.deepEqual(r.related.map((x) => x.id), ['c']);
});

test('no match → related = same-node objects with a close title, best first, max 3; other nodes, proposals and superseded ones are ignored', () => {
  const p = o('p', { status: 'Proposed', title: 'قیمت پایه ماهانه محصول' });
  const objs = [
    o('near1', { title: 'قیمت پایه محصول' }), o('near2', { title: 'قیمت ماهانه' }), o('far', { title: 'لحن برند' }),
    o('other', { title: 'قیمت پایه ماهانه محصول', nodeId: 'brand' }), o('prop', { title: 'قیمت پایه محصول', status: 'Proposed' }), o('old', { title: 'قیمت پایه محصول', status: 'Superseded' }),
  ];
  const r = proposalContext(p, objs);
  assert.equal(r.replaces, undefined);
  assert.deepEqual(r.related.map((x) => x.id), ['near1', 'near2']);
  assert.ok(proposalContext(p, [1, 2, 3, 4, 5].map((i) => o(`n${i}`, { title: 'قیمت پایه ماهانه' }))).related.length <= 3);
});

test('same-slot objects other than the replaced one are listed as related', () => {
  const r = proposalContext(o('p', { status: 'Proposed', slotKey: 's' }), [o('a', { slotKey: 's' }), o('b', { slotKey: 's' })]);
  assert.deepEqual([r.replaces?.id, r.related.map((x) => x.id)], ['a', ['b']]);
});
