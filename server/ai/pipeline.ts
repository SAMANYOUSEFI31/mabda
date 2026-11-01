import type { AiPlan, CheckResult, ContentBlock, CritiqueFeedback, StageUsage, Tier } from '../../src/types/ai.ts';
import { modelsConfig, nextTier, TIERS } from './config.ts';
import type { ModelsConfig } from './config.ts';
import { blocksToMarkdown, parseBlocks } from './blocks.ts';
import { AiError } from './errors.ts';
import { BLOCKS_INSTRUCTION, CRITIQUE_INSTRUCTION } from './prompts.ts';
import type { DecisionLayer, DecisionQuestion } from './decision.ts';
import type { Prompt } from './providers/provider.ts';
import { BLOCKS_SCHEMA, CRITIQUE_SCHEMA } from './schemas.ts';
import type { StageRunner } from './runner.ts';

export const VALIDATION_PASS_SCORE = 70;

export interface ValidationVerdict {
  passed: boolean;
  score: number;
  passedCriteria: string[];
  failedCriteria: string[];
  guardrailViolations: string[];
  strengths: string[];
  notes?: string;
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []);

/** A check passes only when the decision layer says so AND is at least this sure (otherwise it is reported as failed, honestly). */
export const CHECK_PASS_PROBABILITY = 0.6;

export interface PipelineInput {
  runner: StageRunner;
  plan: AiPlan;
  /** prompt with the stable prefix already built; `task` text is appended per stage */
  prompt: Prompt;
  acceptanceCriteria: string[];
  /** confirmed Constraint objects, rendered as one-line rules */
  guardrails: string[];
  /** judges every criterion and guardrail (cheap tier by default) */
  decisions: DecisionLayer;
  /** goal of the workstream, for the critic */
  specTarget?: string;
  cfg?: ModelsConfig;
  onStage?: (stage: StageUsage['stage'], tier: Tier) => void;
}

export interface PipelineOutput {
  blocks: ContentBlock[];
  markdown: string;
  stages: StageUsage[];
  verdict?: ValidationVerdict;
  checks?: CheckResult[];
  critiqueFeedback?: CritiqueFeedback;
  validationFailed: boolean;
  /** final tier that produced the answer (differs from plan.tier after an upgrade) */
  finalTier: Tier;
}

const withTask = (p: Prompt, extra: string): Prompt => ({ ...p, user: `${p.user}\n\n${extra}` });

const bandLine = (plan: AiPlan) => `طول هدف: ${plan.outputBand.minWords} تا ${plan.outputBand.maxWords} کلمه.`;
const criteriaBlock = (c: string[]) => (c.length ? `معیارهای پذیرش:\n${c.map((x) => `- ${x}`).join('\n')}` : 'معیار پذیرش مشخصی تعریف نشده است.');

async function draft(input: PipelineInput, tier: Tier, stage: 'draft' | 'upgrade' | 'revise', extra: string, stages: StageUsage[]): Promise<ContentBlock[]> {
  input.onStage?.(stage, tier);
  const timeoutMs = (input.cfg ?? modelsConfig).timeoutsMs.deliverable;
  const r = await input.runner.structured(
    { stage, tier, effort: input.plan.effort, maxTokens: input.plan.maxTokens, timeoutMs },
    withTask(input.prompt, `${BLOCKS_INSTRUCTION}\n${bandLine(input.plan)}\n${criteriaBlock(input.acceptanceCriteria)}${extra}`),
    BLOCKS_SCHEMA,
  );
  stages.push(r.usage);
  return parseBlocks(r.value);
}

/**
 * Validator = the decision layer asked one closed question per acceptance criterion and per guardrail
 * (pass/fail + reason + probability). The rule is ours: every check must pass.
 */
export async function runChecks(input: Pick<PipelineInput, 'decisions' | 'acceptanceCriteria' | 'guardrails' | 'onStage'>, blocks: ContentBlock[], stages: StageUsage[]): Promise<{ verdict: ValidationVerdict; checks: CheckResult[] }> {
  const criteria = input.acceptanceCriteria.filter((c) => c.trim());
  const guardrails = input.guardrails.filter((g) => g.trim());
  if (criteria.length + guardrails.length === 0) {
    return { verdict: { passed: true, score: 100, passedCriteria: [], failedCriteria: [], guardrailViolations: [], strengths: [] }, checks: [] };
  }
  input.onStage?.('validate', 'cheap');
  const questions: DecisionQuestion[] = [
    ...criteria.map((c, i): DecisionQuestion => ({ id: `c${i}`, question: `آیا خروجی این معیار پذیرش را برآورده می‌کند؟ «${c}»`, options: ['pass', 'fail'], reason: true })),
    ...guardrails.map((g, i): DecisionQuestion => ({ id: `g${i}`, question: `آیا خروجی این گاردریل را رعایت می‌کند؟ «${g}»`, options: ['ok', 'violated'], reason: true })),
  ];
  const res = await input.decisions.decide({ text: `## خروجی برای بازبینی\n${blocksToMarkdown(blocks)}`, stage: 'validate' }, questions);
  if (res.usage) stages.push(res.usage);
  const checks: CheckResult[] = res.answers.map((a) => {
    const isGuard = a.id.startsWith('g');
    const text = isGuard ? guardrails[Number(a.id.slice(1))] : criteria[Number(a.id.slice(1))];
    const said = isGuard ? a.choice === 'ok' : a.choice === 'pass';
    const sure = a.probability >= CHECK_PASS_PROBABILITY;
    const reason = a.reason || (said ? 'رعایت شده است.' : 'رعایت نشده است.');
    return {
      kind: isGuard ? 'guardrail' : 'criterion', text, passed: said && sure, probability: a.probability,
      reason: said && !sure ? `مطمئن نیستم: ${reason}` : reason,
    };
  });
  const failed = checks.filter((c) => !c.passed);
  const verdict: ValidationVerdict = {
    passed: failed.length === 0,
    score: Math.round((100 * (checks.length - failed.length)) / checks.length),
    passedCriteria: checks.filter((c) => c.kind === 'criterion' && c.passed).map((c) => c.text),
    failedCriteria: failed.filter((c) => c.kind === 'criterion').map((c) => c.text),
    guardrailViolations: failed.filter((c) => c.kind === 'guardrail').map((c) => c.text),
    strengths: [],
  };
  return { verdict, checks };
}

/**
 * The critic must not be the model that wrote the draft: a tier on ANOTHER provider if config has one,
 * otherwise another tier of the same provider. Explicit-only tiers are not picked in Auto.
 */
export function pickCriticTier(draftTier: Tier, plan: AiPlan, cfg: ModelsConfig = modelsConfig): Tier {
  const allowed = TIERS.filter((t) => t !== draftTier && (plan.userMode !== 'auto' || !cfg.tiers[t].requiresExplicitSelection));
  const other = allowed.filter((t) => cfg.tiers[t].provider !== cfg.tiers[draftTier].provider);
  const pool = other.length ? other : allowed;
  const prefer: Tier[] = draftTier === 'frontier' ? ['balanced', 'cheap'] : ['balanced', 'frontier', 'cheap'];
  return prefer.find((t) => pool.includes(t)) ?? pool[0] ?? draftTier;
}

const feedbackFrom = (v: ValidationVerdict, improvements: string[], strengths: string[] = v.strengths): CritiqueFeedback => ({
  score: Math.round(v.score),
  strengths,
  improvementsMade: improvements,
  checklistPassed: v.passedCriteria,
});

/** Can this tier be used for an automatic escalation? (expensive tiers need an explicit choice.) */
function canEscalateTo(tier: Tier | null, plan: AiPlan, cfg: ModelsConfig): tier is Tier {
  if (!tier) return false;
  return plan.userMode !== 'auto' || !cfg.tiers[tier].requiresExplicitSelection;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { plan } = input;
  const cfg = input.cfg ?? modelsConfig;
  const stages: StageUsage[] = [];

  if (plan.pattern === 'single') {
    const blocks = await draft(input, plan.tier, 'draft', '', stages);
    return { blocks, markdown: blocksToMarkdown(blocks), stages, validationFailed: false, finalTier: plan.tier };
  }

  if (plan.pattern === 'cascade') {
    let blocks = await draft(input, plan.tier, 'draft', '', stages);
    let { verdict, checks } = await runChecks(input, blocks, stages);
    let finalTier = plan.tier;
    let improvements: string[] = [];
    if (!verdict.passed) {
      const up = nextTier(plan.tier);
      if (canEscalateTo(up, plan, cfg)) {
        improvements = [...verdict.failedCriteria, ...verdict.guardrailViolations];
        const feedback = `\n\nپیش‌نویس قبلی رد شد. موارد رد‌شده:\n${improvements.map((x) => `- ${x}`).join('\n') || '- امتیاز کافی نبود'}\nپیش‌نویس قبلی:\n${blocksToMarkdown(blocks)}\n\nنسخهٔ کامل و اصلاح‌شده را بنویس.`;
        blocks = await draft(input, up, 'upgrade', feedback, stages);
        finalTier = up;
        ({ verdict, checks } = await runChecks(input, blocks, stages));
      }
    }
    return { blocks, markdown: blocksToMarkdown(blocks), stages, verdict, checks, critiqueFeedback: feedbackFrom(verdict, improvements), validationFailed: !verdict.passed, finalTier };
  }

  // critique: draft (balanced or above) → read-only critic on another provider/tier → ONE revision → validator
  const draftTier: Tier = plan.tier === 'cheap' ? 'balanced' : plan.tier;
  let blocks = await draft(input, draftTier, 'draft', '', stages);
  const criticTier = pickCriticTier(draftTier, plan, cfg);
  input.onStage?.('critique', criticTier);
  const gr = input.guardrails.filter((g) => g.trim());
  const cr = await input.runner.structured(
    { stage: 'critique', tier: criticTier, effort: 'low', maxTokens: 2000, timeoutMs: cfg.timeoutsMs.validator },
    {
      system: CRITIQUE_INSTRUCTION,
      user: [
        input.specTarget ? `## هدف جریان کار\n${input.specTarget}` : '',
        `## ${criteriaBlock(input.acceptanceCriteria)}`,
        gr.length ? `## گاردریل‌ها\n${gr.map((g) => `- ${g}`).join('\n')}` : '',
        `## دانش تأییدشده\n${input.prompt.prefix ?? ''}`,
        `## پیش‌نویس\n${blocksToMarkdown(blocks)}`,
      ].filter(Boolean).join('\n\n'),
    },
    CRITIQUE_SCHEMA,
  );
  stages.push(cr.usage);
  const issues = strArr((cr.value as { issues?: unknown })?.issues);
  const strengths = strArr((cr.value as { strengths?: unknown })?.strengths).slice(0, 3);
  blocks = await draft(input, draftTier, 'revise', `\n\nپیش‌نویس:\n${blocksToMarkdown(blocks)}\n\nاصلاح‌های لازم:\n${issues.map((x) => `- ${x}`).join('\n') || '- نیازی به اصلاح بزرگ نیست؛ پیش‌نویس را صیقل بده.'}\n\nنسخهٔ نهایی را کامل بنویس.`, stages);
  const { verdict, checks } = await runChecks(input, blocks, stages);
  return { blocks, markdown: blocksToMarkdown(blocks), stages, verdict, checks, critiqueFeedback: feedbackFrom(verdict, issues, strengths), validationFailed: !verdict.passed, finalTier: draftTier };
}
