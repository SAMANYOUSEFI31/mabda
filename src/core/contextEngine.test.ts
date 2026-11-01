/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAncestorNodeIds,
  resolveActiveContextsForNode,
  calculateReadinessAndGaps,
  detectContradictions,
  findForRequired,
  fillsItem,
  extractQuantities,
} from './contextEngine';
import { calculateCreditCost, checkChatFairUse, chatCountToday } from './creditEngine';
import { WORKSTREAM_SPECS } from './specs';
import { ContextObject } from '../types';

test('getAncestorNodeIds traverses parent branches up to root', () => {
  const chain = getAncestorNodeIds('offer');
  assert.deepEqual(chain, ['offer', 'product', 'business']);

  const brandChain = getAncestorNodeIds('content');
  assert.deepEqual(brandChain, ['content', 'brand', 'business']);
});

test('calculateCreditCost applies 10% auto discount and 50% rebuild discount correctly', () => {
  // Fast mode on Deliverable base = 18
  const fastCost = calculateCreditCost({
    deliverableType: 'Deliverable',
    executionMode: 'fast',
  });
  assert.equal(fastCost, 18);

  // Auto mode base = 26, with 10% discount -> 26 * 0.9 = 23.4 rounded to 23
  const autoCost = calculateCreditCost({
    deliverableType: 'Deliverable',
    executionMode: 'auto',
  });
  assert.equal(autoCost, 23);

  // Critique mode base = 50
  const critiqueCost = calculateCreditCost({
    deliverableType: 'Deliverable',
    executionMode: 'critique',
  });
  assert.equal(critiqueCost, 50);

  // Rebuild after context change = 50% of 23 = 12
  const rebuildCost = calculateCreditCost({
    deliverableType: 'Deliverable',
    executionMode: 'auto',
    isRebuildAfterContextChange: true,
  });
  assert.equal(rebuildCost, 12);
});

test('chat fair-use is soft only: it degrades, it never blocks; the count resets each day', () => {
  const under = checkChatFairUse('pro', 40);
  assert.equal(under.isSoftExceeded, false);
  assert.equal(under.remaining, 30);
  assert.equal(checkChatFairUse('pro', 75).isSoftExceeded, true);
  assert.equal(checkChatFairUse('pro', 5000).isSoftExceeded, true);
  assert.equal('allowed' in checkChatFairUse('pro', 5000), false);
  assert.equal(chatCountToday(60, '2026-11-01', '2026-11-01'), 60);
  assert.equal(chatCountToday(60, '2026-10-31', '2026-11-01'), 0);
  assert.equal(chatCountToday(14, undefined, '2026-11-01'), 0);
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
      title: 'مخاطب اصلی (ICP)',
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
  assert.equal(findForRequired({ label: 'مخاطب اصلی (ICP)' }, [obj({ title: 'مخاطب اصلی', content: 'فریلنسرها' })])?.id, 'o');
});

test('gaps never carry canned suggested answers', () => {
  const r = calculateReadinessAndGaps(WORKSTREAM_SPECS[0], []);
  assert.ok(r.gaps.every((g) => g.suggestedAnswers.length === 0));
});

test('extractQuantities reads Persian digits, multipliers and units', () => {
  const q = extractQuantities('قیمت ۴ میلیون تومان و ۱۰٪ تخفیف برای ۳۰ روز');
  assert.deepEqual(q.map((x) => [x.cls, x.value]), [['money', 4_000_000], ['percent', 10], ['day', 30]]);
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
  const req = { key: 'target_audience', label: 'مخاطب اصلی (ICP)' };
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
