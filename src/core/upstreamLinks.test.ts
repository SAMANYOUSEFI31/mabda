import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestUpstreamLinks } from './upstreamLinks';
import { sharedTopic } from './mentions';
import type { ContextObject, ContextRelationship, TreeNode } from '../types';

const node = (id: string, label: string, parentId?: string): TreeNode => ({ id, label, description: '', ...(parentId ? { parentId } : {}) });
const nodes = [node('root', 'کسب‌وکار'), node('sub', 'اشتراک', 'root'), node('gift', 'بستهٔ هدیه', 'sub'), node('other', 'برند', 'root')];
const obj = (id: string, nodeId: string, title: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title, content: title, nodeId, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...p });
const NOW = new Date('2026-06-10T10:00:00Z');
const base = { title: 'قیمت بستهٔ هدیه', type: 'Decision' as const, nodeId: 'gift', nodes, relationships: [] as ContextRelationship[], now: NOW };
const dep = (s: string, t: string): ContextRelationship => ({ id: `${s}>${t}`, sourceId: s, targetId: t, type: 'depends_on', createdAt: '' });

test('a decision from above that talks about the same thing is offered, with where it comes from and the shared word', () => {
  const r = suggestUpstreamLinks({ ...base, objects: [obj('p', 'sub', 'قیمت اشتراک ماهانه'), obj('t', 'sub', 'لحن برند')] });
  assert.deepEqual(r.map((x) => x.targetId), ['p']);
  assert.equal(r[0].fromNode, 'اشتراک');
  assert.equal(r[0].because, 'قیمت');
});

test('being above is not a reason by itself; the same section, siblings and things below are never offered', () => {
  const objects = [obj('t', 'sub', 'لحن برند'), obj('same', 'gift', 'قیمت هدیه ویژه'), obj('sib', 'other', 'قیمت برند')];
  assert.deepEqual(suggestUpstreamLinks({ ...base, objects }), []);
  assert.deepEqual(suggestUpstreamLinks({ ...base, nodeId: 'sub', title: 'قیمت اشتراک', objects: [obj('g', 'gift', 'قیمت بستهٔ هدیه')] }), []);
});

test('only approved decisions and red lines in force: not Proposed, Facts, expired or set aside', () => {
  const objects = [
    obj('prop', 'sub', 'قیمت اشتراک', { status: 'Proposed' }),
    obj('fact', 'sub', 'قیمت اشتراک واقعیت', { type: 'Fact' }),
    obj('exp', 'sub', 'قیمت اشتراک قدیمی', { validUntil: '2026-01-01' }),
    obj('aside', 'sub', 'قیمت اشتراک کنار'),
    obj('mine', 'gift', 'قیمت هدیه ما'),
  ];
  const overrides: ContextRelationship = { id: 'o', sourceId: 'mine', targetId: 'aside', type: 'overrides', createdAt: '' };
  assert.deepEqual(suggestUpstreamLinks({ ...base, objects, relationships: [overrides] }), []);
});

test('a red line “everywhere” reaches the section too (global); a Fact being written gets nothing', () => {
  const rule = obj('rule', 'other', 'سقف قیمت هدیه', { type: 'Constraint' });
  assert.deepEqual(suggestUpstreamLinks({ ...base, objects: [rule] }).map((x) => x.targetId), ['rule']);
  assert.deepEqual(suggestUpstreamLinks({ ...base, type: 'Fact', objects: [rule] }), []);
});

test('already linked, turned down and cycle-closing links are left out; at most three', () => {
  const objects = [obj('a', 'sub', 'قیمت اشتراک'), obj('b', 'sub', 'قیمت پایه'), obj('c', 'root', 'قیمت کلی'), obj('d', 'root', 'قیمت نهایی'), obj('me', 'gift', 'قیمت بستهٔ هدیه')];
  assert.equal(suggestUpstreamLinks({ ...base, objects }).length, 3, 'capped');
  const r1 = suggestUpstreamLinks({ ...base, selfId: 'me', objects, relationships: [dep('me', 'a')], dismissed: ['b'] });
  assert.ok(!r1.some((x) => x.targetId === 'a' || x.targetId === 'b'));
  const r2 = suggestUpstreamLinks({ ...base, selfId: 'me', objects, relationships: [dep('c', 'me')] });
  assert.ok(!r2.some((x) => x.targetId === 'c'), 'c already rests on me');
});

test('it creates nothing: relationships and objects are untouched', () => {
  const objects = [obj('p', 'sub', 'قیمت اشتراک')];
  const rels: ContextRelationship[] = [];
  const snap = JSON.stringify({ objects, rels });
  suggestUpstreamLinks({ ...base, objects, relationships: rels });
  assert.equal(JSON.stringify({ objects, rels }), snap);
  assert.equal(rels.length, 0);
});

test('sharedTopic: the old rule is unchanged; “loose” also accepts one shared word', () => {
  assert.equal(sharedTopic('قیمت', 'قیمت بستهٔ هدیه'), null);
  assert.deepEqual(sharedTopic('قیمت', 'قیمت بستهٔ هدیه', { loose: true }), ['قیمت']);
  assert.equal(sharedTopic('لحن برند', 'قیمت بستهٔ هدیه', { loose: true }), null);
});
