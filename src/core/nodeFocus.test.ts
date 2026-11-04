import test from 'node:test';
import assert from 'node:assert/strict';
import { abbreviate, childSummaries, fromAbove, pathTo } from './nodeFocus.ts';
import type { ContextObject, TreeNode } from '../types';

const nodes = [{ id: 'a', label: 'آفر' }, { id: 'b', label: 'قیمت', parentId: 'a' }, { id: 'c', label: 'تخفیف', parentId: 'b' }, { id: 'd', label: 'پلن‌ها', parentId: 'c' }, { id: 'z', label: 'برند' }] as unknown as TreeNode[];
const ob = (id: string, nodeId: string, p: Partial<ContextObject> = {}) => ({ id, nodeId, status: 'Confirmed', type: 'Fact', title: id, content: 'x', version: 1, ...p }) as unknown as ContextObject;

test('مسیر از ریشه تا بخش؛ ناموجود = خالی', () => {
  assert.deepEqual(pathTo(nodes, 'd').map((c) => c.label), ['آفر', 'قیمت', 'تخفیف', 'پلن‌ها']);
  assert.deepEqual(pathTo(nodes, 'nope'), []);
});

test('کوتاه‌کردن مسیر برای موبایل: اول، …، دو تای آخر', () => {
  const r = abbreviate(pathTo(nodes, 'd'));
  assert.deepEqual(r.shown.map((c) => c.id), ['a', 'c', 'd']);
  assert.deepEqual(r.hidden.map((c) => c.id), ['b']);
  assert.equal(abbreviate(pathTo(nodes, 'b')).hidden.length, 0);
});

test('خلاصهٔ زیربخش‌ها روی کل زیردرخت شمرده می‌شود، نه فقط فرزند مستقیم', () => {
  const objs = [ob('1', 'b'), ob('2', 'c'), ob('3', 'd'), ob('4', 'd', { status: 'Proposed' }), ob('5', 'z')];
  const [s] = childSummaries(nodes, objs, new Map([['d', 2]]), new Set(['3']), 'a');
  assert.deepEqual([s.node.id, s.knowledge, s.openThoughts, s.stale, s.subSections], ['b', 3, 2, 1, 2]);
});

test('از بالا: قید والد و «همه‌جا» با منشأ؛ همتا و پایین نمی‌آیند', () => {
  const objs = [ob('c1', 'a', { type: 'Constraint', reach: 'position', title: 'لحن' }), ob('g1', 'z', { type: 'Constraint', title: 'ممنوع' }), ob('own', 'd'), ob('below', 'd')];
  const r = fromAbove(nodes, objs, [], 'c', '2026-01-01');
  assert.ok(r.some((x) => x.item.object.id === 'c1' && x.fromLabel === 'آفر'));
  assert.ok(r.some((x) => x.item.object.id === 'g1' && x.fromLabel === 'برند'));
  assert.ok(!r.some((x) => x.item.object.id === 'own' || x.item.object.id === 'below'));
});
