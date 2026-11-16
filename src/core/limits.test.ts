import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS, chatCountToday, checkChatFairUse, fileQuotaCheck, meters, objectLimitMessage, objectsRemaining, workspaceLimitMessage } from './limits';

test('usage meters: ratio, near-limit and exceeded, read from LIMITS', () => {
  const m = meters({ objects: LIMITS.maxObjects - 1, fileTokens: LIMITS.fileTokensPerMonth, judgmentsToday: 10, coachToday: LIMITS.coachPerDay });
  assert.deepEqual(m.map((x) => x.key), ['objects', 'fileTokens', 'judgments', 'coach']);
  assert.deepEqual(m.map((x) => x.limit), [LIMITS.maxObjects, LIMITS.fileTokensPerMonth, LIMITS.decisionJudgmentsPerDay, LIMITS.coachPerDay]);
  assert.equal(m[0].nearLimit, true);
  assert.equal(m[0].exceeded, false);
  assert.equal(m[1].exceeded, true);
  assert.equal(m[2].nearLimit, false);
  assert.equal(m[3].exceeded, true);
  assert.equal(objectsRemaining(LIMITS.maxObjects - 2), 2);
  assert.equal(objectsRemaining(LIMITS.maxObjects + 5), 0);
});

test('file quota: within, straddling and over (over means refused, never a charge)', () => {
  const q = LIMITS.fileTokensPerMonth;
  const within = fileQuotaCheck(q - 50_000, 50_000);
  assert.deepEqual([within.withinQuota, within.excessTokens], [true, 0]);
  const straddle = fileQuotaCheck(q - 10_000, 30_000);
  assert.deepEqual([straddle.withinQuota, straddle.excessTokens], [false, 20_000]);
  const full = fileQuotaCheck(q, 100_000);
  assert.deepEqual([full.remainingBefore, full.excessTokens], [0, 100_000]);
  assert.equal('credits' in full, false);
});

test('chat fair-use is soft only: it degrades, it never blocks; the count resets each day', () => {
  const under = checkChatFairUse(LIMITS.chatPerDay - 30);
  assert.equal(under.isSoftExceeded, false);
  assert.equal(under.remaining, 30);
  assert.equal(checkChatFairUse(LIMITS.chatPerDay).isSoftExceeded, true);
  assert.equal('allowed' in checkChatFairUse(5000), false);
  assert.equal(chatCountToday(60, '2026-11-01', '2026-11-01'), 60);
  assert.equal(chatCountToday(60, '2026-10-31', '2026-11-01'), 0);
  assert.equal(chatCountToday(14, undefined, '2026-11-01'), 0);
});

test('a cap message names the cap and a way out that is the person\'s own, never a plan or a purchase', () => {
  for (const m of [workspaceLimitMessage(), objectLimitMessage()]) {
    assert.match(m, /بایگانی/);
    for (const w of ['پلن', 'ارتقا', 'اشتراک', 'اعتبار', 'خرید']) assert.ok(!m.includes(w), `«${w}» in «${m}»`);
  }
});

/** Goal of the removal: no subscription, plan, price or credit concept survives in code a person can reach. */
test('no plan, price or credit concept is left in the product code (subscription model removed 2026-11-16)', () => {
  const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : []);
  const files = ['src', 'server'].flatMap(walk);
  const banned = [/\bplanId\b/, /\bPlanId\b/, /creditsRemaining/, /\bcreditCost\b/, /entitlements/, /creditEngine/, /priceMonthlyUsd/, /PlanSelectionModal/, /'پلن /, /«پلن/, /پلن و ارتقا/, /ارتقا بده/, /پلن Pro/];
  const bad: string[] = [];
  for (const f of files) {
    if (f.endsWith('limits.test.ts')) continue;
    // the one place that names the old fields, to drop them on save
    const src = readFileSync(f, 'utf8').replace(/const REMOVED_PLAN_FIELDS = \[[^\]]*\];/, '');
    for (const b of banned) if (b.test(src)) bad.push(`${f}: ${b}`);
  }
  assert.deepEqual(bad, []);
});
