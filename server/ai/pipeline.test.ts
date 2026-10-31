import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline, normalizeVerdict, VALIDATION_PASS_SCORE } from './pipeline.ts';
import { StageRunner } from './runner.ts';
import { loadModelsConfig } from './config.ts';
import { buildPrompt } from './context.ts';
import { MockProvider, block, verdict } from './testing/mockProvider.ts';
import type { AiPlan } from '../../src/types/ai.ts';
import type { AiSession } from './session.ts';
import { BANDS, maxTokensFor } from './router.ts';

const cfg = loadModelsConfig();
const plan = (o: Partial<AiPlan> = {}): AiPlan => ({
  pattern: 'cascade', tier: 'balanced', effort: 'medium', outputBand: BANDS.deliverable, maxTokens: maxTokensFor(BANDS.deliverable, 'balanced', 'medium', cfg),
  confidence: 1, reason: '', upgraded: false, userMode: 'auto', jobKind: 'deliverable', decisions: [], ...o,
});
const session = (p: MockProvider): AiSession => ({
  source: 'managed', providerFor: () => p, modelFor: (t) => `model-${t}`,
  verification: { resolved: { cheap: 'model-cheap', balanced: 'model-balanced', frontier: 'model-frontier' }, verified: { cheap: true, balanced: true, frontier: true }, warnings: [], listed: true },
});
const prompt = buildPrompt({ contexts: [], task: 'نوشتن' });
const run = (p: MockProvider, pl: AiPlan, extra: object = {}) =>
  runPipeline({ runner: new StageRunner(session(p), undefined, cfg), plan: pl, prompt, acceptanceCriteria: ['معیار ۱'], guardrails: ['تخفیف نده'], cfg, ...extra });

const isBlocks = (s: unknown) => (s as { properties?: object })?.properties && 'blocks' in (s as { properties: object }).properties;

test('single: one structured call, no validator, no fabricated feedback', async () => {
  const p = new MockProvider(() => ({ blocks: [block('b1', 'متن')] }));
  const out = await run(p, plan({ pattern: 'single' }));
  assert.equal(p.calls.length, 1);
  assert.equal(out.critiqueFeedback, undefined);
  assert.deepEqual(out.stages.map((s) => s.stage), ['draft']);
});

test('cascade: validator passes → no upgrade', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'پیش‌نویس')] } : verdict()));
  const out = await run(p, plan());
  assert.deepEqual(out.stages.map((s) => `${s.stage}:${s.tier}`), ['draft:balanced', 'validate:cheap']);
  assert.equal(out.validationFailed, false);
  assert.equal(out.critiqueFeedback?.score, 90);
  assert.equal(out.finalTier, 'balanced');
});

test('cascade: validator rejects → exactly one upgrade to the next tier, then re-validated', async () => {
  let drafts = 0;
  const p = new MockProvider((c) => {
    if (isBlocks(c.schema)) { drafts++; return { blocks: [block('b1', drafts === 1 ? 'ضعیف' : 'قوی')] }; }
    return drafts === 1 ? verdict({ passed: false, score: 40, failed: ['معیار ۱'] }) : verdict({ score: 88 });
  });
  const out = await run(p, plan());
  assert.deepEqual(out.stages.map((s) => `${s.stage}:${s.tier}`), ['draft:balanced', 'validate:cheap', 'upgrade:frontier', 'validate:cheap']);
  assert.equal(out.finalTier, 'frontier');
  assert.equal(out.markdown, 'قوی');
  assert.equal(out.validationFailed, false);
  assert.deepEqual(out.critiqueFeedback?.improvementsMade, ['معیار ۱']);
  // the upgrade prompt carries the failed criteria and the rejected draft
  const upgradeCall = p.calls[2];
  assert.match(upgradeCall.prompt.user, /رد شد/);
  assert.match(upgradeCall.prompt.user, /ضعیف/);
  assert.equal(upgradeCall.spec.modelId, 'model-frontier');
});

test('cascade: never upgrades twice; a second rejection is reported honestly', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ passed: false, score: 30, failed: ['معیار ۱'] })));
  const out = await run(p, plan());
  assert.equal(p.calls.length, 4);
  assert.equal(out.validationFailed, true);
});

test('cascade: at frontier there is nothing above → no upgrade, flagged failed', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ passed: false, failed: ['معیار ۱'] })));
  const out = await run(p, plan({ tier: 'frontier' }));
  assert.equal(p.calls.length, 2);
  assert.equal(out.validationFailed, true);
});

test('cascade: auto never escalates into an explicit-only tier', async () => {
  const guarded = structuredClone(cfg);
  guarded.tiers.frontier.requiresExplicitSelection = true;
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ passed: false, failed: ['معیار ۱'] })));
  const out = await runPipeline({ runner: new StageRunner(session(p), undefined, guarded), plan: plan(), prompt, acceptanceCriteria: ['معیار ۱'], guardrails: [], cfg: guarded });
  assert.equal(p.calls.length, 2);
  assert.equal(out.finalTier, 'balanced');
});

test('critique: draft → critique → revise → validate; critique issues are fed into the revision', async () => {
  const p = new MockProvider((c) => {
    if (isBlocks(c.schema)) return { blocks: [block('b1', c.prompt.user.includes('اصلاح‌های لازم') ? 'نسخهٔ اصلاح‌شده' : 'پیش‌نویس')] };
    if ((c.schema as { required?: string[] })?.required?.includes('issues')) return { issues: ['لحن کلیشه‌ای است'], strengths: ['ساختار خوب'] };
    return verdict({ score: 95 });
  });
  const out = await run(p, plan({ pattern: 'critique' }));
  assert.deepEqual(out.stages.map((s) => s.stage), ['draft', 'critique', 'revise', 'validate']);
  assert.equal(out.markdown, 'نسخهٔ اصلاح‌شده');
  assert.deepEqual(out.critiqueFeedback?.improvementsMade, ['لحن کلیشه‌ای است']);
});

test('guardrail violation fails validation even with a high score', () => {
  const v = normalizeVerdict({ passed: true, score: 99, passedCriteria: [], failedCriteria: [], guardrailViolations: ['تخفیف داده شد'], strengths: [] });
  assert.equal(v.passed, false);
  assert.equal(normalizeVerdict({ passed: true, score: VALIDATION_PASS_SCORE - 1, passedCriteria: [], failedCriteria: [], guardrailViolations: [], strengths: [] }).passed, false);
  assert.equal(normalizeVerdict({ passed: true, score: VALIDATION_PASS_SCORE, passedCriteria: [], failedCriteria: [], guardrailViolations: [], strengths: [] }).passed, true);
  assert.throws(() => normalizeVerdict({ score: 3 }), (e: { kind?: string }) => e.kind === 'bad_output');
});

test('every stage is recorded with tier/model/effort for the ledger', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict()));
  const out = await run(p, plan());
  const d = out.stages[0];
  assert.deepEqual([d.provider, d.modelId, d.effort, d.tier], ['gemini', 'model-balanced', 'medium', 'balanced']);
  assert.ok(d.costUsd > 0);
});
