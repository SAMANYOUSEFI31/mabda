/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAncestorNodeIds,
  calculateReadinessAndGaps,
  detectContradictions,
  findForRequired,
  fillsItem,
  extractQuantities,
  gapOrder,
} from './contextEngine';
import { DEFAULT_TREE_NODES, WORKSTREAM_SPECS } from './specs';
import { ContextObject } from '../types';

test('getAncestorNodeIds traverses parent branches up to root', () => {
  const chain = getAncestorNodeIds('offer', DEFAULT_TREE_NODES);
  assert.deepEqual(chain, ['offer', 'product', 'business']);

  const brandChain = getAncestorNodeIds('content', DEFAULT_TREE_NODES);
  assert.deepEqual(brandChain, ['content', 'brand', 'business']);
});

test('calculateReadinessAndGaps detects missing required items and calculates score', () => {
  const spec = WORKSTREAM_SPECS[0]; // main_positioning
  const emptyResult = calculateReadinessAndGaps(spec, []);
  assert.equal(emptyResult.score, 0);
  assert.equal(emptyResult.status, 'blocked');
  assert.equal(emptyResult.gaps.length > 0, true);

  const mockObjects: ContextObject[] = [
    {
      id: 'c1',
      workspaceId: 'ws_1',
      type: 'Fact',
      status: 'Confirmed',
      provenance: 'User Input',
      title: 'حوزهٔ کسب‌وکار و تخصص مشاوره برند',
      content: 'ما به صورت تخصصی مشاوره استراتژی برند و محتوا ارائه می‌دهیم.',
      nodeId: 'business',
      version: 1,
      createdAt: '2026-10-31',
      updatedAt: '2026-10-31',
    },
    {
      id: 'c2',
      workspaceId: 'ws_1',
      type: 'Decision',
      status: 'Confirmed',
      provenance: 'User Input',
      title: 'مخاطب اصلی',
      content: 'مخاطبان هدف ما فریلنسرها، مشاوران سولو و استارتاپ‌های نوپا هستند.',
      nodeId: 'business',
      version: 1,
      createdAt: '2026-10-31',
      updatedAt: '2026-10-31',
    },
  ];

  const partialResult = calculateReadinessAndGaps(spec, mockObjects);
  assert.equal(partialResult.confirmedCount >= 1, true);
  assert.equal(partialResult.score >= 40, true);
});

test('detectContradictions identifies opposing decisions and price violations', () => {
  const conflictingObjects: ContextObject[] = [
    {
      id: 'c1',
      workspaceId: 'ws_1',
      type: 'Constraint',
      status: 'Confirmed',
      provenance: 'User Input',
      title: 'مرز قیمت‌گذاری',
      content: 'ما تخفیف نداریم و قیمت‌ها مقطوع است.',
      nodeId: 'offer',
      version: 1,
      createdAt: '2026-10-31',
      updatedAt: '2026-10-31',
    },
    {
      id: 'c2',
      workspaceId: 'ws_1',
      type: 'Decision',
      status: 'Confirmed',
      provenance: 'User Input',
      title: 'کمپین بلک‌فرایدی',
      content: 'برگزاری جشنواره همراه با تخفیف ۵۰٪ برای بسته‌های پرو.',
      nodeId: 'offer',
      version: 1,
      createdAt: '2026-10-31',
      updatedAt: '2026-10-31',
    },
  ];

  const contradictions = detectContradictions(conflictingObjects);
  assert.equal(contradictions.length, 1);
  assert.match(contradictions[0].reason, /تناقض با مرز قیمت‌گذاری/);
});

const obj = (over: Partial<ContextObject>): ContextObject => ({
  id: 'o', workspaceId: 'ws_1', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 't', content: 'c',
  nodeId: 'business', version: 1, createdAt: '2026-10-31', updatedAt: '2026-10-31', ...over,
});

test('an unrelated fact in the same node does NOT fill required items', () => {
  const spec = WORKSTREAM_SPECS[0];
  const result = calculateReadinessAndGaps(spec, [obj({ id: 'x', title: 'ساعت کاری دفتر', content: 'شنبه تا چهارشنبه ۹ تا ۱۷' })]);
  assert.equal(result.score, 0);
  assert.equal(result.status, 'blocked');
  assert.equal(result.gaps.filter((g) => g.status === 'missing' && g.importance === 'required').length, spec.requiredContext.length);
});

test('title matching is Persian-aware (ZWNJ, hamza, parenthetical in label) and Confirmed beats Proposed', () => {
  const req = { label: 'حوزهٔ کسب‌وکار و تخصص' };
  const proposed = obj({ id: 'p', status: 'Proposed', title: 'حوزه کسب و کار و تخصص', content: 'x' });
  assert.equal(findForRequired(req, [proposed]), undefined); // different words (کسب و کار vs کسب‌وکار) -> not guessed
  const confirmed = obj({ id: 'c', title: 'حوزه کسب‌وکار و تخصص', content: 'مشاوره' });
  assert.equal(findForRequired(req, [proposed, confirmed])?.id, 'c');
  assert.equal(findForRequired({ label: 'مخاطب اصلی' }, [obj({ title: 'مخاطب اصلی', content: 'فریلنسرها' })])?.id, 'o');
});

test('gaps never carry canned suggested answers', () => {
  const r = calculateReadinessAndGaps(WORKSTREAM_SPECS[0], []);
  assert.ok(r.gaps.every((g) => g.suggestedAnswers.length === 0));
});

test('extractQuantities reads Persian digits, multipliers and units', () => {
  const q = extractQuantities('قیمت ۴ میلیون تومان و ۱۰٪ تخفیف برای ۳۰ روز');
  assert.deepEqual(q.map((x) => [x.cls, x.value]), [['money', 4_000_000], ['percent', 10], ['duration', 30 * 24]]); // time is one class, in hours
});

test('detectContradictions finds a real price conflict on the same topic, but not on different topics', () => {
  const a = obj({ id: 'a', title: 'قیمت بسته پایه', content: 'قیمت بسته پایه ۴ میلیون تومان است.' });
  const b = obj({ id: 'b', title: 'قیمت بسته پایه', content: 'قیمت بسته پایه ۲ میلیون تومان است.' });
  assert.equal(detectContradictions([a, b]).length, 1);
  const c = obj({ id: 'c', title: 'مدت دوره', content: 'دوره ۳۰ روز است و قیمت ۲ میلیون تومان.' });
  assert.equal(detectContradictions([a, c]).length, 0);
  const same = obj({ id: 'd', title: 'قیمت بسته پایه', content: '۴ میلیون تومان' });
  assert.equal(detectContradictions([a, same]).length, 0);
});

test('slot binding: an explicit slotKey fills exactly its item; title matching is for legacy objects only', () => {
  const req = { key: 'target_audience', label: 'مخاطب اصلی' };
  const legacy = obj({ id: 'l', title: 'مخاطب اصلی', content: 'فریلنسرها' });
  assert.equal(fillsItem(req, legacy), true, 'no slotKey → title match (old data)');
  // an object with a slotKey is bound to THAT slot: a matching title no longer matters, a different title does not matter either
  const bound = obj({ id: 'b', title: 'هر عنوان دیگری', content: 'مدیران محصول', slotKey: 'target_audience' });
  assert.equal(fillsItem(req, bound), true);
  const other = obj({ id: 'o', title: 'مخاطب اصلی', content: 'x', slotKey: 'core_problem' });
  assert.equal(fillsItem(req, other), false, 'same title but bound to another slot → does not fill this one');
  assert.equal(fillsItem({ label: 'مخاطب اصلی' }, bound), false, 'an item without a key cannot be filled by a slot-bound object');
  // explicit slot beats a legacy title match, even when the legacy one is Confirmed and the bound one only Proposed
  assert.equal(findForRequired(req, [{ ...legacy, status: 'Confirmed' }, { ...bound, status: 'Proposed' }])?.id, 'b');
  assert.equal(findForRequired(req, [{ ...other, status: 'Confirmed' }]), undefined);
});

test('readiness: the answer of a Gap (title = label, slotKey = key) closes the gap; a renamed object keeps filling its slot', () => {
  const spec = WORKSTREAM_SPECS[0];
  const item = spec.requiredContext.find((r) => r.key === 'target_audience')!;
  const gapOf = (objs: ContextObject[]) => calculateReadinessAndGaps(spec, objs).gaps.find((g) => g.key === item.key);
  assert.equal(gapOf([])?.status, 'missing');
  const answered = obj({ id: 'a', title: 'یک عنوان کاملاً دلخواه', content: 'سولوفاندرهای ایرانی', slotKey: item.key });
  assert.equal(gapOf([answered]), undefined);
  assert.equal(gapOf([{ ...answered, slotKey: undefined }])?.status, 'missing', 'without the slot (and without the title) it is a gap again');
});

test('readiness judges validity at the given `now`, not the wall clock (CORE-05)', () => {
  const spec = { ...WORKSTREAM_SPECS[0], requiredContext: [{ key: 'aud', label: 'مخاطب اصلی', description: 'مخاطب' }] } as typeof WORKSTREAM_SPECS[0];
  const item = obj({ id: 'a', title: 'مخاطب اصلی', content: 'فریلنسرها', validUntil: '2030-01-01' });
  // still valid today, but already expired at the `now` this call asks about
  const later = calculateReadinessAndGaps(spec, [item], [], {}, '2031-01-01T00:00:00Z');
  assert.equal(later.gaps.find((g) => g.key === 'aud')?.status, 'missing');
  const before = calculateReadinessAndGaps(spec, [item], [], {}, '2029-01-01T00:00:00Z');
  assert.notEqual(before.gaps.find((g) => g.key === 'aud')?.status, 'missing');
});

test('durations in different units are one class: «۲۴ ساعت» = «۱ روز», «۲۴ ساعت» ≠ «۳ روز»; «۴ هفته» ≈ «یک ماه» (algorithm review #3)', () => {
  const t = (id: string, content: string) => obj({ id, title: 'زمان پاسخ به پیام', content });
  assert.equal(detectContradictions([t('a', 'پاسخ ظرف ۲۴ ساعت'), t('b', 'پاسخ ظرف ۳ روز')]).length, 1);
  assert.equal(detectContradictions([t('a', 'پاسخ ظرف ۲۴ ساعت'), t('b', 'پاسخ ظرف ۱ روز')]).length, 0);
  assert.equal(detectContradictions([t('a', 'تحویل ۴ هفته'), t('b', 'تحویل ۱ ماه')]).length, 0, 'a month is not exactly four weeks; the same claim');
  assert.equal(detectContradictions([t('a', 'تحویل ۳۰ روز'), t('b', 'تحویل ۴۵ روز')]).length, 1);
});

test('a sentence that refuses the discount does not «define» one: «حتی تخفیف ۱۰٪ هم نمی‌دهیم» agrees with «تخفیف نداریم» (algorithm review #3)', () => {
  const rule = obj({ id: 'r', type: 'Constraint', title: 'تخفیف', content: 'تخفیف نداریم.' });
  assert.equal(detectContradictions([rule, obj({ id: 'x', title: 'سیاست قیمت', content: 'حتی تخفیف ۱۰٪ هم نمی‌دهیم.' })]).length, 0);
  assert.equal(detectContradictions([rule, obj({ id: 'y', title: 'جشنواره', content: 'برای عید تخفیف ۲۰٪ داریم. بقیهٔ سال نداریم.' })]).length, 1, 'another sentence defines it');
});

test('CORE-12: a high score with a Proposed or ambiguous required item never says «all confirmed»', () => {
  const spec = { id: 's', title: 's', target: '', description: '', suggestedContext: [], optionalContext: [], deliverables: [],
    requiredContext: ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, label: k, description: k, nodeId: 'n' })) } as never;
  const all = ['a', 'b', 'c', 'd', 'e'].map((k) => obj({ id: k, title: k, content: k, slotKey: k, status: 'Confirmed' }));
  const full = calculateReadinessAndGaps(spec, all);
  assert.equal(full.status, 'ready'); assert.equal(full.fullyConfirmed, true); assert.equal(full.confirmedCount, 5);
  assert.match(full.summary, /تمام/);
  // one Proposed: 4.7 / 5 = 94% → still «ready», but not «all confirmed»
  const one = calculateReadinessAndGaps(spec, all.map((o) => (o.id === 'e' ? { ...o, status: 'Proposed' as const } : o)));
  assert.equal(one.status, 'ready'); assert.equal(one.fullyConfirmed, false); assert.equal(one.confirmedCount, 4);
  assert.doesNotMatch(one.summary, /تمام|آمادگی کامل/);
  // three Proposed: the weighted 4.1 is not «4 confirmed»
  const three = calculateReadinessAndGaps(spec, all.map((o) => (['c', 'd', 'e'].includes(o.id) ? { ...o, status: 'Proposed' as const } : o)));
  assert.equal(three.confirmedCount, 2);
  // a confirmed but ambiguous one (judged) is not settled either
  const amb = calculateReadinessAndGaps(spec, all, [], { e: { version: all[4].version, ambiguous: true } } as never);
  assert.equal(amb.fullyConfirmed, false);
});

test('CORE-13: gaps follow their dependencies through any chain, stably; a cycle never loses an item', () => {
  const g = (key: string, dependsOn?: string[]) => ({ key, dependsOn });
  const keys = (l: Array<{ key: string }>) => l.map((x) => x.key).join(',');
  // C ← B ← A given in the worst order, with an unrelated D between them
  assert.equal(keys(gapOrder([g('C', ['B']), g('D'), g('B', ['A']), g('A')])), 'D,A,B,C');
  assert.equal(keys(gapOrder([g('x'), g('y')])), 'x,y', 'no dependencies: input order');
  const cyc = gapOrder([g('p', ['q']), g('q', ['p']), g('r')]);
  assert.equal(keys(cyc), 'r,p,q', 'the cycle comes after what can be ordered, in input order');
  assert.equal(keys(gapOrder([g('s', ['s', 'missing'])])), 's', 'self and unknown dependencies are ignored');
});
