import type { TokenUsage } from '../../../src/types/ai.ts';
import type { CallSpec, GenerateResult, ModelInfo, ModelProvider, Prompt } from '../providers/provider.ts';

/** TEST-ONLY provider: scripted replies, records every call. Never wired into the server. */
export interface MockCall { spec: CallSpec; prompt: Prompt; schema?: unknown; kind: 'generate' | 'structured' | 'stream' }

export class MockProvider implements ModelProvider {
  readonly id = 'gemini';
  calls: MockCall[] = [];
  models: string[] = [];
  constructor(private readonly script: (call: MockCall, n: number) => unknown, private readonly usage: TokenUsage = { inputTokens: 1000, cachedTokens: 0, outputTokens: 200, thinkingTokens: 0 }) {}

  async listModels(): Promise<ModelInfo[]> { return this.models.map((id) => ({ id, supportsGenerate: true })); }

  async generate(spec: CallSpec, prompt: Prompt): Promise<GenerateResult<string>> {
    const call: MockCall = { spec, prompt, kind: 'generate' };
    this.calls.push(call);
    return { value: String(this.script(call, this.calls.length - 1)), usage: this.usage, modelId: spec.modelId };
  }

  async generateStructured(spec: CallSpec, prompt: Prompt, schema: unknown): Promise<GenerateResult<unknown>> {
    const call: MockCall = { spec, prompt, schema, kind: 'structured' };
    this.calls.push(call);
    const v = this.script(call, this.calls.length - 1);
    if (v instanceof Error) throw v;
    return { value: v, usage: this.usage, modelId: spec.modelId };
  }

  async *stream(spec: CallSpec, prompt: Prompt, schema?: unknown): AsyncGenerator<{ text: string }, TokenUsage, void> {
    const call: MockCall = { spec, prompt, schema, kind: 'stream' };
    this.calls.push(call);
    const v = this.script(call, this.calls.length - 1);
    if (v instanceof Error) throw v;
    const text = typeof v === 'string' ? v : JSON.stringify(v);
    for (let i = 0; i < text.length; i += 17) yield { text: text.slice(i, i + 17) };
    return this.usage;
  }
}

export const block = (id: string, markdown: string, extra: object = {}) => ({ id, kind: 'paragraph', markdown, ...extra });
/** True when the call is the decision layer asked for per-item reasons (the validator / gap judge). */
export const isCheckCall = (c: { schema?: unknown }) => { const j = JSON.stringify(c.schema ?? ''); return j.includes('probability') && j.includes('"reason"'); };
/** Answers every check question: criteria `c*`/gap `o*` pass, guardrails `g*` ok, unless listed in `bad`. */
export const answerChecks = (c: { schema?: unknown }, bad: string[] = [], probability = 0.9) => {
  const ids = (c.schema as { properties: { answers: { items: { properties: { id: { enum: string[] } } } } } }).properties.answers.items.properties.id.enum;
  return { answers: ids.map((id) => {
    const isBad = bad.includes(id);
    const choice = id.startsWith('g') ? (isBad ? 'violated' : 'ok') : id.startsWith('o') ? (isBad ? 'ambiguous' : 'clear') : isBad ? 'fail' : 'pass';
    return { id, choice, probability, reason: isBad ? `دلیل رد ${id}` : `دلیل قبول ${id}` };
  }) };
};
