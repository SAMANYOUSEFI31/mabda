import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatePairs, isFresh, MAX_CANDIDATES, pairKey, pairsToJudge, unresolvedContradictions } from './contradictionCandidates';
import type { ContextObject } from '../types';

const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'business', version: 1, createdAt: '', updatedAt: '', ...p,
});

test('same slot: two objects filling the same Gap item with different claims are a candidate', () => {
  const pairs = candidatePairs([o('a', { title: 'x', slotKey: 'target_audience', content: 'فریلنسرها', nodeId: 'brand' }), o('b', { title: 'کاملاً چیز دیگر', slotKey: 'target_audience', content: 'سازمان‌های بزرگ', nodeId: 'offer' }), o('c', { slotKey: 'core_problem' })]);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].reasons, ['same_slot']);
  assert.equal(pairs[0].key, pairKey('b', 'a'));
});

test('same node + similar title; unrelated titles and other nodes are not candidates', () => {
  const near = candidatePairs([o('a', { title: 'مخاطب اصلی کسب‌وکار', content: 'فریلنسرها' }), o('b', { title: 'مخاطب اصلی', content: 'شرکت‌ها' })]);
  assert.deepEqual(near[0].reasons, ['same_node']);
  assert.equal(candidatePairs([o('a', { title: 'مخاطب اصلی کسب‌وکار', content: 'الف' }), o('b', { title: 'مخاطب اصلی', content: 'ب', nodeId: 'offer' })]).length, 0, 'similar title but another node and no number/qualifier difference');
  assert.equal(candidatePairs([o('a', { title: 'لحن برند', content: 'الف' }), o('b', { title: 'قیمت اشتراک', content: 'ب' })]).length, 0);
});

test('number / qualifier differences between similar titles', () => {
  const num = candidatePairs([o('a', { title: 'قیمت اشتراک ماهانه', content: 'قیمت ۴ میلیون تومان است', nodeId: 'offer' }), o('b', { title: 'قیمت اشتراک', content: 'قیمت ۶ میلیون تومان است', nodeId: 'brand' })]);
  assert.ok(num[0].reasons.includes('number_differs'));
  const q = candidatePairs([o('a', { title: 'تخفیف محصول', content: 'تخفیف نداریم', nodeId: 'offer' }), o('b', { title: 'تخفیف محصول', content: 'تخفیف جشنواره‌ای می‌دهیم', nodeId: 'brand' })]);
  assert.ok(q[0].reasons.includes('qualifier_differs'));
  assert.equal(candidatePairs([o('a', { title: 'قیمت', content: 'قیمت ۴ میلیون تومان' }), o('b', { title: 'قیمت', content: 'قیمت ۴ میلیون تومان' })]).length, 0, 'identical claims agree');
});

test('only Confirmed / Proposed take part; the list is capped and ordered by strength', () => {
  const dead = candidatePairs([o('a', { slotKey: 's', content: 'الف' }), o('b', { slotKey: 's', content: 'ب', status: 'Archived' }), o('c', { slotKey: 's', content: 'ج', status: 'Superseded' }), o('d', { slotKey: 's', content: 'د', status: 'Needs Review' })]);
  assert.equal(dead.length, 0);
  const many = Array.from({ length: 12 }, (_, i) => o(`o${i}`, { slotKey: 's', content: `ادعای ${i}` }));
  assert.equal(candidatePairs(many).length, MAX_CANDIDATES);
  const strong = candidatePairs([o('a', { title: 'قیمت اشتراک', content: '۴ میلیون تومان', slotKey: 'p' }), o('b', { title: 'قیمت اشتراک', content: '۶ میلیون تومان', slotKey: 'p' }), o('c', { slotKey: 'p', content: 'چیز دیگر', title: 'نامرتبط کامل' })]);
  assert.deepEqual(strong[0].key, pairKey('a', 'b'), 'more reasons first');
});

test('pairsToJudge skips pairs with a fresh answer or a user resolution; a changed version asks again', () => {
  const a = o('a', { slotKey: 's', content: 'الف' });
  const b = o('b', { slotKey: 's', content: 'ب' });
  const key = pairKey('a', 'b');
  assert.equal(pairsToJudge([a, b], []).length, 1);
  assert.equal(pairsToJudge([a, b], [{ key, aVersion: 1, bVersion: 1, conflict: true, reason: 'x' }]).length, 0);
  assert.equal(pairsToJudge([{ ...a, version: 2 }, b], [{ key, aVersion: 1, bVersion: 1, conflict: true, reason: 'x' }]).length, 1, 'an edited object is judged again');
  assert.equal(pairsToJudge([{ ...a, version: 2 }, b], [{ key, aVersion: 1, bVersion: 1, conflict: true, reason: 'x', resolution: 'separated' }]).length, 0, 'a resolved pair stays resolved');
  const p = candidatePairs([a, b])[0];
  assert.equal(isFresh(p, { key, aVersion: 1, bVersion: 1, conflict: false, reason: '' }), true);
  assert.equal(isFresh(p, undefined), false);
});

test('unresolvedContradictions: rule conflicts + semantic conflicts for the current versions; resolved or edited pairs are not shown', () => {
  const a = o('a', { title: 'قیمت اشتراک', content: 'قیمت ۴ میلیون تومان', nodeId: 'offer' });
  const b = o('b', { title: 'قیمت اشتراک', content: 'قیمت ۶ میلیون تومان', nodeId: 'offer' });
  const rule = unresolvedContradictions([a, b], []);
  assert.deepEqual(rule.map((c) => c.source), ['rule']);
  assert.equal(unresolvedContradictions([a, b], [{ key: pairKey('a', 'b'), aVersion: 1, bVersion: 1, conflict: true, reason: 'x', resolution: 'kept:a' }]).length, 0, 'resolved');

  const x = o('x', { title: 'الف', content: 'ادعای یک', slotKey: 's' });
  const y = o('y', { title: 'ب', content: 'ادعای دو', slotKey: 's' });
  const j = { key: pairKey('x', 'y'), aVersion: 1, bVersion: 1, conflict: true, reason: 'نمی‌خوانند' };
  const sem = unresolvedContradictions([x, y], [j]);
  assert.deepEqual([sem[0].source, sem[0].reason], ['semantic', 'نمی‌خوانند']);
  assert.equal(unresolvedContradictions([x, { ...y, version: 2 }], [j]).length, 0, 'edited since the judgement → waits for a new one');
  assert.equal(unresolvedContradictions([x, y], [{ ...j, conflict: false }]).length, 0, 'compatible');
  assert.equal(unresolvedContradictions([x, { ...y, status: 'Superseded' }], [j]).length, 0);
});

const dep = (a: string, b: string) => ({ id: `r_${a}_${b}`, sourceId: a, targetId: b, type: 'depends_on' as const, createdAt: '' });

test('linked: two live objects tied by depends_on are a candidate whatever their titles say; dead or unlinked ones are not', () => {
  const a = o('a', { title: 'قیمت اشتراک', content: 'الف', nodeId: 'offer' });
  const b = o('b', { title: 'کانال تبلیغ', content: 'ب', nodeId: 'brand', type: 'Fact' });
  assert.equal(candidatePairs([a, b]).length, 0);
  const linked = candidatePairs([a, b], 10, [dep('a', 'b')]);
  assert.deepEqual(linked.map((p) => [p.key, p.reasons]), [['a|b', ['linked']]]);
  assert.equal(candidatePairs([a, { ...b, status: 'Superseded' }], 10, [dep('a', 'b')]).length, 0);
  assert.equal(candidatePairs([a, b], 10, [{ ...dep('a', 'b'), type: 'supersedes' }]).length, 0, 'only depends_on counts');
});

test('same_node_same_type: same node and type with overlapping TEXT; a different type or node or low overlap is not', () => {
  const a = o('a', { title: 'سیاست ارسال', content: 'ارسال برای همهٔ اشتراک‌ها رایگان است', nodeId: 'ship' });
  const b = o('b', { title: 'هزینهٔ ارسال', content: 'ارسال با هزینهٔ ثابت برای همهٔ سفارش‌ها', nodeId: 'ship' });
  assert.deepEqual(candidatePairs([a, b]).map((p) => p.reasons.includes('same_node_same_type')), [true]);
  assert.equal(candidatePairs([a, { ...b, type: 'Constraint' }]).length, 0);
  assert.equal(candidatePairs([a, { ...b, nodeId: 'other' }]).length, 0);
  assert.equal(candidatePairs([a, { ...b, content: 'بسته‌بندی کاغذی و قابل بازیافت' }]).length, 0, 'unrelated text in the same node and type');
});
