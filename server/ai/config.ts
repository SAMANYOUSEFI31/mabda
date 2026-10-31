import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Effort, Tier, TokenUsage } from '../../src/types/ai.ts';

export interface TierConfig {
  provider: string;
  candidates: string[];
  requiresExplicitSelection: boolean;
  maxOutputTokens: number;
  thinking: {
    supported: boolean;
    param: 'thinkingBudget' | 'thinkingLevel';
    map: Record<Effort, number | string>;
    /** worst-case tokens the effort can consume (reserved on top of the visible output) */
    budgetTokens: Record<Effort, number>;
  };
  pricing: { inputPerM: number; cachedInputPerM: number; outputPerM: number };
}

export interface ModelsConfig {
  pricedAt: string;
  timeoutsMs: { chat: number; deliverable: number; decision: number; validator: number };
  tiers: Record<Tier, TierConfig>;
}

export const TIERS: Tier[] = ['cheap', 'balanced', 'frontier'];
export const EFFORTS: Effort[] = ['minimal', 'low', 'medium', 'high', 'max'];

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadModelsConfig(file = path.join(here, 'config', 'models.json')): ModelsConfig {
  const cfg = JSON.parse(readFileSync(file, 'utf8')) as ModelsConfig;
  for (const t of TIERS) {
    const tc = cfg.tiers[t];
    if (!tc || !tc.candidates?.length) throw new Error(`models.json: tier "${t}" needs at least one candidate model`);
    for (const e of EFFORTS) {
      if (tc.thinking.map[e] === undefined || tc.thinking.budgetTokens[e] === undefined) throw new Error(`models.json: tier "${t}" is missing effort "${e}"`);
    }
  }
  return cfg;
}

export const modelsConfig: ModelsConfig = loadModelsConfig();

export function nextTier(tier: Tier): Tier | null {
  const i = TIERS.indexOf(tier);
  return i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

/**
 * Real cost from provider metadata. Cached prompt tokens are billed at the cache rate,
 * thinking tokens at the output rate.
 */
export function costUsd(tier: TierConfig, u: TokenUsage): number {
  const p = tier.pricing;
  const usd = (u.inputTokens * p.inputPerM + u.cachedTokens * p.cachedInputPerM + (u.outputTokens + u.thinkingTokens) * p.outputPerM) / 1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

export const emptyUsage = (): TokenUsage => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, thinkingTokens: 0 });
