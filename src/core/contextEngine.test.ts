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
} from './contextEngine';
import { calculateCreditCost, checkChatFairUse } from './creditEngine';
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

test('checkChatFairUse flags soft and hard thresholds accurately', () => {
  const proStatus = checkChatFairUse('pro', 40);
  assert.equal(proStatus.allowed, true);
  assert.equal(proStatus.isSoftExceeded, false);
  assert.equal(proStatus.remaining, 30);

  const softExceeded = checkChatFairUse('pro', 75);
  assert.equal(softExceeded.isSoftExceeded, true);
  assert.equal(softExceeded.isHardExceeded, false);

  const hardExceeded = checkChatFairUse('pro', 150);
  assert.equal(hardExceeded.allowed, false);
  assert.equal(hardExceeded.isHardExceeded, true);
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
