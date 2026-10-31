import type { Effort, TokenUsage } from '../../../src/types/ai.ts';
import type { TierConfig } from '../config.ts';

/** What a provider needs to run one call. The provider never picks models or efforts itself. */
export interface CallSpec {
  modelId: string;
  tier: TierConfig;
  effort: Effort;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface Prompt {
  /** stable system text (system prompt + Core) — identical across requests for cache hits */
  system: string;
  /** stable prefix content (Confirmed workspace context) — comes right after `system` */
  prefix?: string;
  /** variable part for this job */
  user: string;
}

export interface GenerateResult<T = string> {
  value: T;
  usage: TokenUsage;
  modelId: string;
}

export interface ModelInfo {
  id: string;
  supportsGenerate: boolean;
}

export interface ModelProvider {
  readonly id: string;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  generate(spec: CallSpec, prompt: Prompt): Promise<GenerateResult<string>>;
  /** JSON-schema constrained output; the result is parsed JSON (shape validation is the caller's job). */
  generateStructured(spec: CallSpec, prompt: Prompt, jsonSchema: unknown): Promise<GenerateResult<unknown>>;
  /** Streams raw text chunks (for structured output these are fragments of the JSON text). */
  stream(spec: CallSpec, prompt: Prompt, jsonSchema?: unknown): AsyncGenerator<{ text: string }, TokenUsage, void>;
}
