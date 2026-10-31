import { GoogleGenAI } from '@google/genai';
import type { GenerateContentConfig, GenerateContentResponse } from '@google/genai';
import type { TokenUsage } from '../../../src/types/ai.ts';
import { AiError, toAiError } from '../errors.ts';
import type { CallSpec, GenerateResult, ModelInfo, ModelProvider, Prompt } from './provider.ts';

/** Gemini adapter (@google/genai). Effort -> thinking parameter comes from config/models.json. */
export class GeminiProvider implements ModelProvider {
  readonly id = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, client?: GoogleGenAI) {
    this.client = client ?? new GoogleGenAI({ apiKey });
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const out: ModelInfo[] = [];
      const pager = await this.client.models.list({ config: { pageSize: 100, abortSignal: signal } });
      for await (const m of pager) {
        const id = (m.name ?? '').replace(/^models\//, '');
        if (!id) continue;
        out.push({ id, supportsGenerate: (m.supportedActions ?? ['generateContent']).includes('generateContent') });
      }
      return out;
    } catch (e) {
      throw toAiError(e);
    }
  }

  private config(spec: CallSpec, prompt: Prompt, jsonSchema?: unknown): GenerateContentConfig {
    const t = spec.tier.thinking;
    const cfg: GenerateContentConfig = {
      systemInstruction: prompt.system,
      maxOutputTokens: Math.min(spec.maxTokens, spec.tier.maxOutputTokens),
      abortSignal: spec.signal,
    };
    if (t.supported) {
      // thinkingBudget is numeric; thinkingLevel (newer models) is an enum string — both are passed through from config.
      cfg.thinkingConfig = { [t.param]: t.map[spec.effort] } as GenerateContentConfig['thinkingConfig'];
    }
    if (jsonSchema) {
      cfg.responseMimeType = 'application/json';
      cfg.responseJsonSchema = jsonSchema;
    }
    return cfg;
  }

  private contents(prompt: Prompt) {
    const parts = [];
    if (prompt.prefix) parts.push({ text: prompt.prefix });
    parts.push({ text: prompt.user });
    return [{ role: 'user', parts }];
  }

  async generate(spec: CallSpec, prompt: Prompt): Promise<GenerateResult<string>> {
    try {
      const res = await this.client.models.generateContent({ model: spec.modelId, contents: this.contents(prompt), config: this.config(spec, prompt) });
      return { value: textOf(res), usage: usageOf(res), modelId: spec.modelId };
    } catch (e) {
      throw toAiError(e);
    }
  }

  async generateStructured(spec: CallSpec, prompt: Prompt, jsonSchema: unknown): Promise<GenerateResult<unknown>> {
    let res: GenerateContentResponse;
    try {
      res = await this.client.models.generateContent({ model: spec.modelId, contents: this.contents(prompt), config: this.config(spec, prompt, jsonSchema) });
    } catch (e) {
      throw toAiError(e);
    }
    const text = textOf(res);
    try {
      return { value: JSON.parse(text), usage: usageOf(res), modelId: spec.modelId };
    } catch {
      throw new AiError('bad_output', { detail: text.slice(0, 200) });
    }
  }

  async *stream(spec: CallSpec, prompt: Prompt, jsonSchema?: unknown): AsyncGenerator<{ text: string }, TokenUsage, void> {
    let last: GenerateContentResponse | undefined;
    try {
      const it = await this.client.models.generateContentStream({ model: spec.modelId, contents: this.contents(prompt), config: this.config(spec, prompt, jsonSchema) });
      for await (const chunk of it) {
        last = chunk;
        const text = textOf(chunk);
        if (text) yield { text };
      }
    } catch (e) {
      throw toAiError(e);
    }
    return last ? usageOf(last) : { inputTokens: 0, cachedTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  }
}

function textOf(res: GenerateContentResponse): string {
  try {
    return res.text ?? '';
  } catch {
    return '';
  }
}

/** Real token counts from response metadata (prompt includes cached tokens; thoughts are reported separately). */
export function usageOf(res: Pick<GenerateContentResponse, 'usageMetadata'>): TokenUsage {
  const u = res.usageMetadata ?? {};
  const prompt = u.promptTokenCount ?? 0;
  const cached = Math.min(u.cachedContentTokenCount ?? 0, prompt);
  return {
    inputTokens: prompt - cached,
    cachedTokens: cached,
    outputTokens: u.candidatesTokenCount ?? 0,
    thinkingTokens: u.thoughtsTokenCount ?? 0,
  };
}
