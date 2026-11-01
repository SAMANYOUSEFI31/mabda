import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTITLEMENTS_CONFIG } from './entitlements.config';
import { can, cheapestPlanWith, entitlementsOf, meters, objectsRemaining, PLAN_IDS } from './entitlements';
import { PLANS, FILE_QUOTA_TOKENS } from './creditEngine';
import { categoryOf, costReport, heavyUseCost, isOurCost } from './costReport';
import { ENTITLEMENTS_CONFIG as C } from './entitlements.config';

test('every plan has every entitlement and plans only grow (Starter ≤ Pro ≤ Max)', () => {
  const keys = ['priceMonthlyUsd', 'workspaces', 'maxObjects', 'fileTokensPerMonth', 'engines', 'mcp', 'contextPack', 'byok', 'decisionJudgmentsPerDay', 'coachPerDay', 'customSpecs'];
  for (const p of PLAN_IDS) for (const k of keys) assert.ok(k in entitlementsOf(p), `${p}.${k}`);
  const nums = ['priceMonthlyUsd', 'workspaces', 'maxObjects', 'fileTokensPerMonth', 'decisionJudgmentsPerDay', 'coachPerDay'] as const;
  for (const k of nums) {
    assert.ok(entitlementsOf('starter')[k] <= entitlementsOf('pro')[k] && entitlementsOf('pro')[k] <= entitlementsOf('max')[k], k);
  }
});

test('numbers agree with the PRD plan table (workspaces 1/3/10, price 9/24/49, files 150k/500k/1.5M)', () => {
  assert.deepEqual(PLAN_IDS.map((p) => entitlementsOf(p).workspaces), [1, 3, 10]);
  assert.deepEqual(PLAN_IDS.map((p) => entitlementsOf(p).priceMonthlyUsd), [9, 24, 49]);
  assert.deepEqual(PLAN_IDS.map((p) => entitlementsOf(p).fileTokensPerMonth), [150_000, 500_000, 1_500_000]);
});

test('creditEngine reads the same numbers (one place to change them)', () => {
  for (const p of PLAN_IDS) {
    assert.equal(PLANS[p].workspaceLimit, entitlementsOf(p).workspaces);
    assert.equal(PLANS[p].priceMonthlyUsd, entitlementsOf(p).priceMonthlyUsd);
    assert.equal(PLANS[p].customSpecs, entitlementsOf(p).customSpecs);
    assert.equal(PLANS[p].coachDailyLimit, entitlementsOf(p).coachPerDay);
    assert.equal(FILE_QUOTA_TOKENS[p], entitlementsOf(p).fileTokensPerMonth);
  }
});

test('feature checks and the «from plan X» helper', () => {
  assert.equal(can('starter', 'semanticContradiction'), false);
  assert.equal(can('pro', 'semanticContradiction'), true);
  assert.equal(can('starter', 'mcp'), false);
  assert.equal(cheapestPlanWith('mcp'), 'pro');
  assert.equal(cheapestPlanWith('customSpecs'), 'pro');
  assert.equal(cheapestPlanWith('byok'), 'starter');
});

test('a changed config value changes every reader (no second copy of any number)', () => {
  const before = C.plans.starter.maxObjects;
  C.plans.starter.maxObjects = 7;
  try {
    assert.equal(objectsRemaining('starter', 5), 2);
    assert.equal(meters('starter', { objects: 7, fileTokens: 0, judgmentsToday: 0, coachToday: 0 })[0].exceeded, true);
  } finally { C.plans.starter.maxObjects = before; }
});

test('usage meters: ratio, near-limit and exceeded', () => {
  const m = meters('pro', { objects: 1_700, fileTokens: 500_000, judgmentsToday: 10, coachToday: 15 });
  assert.deepEqual(m.map((x) => x.key), ['objects', 'fileTokens', 'judgments', 'coach']);
  assert.equal(m[0].nearLimit, true);
  assert.equal(m[0].exceeded, false);
  assert.equal(m[1].exceeded, true);
  assert.equal(m[2].nearLimit, false);
  assert.equal(m[3].exceeded, true);
});

const e = (mode: string, cost: number, byok?: boolean) => ({ mode: mode as never, estimatedAiCostUsd: cost, byok });

test('manager ledger: only OUR cost counts (BYOK is the user\'s), grouped by what it paid for, warn above 20% of the plan price', () => {
  const ok = costReport('pro', [e('gap_judge', 1), e('coach', 0.5), e('file_processing', 0.5), e('auto', 99, true)]);
  assert.equal(ok.ourCostUsd, 2);
  assert.equal(ok.byokCostUsd, 99);
  assert.equal(ok.priceUsd, 24);
  assert.equal(ok.warn, false);
  assert.deepEqual(ok.lines.map((l) => l.category), ['judgments', 'coach', 'fileProcessing']);
  const bad = costReport('starter', [e('coach', 1.9)]); // 1.9 / 9 = 21%
  assert.equal(bad.warn, true);
  assert.equal(costReport('starter', [e('coach', 1.8)]).warn, false, '20% exactly is not above the threshold');
  assert.equal(isOurCost({ byok: undefined }), true);
  assert.equal(categoryOf('chat_deep'), 'generation');
  assert.equal(ENTITLEMENTS_CONFIG.costWarnRatio, 0.2);
});

test('heavy-use simulation: every cap used every day stays under the 20% line on all plans (cheap-tier prices)', () => {
  const a = {
    days: 30,
    judgmentCall: { inputTokens: 2_500, outputTokens: 400, judgmentsPerCall: 5 },
    coachCall: { inputTokens: 3_000, outputTokens: 900 },
    fileExtract: { avgFileTokens: 20_000, windowTokens: 30_000, outputTokens: 1_200 },
  };
  const cheap = { inputPerM: 0.1, outputPerM: 0.4 };
  const balanced = { inputPerM: 0.3, outputPerM: 2.5 };
  for (const p of PLAN_IDS) {
    const r = heavyUseCost(p, a, cheap, balanced);
    assert.ok(r.totalUsd > 0);
    assert.equal(r.totalUsd, r.judgmentsCostUsd + r.coachCostUsd + r.filesCostUsd);
    assert.equal(r.warn, r.ratio > 0.2);
  }
  const costly = heavyUseCost('starter', a, { inputPerM: 5, outputPerM: 20 }, { inputPerM: 5, outputPerM: 20 });
  assert.equal(costly.warn, true, 'expensive models would break the margin — the warning fires');
});
