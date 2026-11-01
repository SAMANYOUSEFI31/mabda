import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline, pickCriticTier, CHECK_PASS_PROBABILITY } from './pipeline.ts';
import { ModelDecisionLayer } from './decision.ts';
import { StageRunner } from './runner.ts';
import { loadModelsConfig } from './config.ts';
import { buildPrompt } from './context.ts';
import { MockProvider, answerChecks, block } from './testing/mockProvider.ts';
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
const run = (p: MockProvider, pl: AiPlan, extra: object = {}) => {
  const runner = new StageRunner(session(p), undefined, cfg);
  return runPipeline({ runner, plan: pl, prompt, acceptanceCriteria: ['معیار ۱'], guardrails: ['تخفیف نده'], cfg, decisions: new ModelDecisionLayer(runner), ...extra });
};

const verdict = (o: { failed?: string[]; guard?: string[]; prob?: number } = {}) => (c: { schema?: unknown }) => answerChecks(c, [...(o.failed ?? []), ...(o.guard ?? [])], o.prob ?? 0.9);
const isChecks = (s: unknown) => JSON.stringify(s ?? '').includes('probability');

const isBlocks = (s: unknown) => (s as { properties?: object })?.properties && 'blocks' in (s as { properties: object }).properties;

test('single: one structured call, no validator, no fabricated feedback', async () => {
  const p = new MockProvider(() => ({ blocks: [block('b1', 'متن')] }));
  const out = await run(p, plan({ pattern: 'single' }));
  assert.equal(p.calls.length, 1);
  assert.equal(out.critiqueFeedback, undefined);
  assert.deepEqual(out.stages.map((s) => s.stage), ['draft']);
});

test('cascade: validator passes → no upgrade', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'پیش‌نویس')] } : verdict()(c)));
  const out = await run(p, plan());
  assert.deepEqual(out.stages.map((s) => `${s.stage}:${s.tier}`), ['draft:balanced', 'validate:cheap']);
  assert.equal(out.validationFailed, false);
  assert.equal(out.critiqueFeedback?.score, 100);
  assert.equal(out.finalTier, 'balanced');
  assert.deepEqual(out.checks?.map((k) => [k.kind, k.text, k.passed]), [['criterion', 'معیار ۱', true], ['guardrail', 'تخفیف نده', true]], 'one pass/fail per criterion and per guardrail, each with a reason');
  assert.ok(out.checks?.every((k) => k.reason));
  assert.equal(out.stages[1].stage, 'validate', 'the decision call is booked as the validate stage');
});

test('cascade: validator rejects → exactly one upgrade to the next tier, then re-validated', async () => {
  let drafts = 0;
  const p = new MockProvider((c) => {
    if (isBlocks(c.schema)) { drafts++; return { blocks: [block('b1', drafts === 1 ? 'ضعیف' : 'قوی')] }; }
    return drafts === 1 ? verdict({ failed: ['c0'], guard: ['g0'] })(c) : verdict()(c);
  });
  const out = await run(p, plan());
  assert.deepEqual(out.stages.map((s) => `${s.stage}:${s.tier}`), ['draft:balanced', 'validate:cheap', 'upgrade:frontier', 'validate:cheap']);
  assert.equal(out.finalTier, 'frontier');
  assert.equal(out.markdown, 'قوی');
  assert.equal(out.validationFailed, false);
  assert.deepEqual(out.critiqueFeedback?.improvementsMade, ['معیار ۱', 'تخفیف نده']);
  // the upgrade prompt carries the failed criteria and the rejected draft
  const upgradeCall = p.calls[2];
  assert.match(upgradeCall.prompt.user, /رد شد/);
  assert.match(upgradeCall.prompt.user, /ضعیف/);
  assert.equal(upgradeCall.spec.modelId, 'model-frontier');
});

test('cascade: never upgrades twice; a second rejection is reported honestly', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ failed: ['c0'] })(c)));
  const out = await run(p, plan());
  assert.equal(p.calls.length, 4);
  assert.equal(out.validationFailed, true);
});

test('cascade: at frontier there is nothing above → no upgrade, flagged failed', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ failed: ['c0'] })(c)));
  const out = await run(p, plan({ tier: 'frontier' }));
  assert.equal(p.calls.length, 2);
  assert.equal(out.validationFailed, true);
});

test('cascade: auto never escalates into an explicit-only tier', async () => {
  const guarded = structuredClone(cfg);
  guarded.tiers.frontier.requiresExplicitSelection = true;
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ failed: ['c0'] })(c)));
  const runner = new StageRunner(session(p), undefined, guarded);
  const out = await runPipeline({ runner, plan: plan(), prompt, acceptanceCriteria: ['معیار ۱'], guardrails: [], cfg: guarded, decisions: new ModelDecisionLayer(runner) });
  assert.equal(p.calls.length, 2);
  assert.equal(out.finalTier, 'balanced');
});

test('critique: draft(balanced) → read-only critic on ANOTHER tier → one revision → validator; the critic sees spec + Context', async () => {
  const withCtx = buildPrompt({ contexts: [{ id: 'k', type: 'Fact', status: 'Confirmed', title: 'مخاطب', content: 'فریلنسرها', nodeId: 'business' }], task: 'نوشتن' });
  const p = new MockProvider((c) => {
    if (isBlocks(c.schema)) return { blocks: [block('b1', c.prompt.user.includes('اصلاح‌های لازم') ? 'نسخهٔ اصلاح‌شده' : 'پیش‌نویس')] };
    if ((c.schema as { required?: string[] })?.required?.includes('issues')) return { issues: ['لحن کلیشه‌ای است'], strengths: ['ساختار خوب'] };
    return verdict()(c);
  });
  const out = await run(p, plan({ pattern: 'critique', tier: 'cheap' }), { prompt: withCtx, specTarget: 'ساخت کتابچهٔ برند' });
  assert.deepEqual(out.stages.map((s) => `${s.stage}:${s.tier}`), ['draft:balanced', 'critique:frontier', 'revise:balanced', 'validate:cheap']);
  assert.equal(out.markdown, 'نسخهٔ اصلاح‌شده');
  assert.deepEqual(out.critiqueFeedback?.improvementsMade, ['لحن کلیشه‌ای است']);
  assert.deepEqual(out.critiqueFeedback?.strengths, ['ساختار خوب']);
  const critic = p.calls.find((c) => (c.schema as { required?: string[] })?.required?.includes('issues'))!;
  assert.match(critic.prompt.user, /ساخت کتابچهٔ برند/);
  assert.match(critic.prompt.user, /معیار ۱/);
  assert.match(critic.prompt.user, /تخفیف نده/);
  assert.match(critic.prompt.user, /فریلنسرها/);
  assert.match(critic.prompt.system, /فقط‌خواندنی/);
  assert.equal(p.calls.filter((c) => isBlocks(c.schema)).length, 2, 'exactly one revision');
});

test('critic prefers a tier on another provider when config has one', () => {
  const multi = structuredClone(cfg);
  multi.tiers.frontier.provider = 'anthropic' as never;
  assert.equal(pickCriticTier('balanced', plan(), multi), 'frontier');
  multi.tiers.frontier.provider = 'gemini';
  multi.tiers.cheap.provider = 'other' as never;
  assert.equal(pickCriticTier('balanced', plan(), multi), 'cheap', 'the only other-provider tier is used');
  assert.equal(pickCriticTier('balanced', plan(), cfg), 'frontier', 'same provider only → another tier');
  assert.equal(pickCriticTier('frontier', plan(), cfg), 'balanced');
  const guarded = structuredClone(cfg);
  guarded.tiers.frontier.requiresExplicitSelection = true;
  assert.equal(pickCriticTier('balanced', plan(), guarded), 'cheap', 'Auto never picks an explicit-only tier');
  assert.equal(pickCriticTier('balanced', plan({ userMode: 'sensitive' }), guarded), 'frontier');
});

test('validator: a guardrail violation fails the output; an unsure pass is reported as failed with its reason', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ guard: ['g0'] })(c)));
  const out = await run(p, plan({ tier: 'frontier' }));
  assert.equal(out.validationFailed, true);
  assert.deepEqual(out.verdict?.guardrailViolations, ['تخفیف نده']);
  assert.equal(out.checks?.find((k) => k.kind === 'guardrail')?.reason, 'دلیل رد g0');
  assert.equal(out.checks?.find((k) => k.kind === 'criterion')?.passed, true);

  const unsure = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict({ prob: CHECK_PASS_PROBABILITY - 0.1 })(c)));
  const out2 = await run(unsure, plan({ tier: 'frontier' }));
  assert.equal(out2.validationFailed, true);
  assert.match(out2.checks![0].reason, /^مطمئن نیستم/);
});

test('validator: with no criteria and no guardrails there is nothing to check (no model call)', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict()(c)));
  const out = await run(p, plan(), { acceptanceCriteria: [], guardrails: [] });
  assert.equal(p.calls.length, 1);
  assert.equal(out.validationFailed, false);
  assert.deepEqual(out.checks, []);
  void isChecks;
});

test('every stage is recorded with tier/model/effort for the ledger', async () => {
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict()(c)));
  const out = await run(p, plan());
  const d = out.stages[0];
  assert.deepEqual([d.provider, d.modelId, d.effort, d.tier], ['gemini', 'model-balanced', 'medium', 'balanced']);
  assert.ok(d.costUsd > 0);
});

test('validator sees the confirmed Context and judges consistency with it; a conflict fails the output; no knowledge → no such question', async () => {
  const withCtx = buildPrompt({ contexts: [{ id: 'k', type: 'Fact', status: 'Confirmed', title: 'قیمت', content: 'اشتراک ماهانه ۹ دلار است', nodeId: 'offer' }, { id: 'p', type: 'Fact', status: 'Proposed', title: 'پیشنهادی', content: 'متن پیشنهادی نباید واقعیت شود', nodeId: 'offer' }], task: 'نوشتن' });
  const p = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'اشتراک ۹۰ دلار است')] } : verdict({ failed: ['k0'] })(c)));
  const out = await run(p, plan({ tier: 'frontier' }), { prompt: withCtx });
  const check = p.calls.find((c) => !isBlocks(c.schema))!;
  assert.match(check.prompt.user, /دانش تأییدشدهٔ کسب‌وکار[\s\S]*اشتراک ماهانه ۹ دلار است/, 'the validator is given the confirmed knowledge');
  assert.ok(!check.prompt.user.includes('متن پیشنهادی نباید واقعیت شود'), 'Proposed knowledge is never given as fact');
  const k = out.checks!.find((x) => x.kind === 'consistency')!;
  assert.deepEqual([k.passed, k.reason], [false, 'دلیل رد k0']);
  assert.equal(out.validationFailed, true);
  assert.ok(out.verdict!.failedCriteria.includes('سازگاری با دانش تأییدشدهٔ کسب‌وکار'));

  const none = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict()(c)));
  const o2 = await run(none, plan({ tier: 'frontier' })); // prompt without any confirmed knowledge
  assert.ok(!o2.checks!.some((x) => x.kind === 'consistency'));
  const good = new MockProvider((c) => (isBlocks(c.schema) ? { blocks: [block('b1', 'x')] } : verdict()(c)));
  const o3 = await run(good, plan({ tier: 'frontier' }), { prompt: withCtx, acceptanceCriteria: [], guardrails: [] });
  assert.deepEqual(o3.checks!.map((x) => x.kind), ['consistency'], 'consistency alone is a valid check set');
  assert.equal(o3.validationFailed, false);
});
