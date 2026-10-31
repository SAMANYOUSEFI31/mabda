import type { StageName, StageUsage } from '../../src/types/ai.ts';
import { DECISION_INSTRUCTION } from './prompts.ts';
import { AiError } from './errors.ts';
import { decisionSchema } from './schemas.ts';
import type { StageRunner } from './runner.ts';
import { modelsConfig } from './config.ts';

/**
 * Decision layer — ONE interface for every closed judgement ("pick from options + probability").
 * Current implementation: the cheap tier with structured output. A purpose-built decision model can replace it
 * by implementing `DecisionLayer`; callers never know which one answered.
 */
export interface DecisionQuestion {
  id: string;
  question: string;
  options: string[];
  /** ask for a one-sentence Persian reason with the choice */
  reason?: boolean;
}

export interface DecisionAnswer {
  id: string;
  choice: string;
  /** 0..1 probability that `choice` is right */
  probability: number;
  reason?: string;
}

export interface DecisionState {
  /** free text the judgement is about (truncated by the caller) */
  text: string;
  /** small structured facts the questions may rely on */
  facts?: Record<string, string | number | boolean>;
  /** how the call appears in the ledger (default: decision) */
  stage?: StageName;
}

export interface DecisionResult {
  answers: DecisionAnswer[];
  /** token usage for the ledger (absent for non-model implementations) */
  usage?: StageUsage;
}

export interface DecisionLayer {
  decide(state: DecisionState, questions: DecisionQuestion[]): Promise<DecisionResult>;
}

/** Validates the model's answers against the questions: every question answered once, choice ∈ options, probability clamped. */
export function validateAnswers(raw: unknown, questions: DecisionQuestion[]): DecisionAnswer[] {
  const list = (raw as { answers?: unknown })?.answers;
  if (!Array.isArray(list)) throw new AiError('bad_output', { stage: 'decision', detail: 'no answers' });
  return questions.map((q) => {
    const a = list.find((x) => (x as DecisionAnswer)?.id === q.id) as DecisionAnswer | undefined;
    if (!a || !q.options.includes(a.choice)) throw new AiError('bad_output', { stage: 'decision', detail: `bad answer for ${q.id}` });
    const p = Number(a.probability);
    if (!Number.isFinite(p)) throw new AiError('bad_output', { stage: 'decision', detail: `bad probability for ${q.id}` });
    const reason = typeof a.reason === 'string' && a.reason.trim() ? a.reason.trim() : undefined;
    return { id: q.id, choice: a.choice, probability: Math.min(1, Math.max(0, p)), ...(q.reason ? { reason: reason ?? '' } : {}) };
  });
}

export class ModelDecisionLayer implements DecisionLayer {
  constructor(private readonly runner: StageRunner, private readonly timeoutMs = modelsConfig.timeoutsMs.decision) {}

  async decide(state: DecisionState, questions: DecisionQuestion[]): Promise<DecisionResult> {
    const optionsById = Object.fromEntries(questions.map((q) => [q.id, q.options]));
    const withReason = questions.some((q) => q.reason);
    const user = [
      '## موضوع قضاوت',
      state.text,
      state.facts ? `## واقعیت‌ها\n${Object.entries(state.facts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : '',
      '## سؤال‌ها',
      ...questions.map((q) => `- id=${q.id}: ${q.question}\n  گزینه‌ها: ${q.options.join(' | ')}${q.reason ? '\n  (یک جملهٔ فارسی دلیل هم بنویس: reason)' : ''}`),
    ].filter(Boolean).join('\n');
    const r = await this.runner.structured(
      { stage: state.stage ?? 'decision', tier: 'cheap', effort: 'minimal', maxTokens: withReason ? Math.min(6000, 300 + 160 * questions.length) : 400, timeoutMs: withReason ? Math.max(this.timeoutMs, 30_000) : this.timeoutMs },
      { system: DECISION_INSTRUCTION, user },
      decisionSchema(questions.map((q) => q.id), optionsById, withReason),
    );
    return { answers: validateAnswers(r.value, questions), usage: r.usage };
  }
}
