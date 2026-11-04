import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeEffect } from './scopeMove.ts';
import type { ContextObject, TreeNode } from '../types';

const nodes = [{ id: 'brand', label: 'برند' }, { id: 'support', label: 'پشتیبانی', parentId: 'brand' }, { id: 'sales', label: 'فروش', parentId: 'brand' }, { id: 'hr', label: 'استخدام' }] as unknown as TreeNode[];
const o = { id: 'c1', type: 'Constraint', status: 'Confirmed', title: 'لحن', content: 'x', nodeId: 'support', reach: 'position', version: 1 } as unknown as ContextObject;
const NOW = '2026-01-01';

test('بردن به والد: بخش‌های هم‌سطح و والد می‌گیرند، چیزی از دست نمی‌رود', () => {
  const r = scopeEffect(nodes, [], o, { kind: 'node', nodeId: 'brand' }, NOW);
  assert.deepEqual(r.gained.sort(), ['برند', 'فروش']);
  assert.deepEqual(r.lost, []);
});

test('همه‌جا: بخش بی‌ربط هم می‌گیرد', () => {
  assert.ok(scopeEffect(nodes, [], o, { kind: 'global' }, NOW).gained.includes('استخدام'));
});

test('جابه‌جایی به شاخهٔ دیگر: یکی از دست می‌دهد و یکی می‌گیرد', () => {
  const r = scopeEffect(nodes, [], o, { kind: 'node', nodeId: 'sales' }, NOW);
  assert.deepEqual(r.lost, ['پشتیبانی']);
  assert.deepEqual(r.gained, ['فروش']);
});

test('بدون تغییر', () => {
  assert.equal(scopeEffect(nodes, [], o, { kind: 'node', nodeId: 'support' }, NOW).sentence, 'دامنهٔ اثر عوض نمی‌شود.');
});
