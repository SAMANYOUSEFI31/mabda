import test from 'node:test';
import assert from 'node:assert/strict';
import { creditModeForPlan, previewCredits, rebuildCredits, chatCredits, calculateCreditCost } from './creditEngine.ts';

const plan = (pattern: 'single' | 'cascade' | 'critique', tier: 'cheap' | 'balanced' | 'frontier', userMode: 'auto' | 'fast' | 'deep' | 'sensitive' = 'auto') => ({ pattern, tier, userMode });

test('plan → price row', () => {
  assert.equal(creditModeForPlan(plan('single', 'cheap', 'fast')), 'fast');
  assert.equal(creditModeForPlan(plan('single', 'cheap')), 'fast');
  assert.equal(creditModeForPlan(plan('single', 'balanced')), 'auto');
  assert.equal(creditModeForPlan(plan('cascade', 'balanced')), 'auto');
  assert.equal(creditModeForPlan(plan('critique', 'balanced', 'deep')), 'critique');
  assert.equal(creditModeForPlan(plan('cascade', 'frontier')), 'critique', 'Auto escalated to frontier is priced at the higher row');
  assert.equal(creditModeForPlan(plan('critique', 'frontier', 'sensitive')), 'sensitive');
});

test('previewCredits equals the charge for the same plan (what is shown is what is deducted)', () => {
  const base = { deliverableType: 'Deliverable' as const, baseCreditCost: { fast: 18, auto: 26, critique: 50, sensitive: 80 } };
  assert.equal(previewCredits({ ...base, plan: plan('cascade', 'balanced') }), calculateCreditCost({ ...base, executionMode: 'auto' }));
  assert.equal(previewCredits({ ...base, plan: plan('cascade', 'balanced') }), 23);
  assert.equal(previewCredits({ ...base, plan: plan('cascade', 'frontier') }), 50);
});

test('managed credits apply to generations, rebuilds are half, chat deep costs 5', () => {
  assert.equal(rebuildCredits(23), 12);
  assert.equal(chatCredits(true), 5);
  assert.equal(chatCredits(false), 0);
});
