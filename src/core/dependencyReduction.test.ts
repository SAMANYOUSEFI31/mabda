import test from 'node:test';
import assert from 'node:assert/strict';
import { indirectReach, redundantLinks } from './dependencyReduction.ts';
import type { ContextObject, ContextRelationship } from '../types';

const ob = (id: string) => ({ id, status: 'Confirmed', type: 'Decision', title: id } as unknown as ContextObject);
const dep = (s: string, t: string) => ({ id: `${s}>${t}`, type: 'depends_on', sourceId: s, targetId: t } as unknown as ContextRelationship);
const objs = ['a', 'b', 'c', 'd'].map(ob);

test('A→B→C و A→C: لینک مستقیم اضافه است و از راه B می‌رسد', () => {
  const r = redundantLinks(objs, [dep('a', 'b'), dep('b', 'c'), dep('a', 'c')]);
  assert.deepEqual(r, [{ from: 'a', to: 'c', via: ['b'] }]);
});

test('زنجیرهٔ ساده و چرخه چیزی اضافه گزارش نمی‌دهند', () => {
  assert.deepEqual(redundantLinks(objs, [dep('a', 'b'), dep('b', 'c')]), []);
  assert.deepEqual(redundantLinks(objs, [dep('a', 'b'), dep('b', 'a')]), []);
});

test('الماس (دو راه به یک هدف، بدون لینک مستقیم) چیزی اضافه ندارد؛ با لینک مستقیم، همان لینک اضافه است', () => {
  const diamond = [dep('a', 'b'), dep('a', 'c'), dep('b', 'd'), dep('c', 'd')];
  assert.deepEqual(redundantLinks(objs, diamond), []);
  assert.deepEqual(redundantLinks(objs, [...diamond, dep('a', 'd')]).map((x) => `${x.from}>${x.to}`), ['a>d']);
});

test('اثر غیرمستقیم: بالادست و پایین‌دست بدون مورد مستقیم', () => {
  const r = indirectReach('b', objs, [dep('a', 'b'), dep('b', 'c'), dep('c', 'd')]);
  assert.deepEqual(r.upstream, ['d']);
  assert.deepEqual(r.downstream, []);
});
