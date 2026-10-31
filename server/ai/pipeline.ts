import type { AiPlan, ContentBlock, CritiqueFeedback, StageUsage, Tier } from '../../src/types/ai.ts';
import { modelsConfig, nextTier } from './config.ts';
import type { ModelsConfig } from './config.ts';
import { blocksToMarkdown, parseBlocks } from './blocks.ts';
import { AiError } from './errors.ts';
import { BLOCKS_INSTRUCTION, CRITIQUE_INSTRUCTION, VALIDATOR_INSTRUCTION } from './prompts.ts';
import type { Prompt } from './providers/provider.ts';
import { BLOCKS_SCHEMA, CRITIQUE_SCHEMA, VALIDATION_SCHEMA } from './schemas.ts';
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

/** The model proposes a verdict; the rule is ours: no failed criterion, no guardrail violation, score ≥ threshold. */
export function normalizeVerdict(raw: unknown): ValidationVerdict {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.passed !== 'boolean') throw new AiError('bad_output', { stage: 'validate', detail: 'verdict shape' });
  const score = Math.min(100, Math.max(0, Number(r.score) || 0));
  const failedCriteria = strArr(r.failedCriteria);
  const guardrailViolations = strArr(r.guardrailViolations);
  return {
    passed: r.passed && failedCriteria.length === 0 && guardrailViolations.length === 0 && score >= VALIDATION_PASS_SCORE,
    score,
    passedCriteria: strArr(r.passedCriteria),
    failedCriteria,
    guardrailViolations,
    strengths: strArr(r.strengths).slice(0, 3),
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

export interface PipelineInput {
  runner: StageRunner;
  plan: AiPlan;
  /** prompt with the stable prefix already built; `task` text is appended per stage */
  prompt: Prompt;
  acceptanceCriteria: string[];
  /** confirmed Constraint objects, rendered as one-line rules */
  guardrails: string[];
  cfg?: ModelsConfig;
  onStage?: (stage: StageUsage['stage'], tier: Tier) => void;
}

export interface PipelineOutput {
  blocks: ContentBlock[];
  markdown: string;
  stages: StageUsage[];
  verdict?: ValidationVerdict;
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

async function validate(input: PipelineInput, blocks: ContentBlock[], stages: StageUsage[]): Promise<ValidationVerdict> {
  input.onStage?.('validate', 'cheap');
  const cfg = input.cfg ?? modelsConfig;
  const user = [
    '## خروجی برای بازبینی',
    blocksToMarkdown(blocks),
    `## ${criteriaBlock(input.acceptanceCriteria)}`,
    input.guardrails.length ? `## گاردریل‌ها (نباید نقض شوند)\n${input.guardrails.map((g) => `- ${g}`).join('\n')}` : '## گاردریل‌ها\nنیست.',
  ].join('\n\n');
  const r = await input.runner.structured(
    { stage: 'validate', tier: 'cheap', effort: 'low', maxTokens: 1500, timeoutMs: cfg.timeoutsMs.validator },
    { system: VALIDATOR_INSTRUCTION, user },
    VALIDATION_SCHEMA,
  );
  stages.push(r.usage);
  return normalizeVerdict(r.value);
}

const feedbackFrom = (v: ValidationVerdict, improvements: string[]): CritiqueFeedback => ({
  score: Math.round(v.score),
  strengths: v.strengths,
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
    let verdict = await validate(input, blocks, stages);
    let finalTier = plan.tier;
    let improvements: string[] = [];
    if (!verdict.passed) {
      const up = nextTier(plan.tier);
      if (canEscalateTo(up, plan, cfg)) {
        improvements = [...verdict.failedCriteria, ...verdict.guardrailViolations];
        const feedback = `\n\nپیش‌نویس قبلی رد شد. موارد رد‌شده:\n${improvements.map((x) => `- ${x}`).join('\n') || '- امتیاز کافی نبود'}\nپیش‌نویس قبلی:\n${blocksToMarkdown(blocks)}\n\nنسخهٔ کامل و اصلاح‌شده را بنویس.`;
        blocks = await draft(input, up, 'upgrade', feedback, stages);
        finalTier = up;
        verdict = await validate(input, blocks, stages);
      }
    }
    return { blocks, markdown: blocksToMarkdown(blocks), stages, verdict, critiqueFeedback: feedbackFrom(verdict, improvements), validationFailed: !verdict.passed, finalTier };
  }

  // critique: draft → critique → revise → validate
  let blocks = await draft(input, plan.tier, 'draft', '', stages);
  input.onStage?.('critique', plan.tier);
  const cr = await input.runner.structured(
    { stage: 'critique', tier: plan.tier, effort: 'low', maxTokens: 2000, timeoutMs: cfg.timeoutsMs.validator },
    { system: CRITIQUE_INSTRUCTION, user: `## پیش‌نویس\n${blocksToMarkdown(blocks)}\n\n## ${criteriaBlock(input.acceptanceCriteria)}\n\n## دانش تأییدشده\n${input.prompt.prefix ?? ''}` },
    CRITIQUE_SCHEMA,
  );
  stages.push(cr.usage);
  const issues = strArr((cr.value as { issues?: unknown })?.issues);
  blocks = await draft(input, plan.tier, 'revise', `\n\nپیش‌نویس:\n${blocksToMarkdown(blocks)}\n\nاصلاح‌های لازم:\n${issues.map((x) => `- ${x}`).join('\n') || '- نیازی به اصلاح بزرگ نیست؛ پیش‌نویس را صیقل بده.'}\n\nنسخهٔ نهایی را کامل بنویس.`, stages);
  const verdict = await validate(input, blocks, stages);
  return { blocks, markdown: blocksToMarkdown(blocks), stages, verdict, critiqueFeedback: feedbackFrom(verdict, issues), validationFailed: !verdict.passed, finalTier: plan.tier };
}
