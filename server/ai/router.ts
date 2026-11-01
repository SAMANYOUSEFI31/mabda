import type { AiPlan, Effort, JobKind, OutputBand, Pattern, Tier, UserMode } from '../../src/types/ai.ts';
import { modelsConfig, nextTier, TIERS } from './config.ts';
import type { ModelsConfig } from './config.ts';
import type { DecisionLayer, DecisionQuestion } from './decision.ts';

export interface RouteInput {
  userMode: UserMode;
  jobKind: JobKind;
  /** rough size of the context that will be injected */
  contextTokens: number;
  /** the user's message / the deliverable brief — what the decisions are about */
  text: string;
  /** explicit tier chosen by the user (advanced mode); skips the table and the decision layer */
  explicitTier?: Tier;
}

export const CONFIDENCE_THRESHOLD = 0.7;
/** Context above this size makes the job at least "medium" no matter what the model says (cheap models degrade on long input). */
export const LONG_CONTEXT_TOKENS = 12_000;
/** [فرض] Persian output ≈ 2.5 tokens per word (PRD: Persian costs ~1.5× English). Measured in Alpha. */
export const TOKENS_PER_WORD = 2.5;

export type TaskKind = 'chat' | 'extraction' | 'drafting' | 'strategy' | 'analysis';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Importance = 'low' | 'medium' | 'high';

export const TASK_KINDS: TaskKind[] = ['chat', 'extraction', 'drafting', 'strategy', 'analysis'];
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
export const IMPORTANCES: Importance[] = ['low', 'medium', 'high'];

/** Spec-chosen length (short / medium / long) per job kind, in words. `medium` equals the default band. */
export const BAND_CHOICES: Record<'asset' | 'deliverable', Record<'short' | 'medium' | 'long', OutputBand>> = {
  asset: { short: { minWords: 60, maxWords: 200 }, medium: { minWords: 120, maxWords: 450 }, long: { minWords: 400, maxWords: 900 } },
  deliverable: { short: { minWords: 200, maxWords: 500 }, medium: { minWords: 350, maxWords: 1000 }, long: { minWords: 900, maxWords: 2000 } },
};

/** Default length bands per job (words). */
export const BANDS: Record<JobKind, OutputBand> = {
  chat: { minWords: 40, maxWords: 250 },
  asset: { minWords: 120, maxWords: 450 },
  deliverable: { minWords: 350, maxWords: 1000 },
};

interface Base { pattern: Pattern; tier: Tier; effort: Effort }

/**
 * Deterministic base table. Explicit modes are final (the user chose); `auto` starts from the table
 * cell for the decided difficulty and may then be moved up by the confidence/importance rule.
 */
export function baseFor(jobKind: JobKind, userMode: UserMode, difficulty: Difficulty, taskKind: TaskKind): Base {
  const effortByDifficulty: Record<Difficulty, Effort> = { easy: 'low', medium: 'medium', hard: 'high' };
  if (userMode === 'fast') return { pattern: 'single', tier: 'cheap', effort: 'low' };
  if (userMode === 'deep') {
    return jobKind === 'chat'
      ? { pattern: 'single', tier: 'balanced', effort: difficulty === 'hard' ? 'high' : 'medium' }
      : { pattern: 'critique', tier: 'balanced', effort: difficulty === 'hard' ? 'high' : 'medium' };
  }
  if (userMode === 'sensitive') return { pattern: jobKind === 'chat' ? 'single' : 'critique', tier: 'frontier', effort: 'high' };
  // auto
  if (jobKind === 'chat') {
    const light = taskKind === 'chat' || taskKind === 'extraction';
    if (difficulty === 'easy' || (light && difficulty === 'medium')) return { pattern: 'single', tier: 'cheap', effort: difficulty === 'easy' ? 'minimal' : 'low' };
    return { pattern: 'single', tier: 'balanced', effort: effortByDifficulty[difficulty] };
  }
  if (taskKind === 'extraction' && difficulty === 'easy') return { pattern: 'single', tier: 'cheap', effort: 'low' };
  if (difficulty === 'easy') return { pattern: 'single', tier: 'balanced', effort: 'low' };
  return { pattern: 'cascade', tier: 'balanced', effort: effortByDifficulty[difficulty] };
}

export function decisionQuestions(): DecisionQuestion[] {
  return [
    { id: 'taskKind', question: 'نوع کار کدام است؟ (chat = گفتگوی ساده، extraction = استخراج/دسته‌بندی، drafting = نگارش متن، strategy = تصمیم‌سازی راهبردی، analysis = تحلیل/ممیزی)', options: TASK_KINDS },
    { id: 'difficulty', question: 'سختی کار چقدر است؟ (easy: پاسخ مستقیم، medium: نیاز به ترکیب چند دانش، hard: استدلال چندمرحله‌ای یا ظرافت زبانی زیاد)', options: DIFFICULTIES },
    { id: 'importance', question: 'اهمیت خروجی چقدر است؟ (high: برای مشتری/انتشار/تصمیم مالی؛ low: گفتگوی اکتشافی)', options: IMPORTANCES },
  ];
}

const TIER_FA: Record<Tier, string> = { cheap: 'سبک', balanced: 'متعادل', frontier: 'پیشرو' };
const EFFORT_FA: Record<Effort, string> = { minimal: 'حداقل', low: 'کم', medium: 'متوسط', high: 'زیاد', max: 'بیشینه' };
const PATTERN_FA: Record<Pattern, string> = { single: 'تک‌مرحله‌ای', cascade: 'آبشاری (تولید + اعتبارسنجی)', critique: 'نقد و اصلاح' };
const MODE_FA: Record<UserMode, string> = { auto: 'Auto', fast: 'سریع', deep: 'عمیق', sensitive: 'حساس' };

/** thinking tokens an effort may consume — reserved on top of the visible output so reasoning never starves the answer */
export function maxTokensFor(band: OutputBand, tier: Tier, effort: Effort, cfg: ModelsConfig = modelsConfig): number {
  const tc = cfg.tiers[tier];
  const visible = Math.ceil(band.maxWords * TOKENS_PER_WORD);
  const thinking = tc.thinking.supported ? tc.thinking.budgetTokens[effort] : 0;
  return Math.min(visible + thinking, tc.maxOutputTokens);
}

function clampTier(tier: Tier, explicit: boolean, cfg: ModelsConfig): Tier {
  // very expensive tiers are only reachable by explicit choice
  let t = tier;
  while (!explicit && cfg.tiers[t].requiresExplicitSelection) {
    const i = TIERS.indexOf(t);
    if (i === 0) break;
    t = TIERS[i - 1];
  }
  return t;
}

export interface RouteDeps {
  decisions: DecisionLayer;
  cfg?: ModelsConfig;
}

export async function route(input: RouteInput, deps: RouteDeps): Promise<{ plan: AiPlan; decisionUsage?: import('../../src/types/ai.ts').StageUsage }> {
  const cfg = deps.cfg ?? modelsConfig;
  const band = BANDS[input.jobKind];
  const explicitTier = input.explicitTier;
  const explicit = input.userMode !== 'auto' || Boolean(explicitTier);

  // Explicit modes: final plan from the table, no decision call, confidence 1.
  if (input.userMode !== 'auto' || explicitTier) {
    const base = baseFor(input.jobKind, input.userMode, 'medium', 'drafting');
    const tier = clampTier(explicitTier ?? base.tier, true, cfg);
    return {
      plan: {
        pattern: base.pattern, tier, effort: base.effort, outputBand: band,
        maxTokens: maxTokensFor(band, tier, base.effort, cfg),
        confidence: 1, upgraded: false, userMode: input.userMode, jobKind: input.jobKind, decisions: [],
        reason: `حالت «${MODE_FA[input.userMode]}» را خودت انتخاب کردی: مدل ${TIER_FA[tier]}، effort ${EFFORT_FA[base.effort]}، الگوی ${PATTERN_FA[base.pattern]}.`,
      },
    };
  }

  // Auto: ask the decision layer, then apply the deterministic table + upgrade rule.
  const res = await deps.decisions.decide(
    { text: input.text.slice(0, 1500), facts: { jobKind: input.jobKind, contextTokens: input.contextTokens } },
    decisionQuestions(),
  );
  const ans = (id: string) => res.answers.find((a) => a.id === id)!;
  const taskKind = ans('taskKind').choice as TaskKind;
  let difficulty = ans('difficulty').choice as Difficulty;
  const importance = ans('importance').choice as Importance;
  if (input.contextTokens > LONG_CONTEXT_TOKENS && difficulty === 'easy') difficulty = 'medium';

  const confidence = Math.min(...res.answers.map((a) => a.probability));
  const base = baseFor(input.jobKind, 'auto', difficulty, taskKind);
  const wantsUp = confidence < CONFIDENCE_THRESHOLD || importance === 'high';
  let tier = base.tier;
  let upgraded = false;
  if (wantsUp) {
    const up = nextTier(tier);
    if (up) {
      const clamped = clampTier(up, false, cfg);
      if (clamped !== tier) { tier = clamped; upgraded = true; }
    }
  }
  // a bump on a plain "single" chat keeps the pattern; a bumped job that is high-importance deliverable gets validation
  let pattern = base.pattern;
  if (importance === 'high' && input.jobKind !== 'chat' && pattern === 'single') pattern = 'cascade';

  const why = [
    `Auto: کار «${taskKind}» با سختی ${difficulty}، اهمیت ${importance} تشخیص داده شد.`,
    upgraded ? `به‌دلیل ${importance === 'high' ? 'اهمیت زیاد' : 'مطمئن نبودم که تشخیص درست است'} یک سطح بالاتر رفت.` : '',
    `مدل ${TIER_FA[tier]}، effort ${EFFORT_FA[base.effort]}، الگوی ${PATTERN_FA[pattern]}.`,
  ].filter(Boolean).join(' ');

  return {
    plan: {
      pattern, tier, effort: base.effort, outputBand: band,
      maxTokens: maxTokensFor(band, tier, base.effort, cfg),
      confidence, upgraded, userMode: 'auto', jobKind: input.jobKind,
      decisions: res.answers.map((a) => ({ id: a.id, choice: a.choice, probability: a.probability })),
      reason: why,
    },
    decisionUsage: res.usage,
  };
}

/**
 * Accept a plan previewed by the client (so the credits shown are the credits charged) but never trust it blindly:
 * every field is clamped to what the config allows. Returns null when it is unusable → route again.
 */
export function sanitizePlan(raw: unknown, cfg: ModelsConfig = modelsConfig): AiPlan | null {
  const p = raw as Partial<AiPlan> | null;
  if (!p || typeof p !== 'object') return null;
  const efforts: Effort[] = ['minimal', 'low', 'medium', 'high', 'max'];
  const patterns: Pattern[] = ['single', 'cascade', 'critique'];
  const modes: UserMode[] = ['auto', 'fast', 'deep', 'sensitive'];
  const kinds: JobKind[] = ['chat', 'asset', 'deliverable'];
  if (!p.tier || !TIERS.includes(p.tier) || !p.effort || !efforts.includes(p.effort) || !p.pattern || !patterns.includes(p.pattern)) return null;
  if (!p.userMode || !modes.includes(p.userMode) || !p.jobKind || !kinds.includes(p.jobKind)) return null;
  if (p.userMode === 'auto' && cfg.tiers[p.tier].requiresExplicitSelection) return null;
  const band = BANDS[p.jobKind];
  return {
    pattern: p.pattern, tier: p.tier, effort: p.effort, outputBand: band,
    maxTokens: maxTokensFor(band, p.tier, p.effort, cfg),
    confidence: typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0,
    reason: typeof p.reason === 'string' ? p.reason.slice(0, 600) : '',
    upgraded: Boolean(p.upgraded), userMode: p.userMode, jobKind: p.jobKind,
    decisions: Array.isArray(p.decisions) ? p.decisions.slice(0, 6).map((d) => ({ id: String(d.id), choice: String(d.choice), probability: Number(d.probability) || 0 })) : [],
  };
}

/** The deliverable spec's own length choice overrides the router's default band (tokens follow the band). */
export function applyBand(plan: AiPlan, jobKind: JobKind, choice: 'short' | 'medium' | 'long' | undefined, cfg: ModelsConfig = modelsConfig): AiPlan {
  if (!choice || jobKind === 'chat') return plan;
  const band = BAND_CHOICES[jobKind][choice];
  return { ...plan, outputBand: band, maxTokens: maxTokensFor(band, plan.tier, plan.effort, cfg) };
}
