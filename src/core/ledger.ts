/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AiPlan, LedgerEntry, UsageSummary } from '../types';

/**
 * Ledger row from REAL provider usage (token counts and cost come from response metadata and config/models.json
 * on the server — nothing here is estimated). Credits are whatever creditEngine decided.
 */
export function ledgerEntryFromUsage(params: {
  workspaceId: string;
  action: string;
  mode: LedgerEntry['mode'];
  creditCost: number;
  usage: UsageSummary;
  plan?: AiPlan;
  now?: Date;
  id?: string;
}): LedgerEntry {
  const t = params.usage.totals;
  return {
    id: params.id ?? `led_${(params.now ?? new Date()).getTime()}`,
    timestamp: (params.now ?? new Date()).toISOString(),
    workspaceId: params.workspaceId,
    action: params.action,
    mode: params.mode,
    creditCost: params.creditCost,
    // "input" includes cached tokens; "output" includes reasoning tokens (both are billed as such)
    inputTokens: t.inputTokens + t.cachedTokens,
    outputTokens: t.outputTokens + t.thinkingTokens,
    cachedTokens: t.cachedTokens,
    thinkingTokens: t.thinkingTokens,
    estimatedAiCostUsd: t.costUsd,
    status: 'completed',
    plan: params.plan,
    stages: params.usage.stages,
  };
}
