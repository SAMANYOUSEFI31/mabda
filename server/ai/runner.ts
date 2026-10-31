import type { Effort, StageName, StageUsage, Tier, TokenUsage } from '../../src/types/ai.ts';
import { costUsd, modelsConfig } from './config.ts';
import type { ModelsConfig } from './config.ts';
import { AiError, toAiError } from './errors.ts';
import type { Prompt } from './providers/provider.ts';
import type { AiSession } from './session.ts';

export interface StageOptions {
  stage: StageName;
  tier: Tier;
  effort: Effort;
  maxTokens: number;
  /** per-stage cap; the request-wide deadline still applies */
  timeoutMs?: number;
}

export interface Stage<T> {
  value: T;
  usage: StageUsage;
}

/**
 * Executes single model calls: picks the concrete model from the session, applies timeouts (AbortController),
 * and turns provider metadata into a ledger-ready StageUsage with the real cost from config.
 */
export class StageRunner {
  constructor(
    private readonly session: AiSession,
    /** request-wide signal (client disconnect + overall deadline) */
    private readonly signal?: AbortSignal,
    private readonly cfg: ModelsConfig = modelsConfig,
    private readonly now: () => number = Date.now,
  ) {}

  private spec(o: StageOptions, signal: AbortSignal) {
    return { modelId: this.session.modelFor(o.tier), tier: this.cfg.tiers[o.tier], effort: o.effort, maxTokens: o.maxTokens, signal };
  }

  private record(o: StageOptions, usage: TokenUsage, startedAt: number): StageUsage {
    const tc = this.cfg.tiers[o.tier];
    return {
      ...usage,
      stage: o.stage,
      tier: o.tier,
      provider: tc.provider,
      modelId: this.session.modelFor(o.tier),
      effort: o.effort,
      costUsd: costUsd(tc, usage),
      durationMs: this.now() - startedAt,
    };
  }

  /** Combine the request signal with a per-stage timeout; tells timeouts apart from client aborts. */
  private async guarded<T>(o: StageOptions, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const ctl = new AbortController();
    let timedOut = false;
    const onParent = () => ctl.abort();
    if (this.signal?.aborted) throw new AiError('aborted', { stage: o.stage });
    this.signal?.addEventListener('abort', onParent, { once: true });
    const timer = o.timeoutMs ? setTimeout(() => { timedOut = true; ctl.abort(); }, o.timeoutMs) : undefined;
    try {
      return await run(ctl.signal);
    } catch (e) {
      if (timedOut) throw new AiError('timeout', { stage: o.stage });
      const err = toAiError(e, o.stage);
      // the request-wide deadline aborts through the parent signal; report it as a timeout if that is why
      if (err.kind === 'aborted' && this.signal && (this.signal as AbortSignal & { reason?: unknown }).reason === 'deadline') {
        throw new AiError('timeout', { stage: o.stage });
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      this.signal?.removeEventListener('abort', onParent);
    }
  }

  async structured(o: StageOptions, prompt: Prompt, schema: unknown): Promise<Stage<unknown>> {
    const t0 = this.now();
    const provider = this.session.providerFor(o.tier);
    const r = await this.guarded(o, (signal) => provider.generateStructured(this.spec(o, signal), prompt, schema));
    return { value: r.value, usage: this.record(o, r.usage, t0) };
  }

  async text(o: StageOptions, prompt: Prompt): Promise<Stage<string>> {
    const t0 = this.now();
    const provider = this.session.providerFor(o.tier);
    const r = await this.guarded(o, (signal) => provider.generate(this.spec(o, signal), prompt));
    return { value: r.value, usage: this.record(o, r.usage, t0) };
  }

  /** Streams text chunks; the final StageUsage is delivered through the returned promise-like `done`. */
  stream(o: StageOptions, prompt: Prompt, schema?: unknown): { chunks: AsyncGenerator<string, void, void>; usage: () => StageUsage } {
    const t0 = this.now();
    const provider = this.session.providerFor(o.tier);
    let final: TokenUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, thinkingTokens: 0 };
    let usage: StageUsage | null = null;
    const self = this;
    async function* gen(): AsyncGenerator<string, void, void> {
      const ctl = new AbortController();
      let timedOut = false;
      const onParent = () => ctl.abort();
      if (self.signal?.aborted) throw new AiError('aborted', { stage: o.stage });
      self.signal?.addEventListener('abort', onParent, { once: true });
      const timer = o.timeoutMs ? setTimeout(() => { timedOut = true; ctl.abort(); }, o.timeoutMs) : undefined;
      try {
        const it = provider.stream(self.spec(o, ctl.signal), prompt, schema);
        for (;;) {
          const n = await it.next();
          if (n.done) { final = n.value; break; }
          yield n.value.text;
        }
        usage = self.record(o, final, t0);
      } catch (e) {
        if (timedOut) throw new AiError('timeout', { stage: o.stage });
        const err = toAiError(e, o.stage);
        if (err.kind === 'aborted' && (self.signal as AbortSignal & { reason?: unknown } | undefined)?.reason === 'deadline') throw new AiError('timeout', { stage: o.stage });
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        self.signal?.removeEventListener('abort', onParent);
      }
    }
    return {
      chunks: gen(),
      usage: () => usage ?? self.record(o, final, t0),
    };
  }
}

export const sumUsage = (stages: StageUsage[]) =>
  stages.reduce(
    (a, s) => ({
      inputTokens: a.inputTokens + s.inputTokens,
      cachedTokens: a.cachedTokens + s.cachedTokens,
      outputTokens: a.outputTokens + s.outputTokens,
      thinkingTokens: a.thinkingTokens + s.thinkingTokens,
      costUsd: Math.round((a.costUsd + s.costUsd) * 1e8) / 1e8,
    }),
    { inputTokens: 0, cachedTokens: 0, outputTokens: 0, thinkingTokens: 0, costUsd: 0 },
  );
