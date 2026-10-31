import test from 'node:test';
import assert from 'node:assert/strict';
import { baseFor, route, sanitizePlan, maxTokensFor, CONFIDENCE_THRESHOLD, BANDS } from './router.ts';
import type { DecisionLayer, DecisionResult } from './decision.ts';
import { loadModelsConfig } from './config.ts';

const cfg = loadModelsConfig();
const layer = (taskKind: string, difficulty: string, importance: string, p = 0.95): DecisionLayer & { calls: number } => ({
  calls: 0,
  async decide(): Promise<DecisionResult> {
    (this as { calls: number }).calls++;
    return { answers: [
      { id: 'taskKind', choice: taskKind, probability: p },
      { id: 'difficulty', choice: difficulty, probability: p },
      { id: 'importance', choice: importance, probability: p },
    ] };
  },
});
const input = (o: object = {}) => ({ userMode: 'auto' as const, jobKind: 'deliverable' as const, contextTokens: 1000, text: 'x', ...o });

test('base table: explicit modes are final and skip the decision layer', async () => {
  const dl = layer('chat', 'easy', 'low');
  const fast = await route(input({ userMode: 'fast' }), { decisions: dl, cfg });
  assert.deepEqual([fast.plan.pattern, fast.plan.tier, fast.plan.confidence], ['single', 'cheap', 1]);
  const deep = await route(input({ userMode: 'deep' }), { decisions: dl, cfg });
  assert.deepEqual([deep.plan.pattern, deep.plan.tier], ['critique', 'balanced']);
  const sens = await route(input({ userMode: 'sensitive' }), { decisions: dl, cfg });
  assert.deepEqual([sens.plan.pattern, sens.plan.tier, sens.plan.effort], ['critique', 'frontier', 'high']);
  assert.equal(dl.calls, 0);
  const chatDeep = await route(input({ userMode: 'deep', jobKind: 'chat' }), { decisions: dl, cfg });
  assert.equal(chatDeep.plan.pattern, 'single');
});

test('auto: easy chat stays cheap; hard chat goes balanced', async () => {
  const easy = await route(input({ jobKind: 'chat' }), { decisions: layer('chat', 'easy', 'low'), cfg });
  assert.deepEqual([easy.plan.tier, easy.plan.effort, easy.plan.upgraded], ['cheap', 'minimal', false]);
  const hard = await route(input({ jobKind: 'chat' }), { decisions: layer('strategy', 'hard', 'medium'), cfg });
  assert.deepEqual([hard.plan.tier, hard.plan.effort], ['balanced', 'high']);
});

test('auto: deliverable medium = cascade on balanced', async () => {
  const r = await route(input(), { decisions: layer('drafting', 'medium', 'medium'), cfg });
  assert.deepEqual([r.plan.pattern, r.plan.tier, r.plan.effort], ['cascade', 'balanced', 'medium']);
});

test('upgrade rule: confidence below threshold moves one tier up', async () => {
  const r = await route(input(), { decisions: layer('drafting', 'medium', 'low', CONFIDENCE_THRESHOLD - 0.05), cfg });
  assert.equal(r.plan.tier, 'frontier');
  assert.equal(r.plan.upgraded, true);
  assert.match(r.plan.reason, /یک سطح بالاتر/);
  const exact = await route(input(), { decisions: layer('drafting', 'medium', 'low', CONFIDENCE_THRESHOLD), cfg });
  assert.equal(exact.plan.tier, 'balanced', 'exactly 0.7 is NOT an upgrade');
});

test('upgrade rule: high importance moves one tier up, and a single deliverable gets validation', async () => {
  const r = await route(input(), { decisions: layer('drafting', 'easy', 'high'), cfg });
  assert.equal(r.plan.tier, 'frontier');
  assert.equal(r.plan.pattern, 'cascade');
  const chat = await route(input({ jobKind: 'chat' }), { decisions: layer('chat', 'easy', 'high'), cfg });
  assert.equal(chat.plan.tier, 'balanced');
  assert.equal(chat.plan.pattern, 'single');
});

test('upgrade rule: only one level, never above frontier', async () => {
  const r = await route(input(), { decisions: layer('strategy', 'hard', 'high', 0.2), cfg });
  assert.equal(r.plan.tier, 'frontier');
  assert.equal(r.plan.upgraded, true);
  const sens = await route(input({ userMode: 'sensitive' }), { decisions: layer('strategy', 'hard', 'high', 0.1), cfg });
  assert.equal(sens.plan.tier, 'frontier');
  assert.equal(sens.plan.upgraded, false);
});

test('very expensive tiers are explicit-only: auto never reaches them', async () => {
  const guarded = structuredClone(cfg);
  guarded.tiers.frontier.requiresExplicitSelection = true;
  const auto = await route(input(), { decisions: layer('strategy', 'hard', 'high', 0.2), cfg: guarded });
  assert.equal(auto.plan.tier, 'balanced');
  assert.equal(auto.plan.upgraded, false);
  const explicit = await route(input({ userMode: 'sensitive' }), { decisions: layer('x', 'easy', 'low'), cfg: guarded });
  assert.equal(explicit.plan.tier, 'frontier');
});

test('long context lifts an "easy" job to medium', async () => {
  const r = await route(input({ contextTokens: 20000 }), { decisions: layer('drafting', 'easy', 'low'), cfg });
  assert.equal(r.plan.pattern, 'cascade');
});

test('maxTokens reserves thinking budget on top of the visible band and respects the model cap', () => {
  const lowEffort = maxTokensFor(BANDS.deliverable, 'balanced', 'low', cfg);
  const high = maxTokensFor(BANDS.deliverable, 'balanced', 'high', cfg);
  assert.equal(lowEffort, Math.ceil(1000 * 2.5) + 1024);
  assert.ok(high > lowEffort);
  assert.ok(maxTokensFor({ minWords: 1, maxWords: 100000 }, 'cheap', 'max', cfg) <= cfg.tiers.cheap.maxOutputTokens);
});

test('sanitizePlan re-derives maxTokens/band and rejects garbage', () => {
  const p = sanitizePlan({ pattern: 'cascade', tier: 'balanced', effort: 'medium', userMode: 'auto', jobKind: 'deliverable', maxTokens: 9e9, outputBand: { minWords: 1, maxWords: 1e9 }, confidence: 7, reason: 'r' }, cfg)!;
  assert.ok(p.maxTokens < 20000);
  assert.deepEqual(p.outputBand, BANDS.deliverable);
  assert.equal(p.confidence, 1);
  assert.equal(sanitizePlan({ tier: 'godlike' }, cfg), null);
  assert.equal(sanitizePlan(null, cfg), null);
});

test('baseFor is total over the table', () => {
  for (const jobKind of ['chat', 'asset', 'deliverable'] as const)
    for (const mode of ['auto', 'fast', 'deep', 'sensitive'] as const)
      for (const d of ['easy', 'medium', 'hard'] as const)
        for (const t of ['chat', 'extraction', 'drafting', 'strategy', 'analysis'] as const)
          assert.ok(baseFor(jobKind, mode, d, t).tier);
});
