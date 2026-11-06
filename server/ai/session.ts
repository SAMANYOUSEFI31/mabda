import type { AiStatus, Tier } from '../../src/types/ai.ts';
import { modelsConfig, TIERS } from './config.ts';
import type { ModelsConfig } from './config.ts';
import { AiError } from './errors.ts';
import { GeminiProvider } from './providers/gemini.ts';
import type { ModelProvider } from './providers/provider.ts';

export function isValidGeminiKey(key?: string): boolean {
  if (!key) return false;
  const k = key.trim();
  return k.length > 20 && k.startsWith('AIzaSy') && !k.startsWith('MY_');
}

export type ProviderFactory = (providerId: string, apiKey: string) => ModelProvider;
export const defaultProviderFactory: ProviderFactory = (id, key) => {
  if (id === 'gemini') return new GeminiProvider(key);
  throw new AiError('bad_request', { message: `ارائه‌دهندهٔ ناشناخته: ${id}`, retryable: false });
};

export interface Verification {
  resolved: Record<Tier, string>;
  verified: Record<Tier, boolean>;
  warnings: string[];
  /** false when the model list could not be fetched (result is not cached) */
  listed: boolean;
}

/**
 * Check the config's model ids against what the platform key can actually use. Never guesses: the first candidate that
 * the API lists (and that supports generateContent) wins; anything else produces a warning.
 */
export async function verifyModels(provider: ModelProvider, cfg: ModelsConfig = modelsConfig, signal?: AbortSignal): Promise<Verification> {
  const resolved = {} as Record<Tier, string>;
  const verified = {} as Record<Tier, boolean>;
  const warnings: string[] = [];
  let available: Set<string> | null = null;
  let listed = true;
  try {
    available = new Set((await provider.listModels(signal)).filter((m) => m.supportsGenerate).map((m) => m.id));
  } catch (e) {
    listed = false;
    warnings.push(`فهرست مدل‌ها دریافت نشد؛ شناسهٔ مدل‌ها تأیید نشده است (${(e as Error).message}).`);
  }
  for (const tier of TIERS) {
    const tc = cfg.tiers[tier];
    if (!available) {
      resolved[tier] = tc.candidates[0];
      verified[tier] = false;
      continue;
    }
    const hit = tc.candidates.find((c) => available!.has(c));
    if (!hit) {
      resolved[tier] = tc.candidates[0];
      verified[tier] = false;
      warnings.push(`هیچ‌یک از مدل‌های سطح «${tier}» (${tc.candidates.join('، ')}) برای این کلید در دسترس نیست. config/models.json را اصلاح کن.`);
    } else {
      resolved[tier] = hit;
      verified[tier] = true;
      if (hit !== tc.candidates[0]) warnings.push(`مدل ترجیحی سطح «${tier}» (${tc.candidates[0]}) در دسترس نبود؛ از «${hit}» استفاده می‌شود.`);
    }
  }
  return { resolved, verified, warnings, listed };
}

export interface AiSession {
  providerFor(tier: Tier): ModelProvider;
  modelFor(tier: Tier): string;
  verification: Verification;
}

export interface SessionDeps {
  managedEnabled: boolean;
  managedKey?: string;
  /** the manager ledger endpoint is on */
  admin?: boolean;
  cfg?: ModelsConfig;
  factory?: ProviderFactory;
}

/** Resolves all requests to the platform-controlled AI configuration. */
export class SessionResolver {
  private readonly cache = new Map<string, AiSession>();
  private readonly cfg: ModelsConfig;
  private readonly factory: ProviderFactory;

  constructor(private readonly deps: SessionDeps) {
    this.cfg = deps.cfg ?? modelsConfig;
    this.factory = deps.factory ?? defaultProviderFactory;
  }

  get managedEnabled() { return this.deps.managedEnabled; }
  get managedKeyValid() { return isValidGeminiKey(this.deps.managedKey); }

  /** Whether platform-paid, quota-limited AI features have a configured server key. */
  get platformAvailable() { return this.managedKeyValid; }

  async resolve(userId: string, purpose: 'user' | 'platform' = 'user'): Promise<AiSession> {
    if (!this.managedKeyValid) throw new AiError('disabled');
    if (purpose !== 'platform' && !this.deps.managedEnabled) throw new AiError('disabled');
    return this.build('managed', this.deps.managedKey!);
  }

  private async build(cacheKey: string, apiKey: string): Promise<AiSession> {
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const providers = new Map<string, ModelProvider>();
    const providerFor = (tier: Tier) => {
      const id = this.cfg.tiers[tier].provider;
      let p = providers.get(id);
      if (!p) { p = this.factory(id, apiKey); providers.set(id, p); }
      return p;
    };
    const verification = await verifyModels(providerFor('cheap'), this.cfg);
    const session: AiSession = { providerFor, modelFor: (t) => verification.resolved[t], verification };
    if (verification.listed) this.cache.set(cacheKey, session);
    return session;
  }

  async status(userId: string): Promise<AiStatus> {
    const base: AiStatus = {
      available: false,
      managedEnabled: this.deps.managedEnabled,
      platformJudgments: this.managedKeyValid,
      admin: Boolean(this.deps.admin),
    };
    try {
      const s = await this.resolve(userId);
      return { ...base, available: true };
    } catch (e) {
      if (e instanceof AiError) return { ...base, unavailable: { kind: e.kind, message: e.message } };
      throw e;
    }
  }
}
