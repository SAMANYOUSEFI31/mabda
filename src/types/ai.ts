/**
 * Types shared by the AI server (server/ai) and the client. Type-only: no runtime code.
 */

export type Tier = 'cheap' | 'balanced' | 'frontier';
export type Effort = 'minimal' | 'low' | 'medium' | 'high' | 'max';
export type Pattern = 'single' | 'cascade' | 'critique';
/** What the user picked. `auto` lets the router decide; the others are explicit. */
export type UserMode = 'auto' | 'fast' | 'deep' | 'sensitive';
export type JobKind = 'chat' | 'asset' | 'deliverable';

export interface OutputBand {
  /** target length in words */
  minWords: number;
  maxWords: number;
}

export interface AiPlan {
  pattern: Pattern;
  tier: Tier;
  effort: Effort;
  outputBand: OutputBand;
  maxTokens: number;
  /** 0..1 — lowest probability among the decisions the plan relied on */
  confidence: number;
  /** one Persian line: why this mode (shown under every output) */
  reason: string;
  /** true when the router moved up a tier from the table's base */
  upgraded: boolean;
  userMode: UserMode;
  jobKind: JobKind;
  /** the decisions behind the plan (empty when the mode was explicit) */
  decisions: Array<{ id: string; choice: string; probability: number }>;
}

export type StageName = 'decision' | 'extract' | 'coach' | 'chat' | 'draft' | 'critique' | 'revise' | 'validate' | 'upgrade';

export interface TokenUsage {
  /** prompt tokens that were NOT served from cache */
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  /** reasoning ("thinking") tokens, billed as output */
  thinkingTokens: number;
}

export interface StageUsage extends TokenUsage {
  stage: StageName;
  tier: Tier;
  provider: string;
  modelId: string;
  effort: Effort;
  costUsd: number;
  durationMs: number;
}

export interface UsageSummary {
  stages: StageUsage[];
  totals: TokenUsage & { costUsd: number };
  /** true when the request used the user's own key (credits are not deducted) */
  byok: boolean;
}

export type BlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'fact' | 'decision' | 'constraint' | 'question';

export interface BlockProposal {
  type: 'Fact' | 'Decision' | 'Constraint';
  title: string;
  content: string;
  nodeId: string;
  reason?: string;
}

export interface ContentBlock {
  id: string;
  kind: BlockKind;
  markdown: string;
  proposal?: BlockProposal;
}

export type AiErrorKind =
  | 'no_key'
  | 'invalid_key'
  | 'disabled'
  | 'quota'
  | 'rate_limit'
  | 'timeout'
  | 'aborted'
  | 'bad_output'
  | 'provider'
  | 'bad_request';

export interface AiErrorInfo {
  kind: AiErrorKind;
  /** Persian, user-facing */
  message: string;
  retryable: boolean;
  stage?: StageName;
}

/** One acceptance criterion or guardrail checked by the decision layer. */
export interface CheckResult {
  kind: 'criterion' | 'guardrail';
  text: string;
  passed: boolean;
  reason: string;
  /** probability the decision layer gave to its own verdict */
  probability: number;
}

export interface CritiqueFeedback {
  score: number;
  strengths: string[];
  improvementsMade: string[];
  checklistPassed: string[];
}

export interface GenerationResult {
  blocks: ContentBlock[];
  /** blocks joined as Markdown — this is what assets store */
  markdown: string;
  plan: AiPlan;
  usage: UsageSummary;
  critiqueFeedback?: CritiqueFeedback;
  /** true if the validator rejected the final output (shown honestly in the UI) */
  validationFailed?: boolean;
  checks?: CheckResult[];
  usedContext: import('./index').UsedContextRef[];
  usedFileChunks?: import('./index').UsedFileChunk[];
}

export interface AiStatus {
  available: boolean;
  source: 'byok' | 'managed' | null;
  managedEnabled: boolean;
  byokConfigured: boolean;
  byokLast4?: string;
  /** why AI is unavailable (when `available` is false) */
  unavailable?: { kind: AiErrorKind; message: string };
  tiers: Array<{ tier: Tier; modelId: string; verified: boolean }>;
  warnings: string[];
  timeoutsMs: { chat: number; deliverable: number };
}

/** NDJSON events of POST /api/ai/chat and POST /api/ai/generate */
export type AiStreamEvent =
  | { type: 'plan'; plan: AiPlan }
  | { type: 'stage'; stage: StageName; tier: Tier }
  | { type: 'block'; block: ContentBlock }
  | { type: 'done'; result: GenerationResult }
  | { type: 'error'; error: AiErrorInfo };

export type ChatStreamEvent = AiStreamEvent;
