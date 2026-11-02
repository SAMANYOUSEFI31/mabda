import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineOf, changedSince, pairsAfterChange, JUDGE_SETTLE_MS } from './judgePolicy';
import { buildDemo } from './demoData';
import type { ContextObject } from '../types';

const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'business', version: 1, createdAt: '', updatedAt: '', ...p,
});
const pair = [o('a', { slotKey: 's', content: 'الف' }), o('b', { slotKey: 's', content: 'ب' })];

test('opening a workspace judges nothing: with the loaded state as baseline no pair is due', () => {
  assert.equal(pairsAfterChange(pair, [], baselineOf(pair)).length, 0);
  assert.ok(JUDGE_SETTLE_MS >= 3000, 'the client waits a few seconds so a burst of edits is one call');
});

test('an edit of one object of a candidate pair makes exactly that pair due; a new object too; an unrelated edit does not', () => {
  const base = baselineOf(pair);
  const edited = [{ ...pair[0], version: 2 }, pair[1], o('z', { title: 'نامرتبط کامل', slotKey: 'other', content: 'ز' })];
  assert.deepEqual([...changedSince(edited, base)].sort(), ['a', 'z']);
  assert.deepEqual(pairsAfterChange(edited, [], base).map((p) => p.key), ['a|b']);
  assert.equal(pairsAfterChange([pair[0], pair[1], o('c', { slotKey: 's', content: 'ج' })], [], base).length, 2, 'a new object paired with both');
  assert.equal(pairsAfterChange([...pair, o('q', { title: 'چیز دیگر', content: 'ک', nodeId: 'brand', type: 'Fact' })], [], base).length, 0, 'a new object that pairs with nothing');
});

test('a pair with a fresh judgement or a user resolution is not due even after a change', () => {
  const base = baselineOf(pair);
  const edited = [{ ...pair[0], version: 2 }, pair[1]];
  const fresh = { key: 'a|b', aVersion: 2, bVersion: 1, conflict: false, reason: '' };
  assert.equal(pairsAfterChange(edited, [fresh], base).length, 0);
  assert.equal(pairsAfterChange(edited, [{ ...fresh, aVersion: 1, resolution: 'separated' }], base).length, 0);
});

test('the demo workspace as loaded or freshly reset has no pair due, however many candidates it has', () => {
  const d = buildDemo(new Date('2026-06-10T08:00:00Z'));
  assert.equal(pairsAfterChange(d.objects, [], baselineOf(d.objects), d.relationships).length, 0);
});
