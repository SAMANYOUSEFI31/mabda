import type { AiStatus, Tier } from '../../src/types/ai.ts';
import { ByokVault } from './byok.ts';
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
 * Check the config's model ids against what the key can actually use. Never guesses: the first candidate that
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
  source: 'byok' | 'managed';
  providerFor(tier: Tier): ModelProvider;
  modelFor(tier: Tier): string;
  verification: Verification;
}

export interface SessionDeps {
  vault: ByokVault;
  managedEnabled: boolean;
  managedKey?: string;
  /** the manager ledger endpoint is on */
  admin?: boolean;
  cfg?: ModelsConfig;
  factory?: ProviderFactory;
}

/** Resolves who pays for a request: the user's own key first, otherwise the (flagged) managed key. */
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

  /** drop cached verification (after a BYOK key is saved/removed) */
  invalidate(userId: string) { this.cache.delete(`byok:${userId}`); }

  /**
   * Who pays for subscription-included JUDGEMENTS (Gap ambiguity, Coach, file extraction): the platform key when the
   * server has one, otherwise the user's own key. Output generation never uses this path.
   */
  platformPayer(): 'us' | 'user' { return this.managedKeyValid ? 'us' : 'user'; }

  async resolve(userId: string, purpose: 'user' | 'platform' = 'user'): Promise<AiSession> {
    if (purpose === 'platform' && this.managedKeyValid) return this.build('platform', 'managed', this.deps.managedKey!);
    const byok = this.deps.vault.get(userId);
    if (byok) return this.build(`byok:${userId}`, 'byok', byok);
    if (!this.deps.managedEnabled) throw new AiError(this.deps.vault.last4(userId) ? 'invalid_key' : 'no_key');
    if (!this.managedKeyValid) throw new AiError('no_key', { message: 'کلید GEMINI_API_KEY روی سرور تنظیم نشده یا نامعتبر است. فایل .env را بررسی کن.' });
    return this.build('managed', 'managed', this.deps.managedKey!);
  }

  private async build(cacheKey: string, source: 'byok' | 'managed', apiKey: string): Promise<AiSession> {
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
    const session: AiSession = { source, providerFor, modelFor: (t) => verification.resolved[t], verification };
    if (verification.listed) this.cache.set(cacheKey, session);
    return session;
  }

  async status(userId: string): Promise<AiStatus> {
    const base: AiStatus = {
      available: false,
      source: null,
      managedEnabled: this.deps.managedEnabled,
      byokConfigured: Boolean(this.deps.vault.last4(userId)),
      platformJudgments: this.managedKeyValid,
      admin: Boolean(this.deps.admin),
      byokLast4: this.deps.vault.last4(userId) ?? undefined,
      tiers: TIERS.map((tier) => ({ tier, modelId: this.cfg.tiers[tier].candidates[0], verified: false })),
      warnings: [],
      timeoutsMs: { chat: this.cfg.timeoutsMs.chat, deliverable: this.cfg.timeoutsMs.deliverable },
    };
    try {
      const s = await this.resolve(userId);
      return {
        ...base,
        available: true,
        source: s.source,
        tiers: TIERS.map((tier) => ({ tier, modelId: s.modelFor(tier), verified: s.verification.verified[tier] })),
        warnings: s.verification.warnings,
      };
    } catch (e) {
      if (e instanceof AiError) return { ...base, unavailable: { kind: e.kind, message: e.message } };
      throw e;
    }
  }
}
