/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AiPlan, ExecutionMode, PlanId, WorkspacePlan } from '../types';

export const PLANS: Record<PlanId, WorkspacePlan> = {
  starter: {
    id: 'starter',
    title: 'Starter (شروع جدی)',
    priceMonthlyUsd: 9,
    priceMonthlyToman: 650000,
    creditsMonthly: 300,
    workspaceLimit: 1,
    dailyChatLimit: 30,
    allowedModes: ['fast', 'auto'],
  },
  pro: {
    id: 'pro',
    title: 'Pro (اپراتور حرفه‌ای)',
    priceMonthlyUsd: 24,
    priceMonthlyToman: 1750000,
    creditsMonthly: 900,
    workspaceLimit: 3,
    dailyChatLimit: 70,
    allowedModes: ['fast', 'auto', 'critique'],
  },
  max: {
    id: 'max',
    title: 'Max (مشاور و آژانس)',
    priceMonthlyUsd: 49,
    priceMonthlyToman: 3500000,
    creditsMonthly: 2000,
    workspaceLimit: 10,
    dailyChatLimit: 140,
    allowedModes: ['fast', 'auto', 'critique', 'sensitive'],
  },
};

export interface CalculateCostParams {
  deliverableType: 'Asset' | 'Deliverable';
  executionMode: ExecutionMode;
  isRebuildAfterContextChange?: boolean;
  baseCreditCost?: {
    fast: number;
    auto: number;
    critique: number;
    sensitive: number;
  };
}

/**
 * Calculates credit cost for a deliverable execution based on PRD rules:
 * - Auto gives a 10% discount
 * - Rebuild after context change gives 50% discount (allowed once)
 */
export function calculateCreditCost(params: CalculateCostParams): number {
  const { deliverableType, executionMode, isRebuildAfterContextChange, baseCreditCost } = params;

  let base = 0;
  if (baseCreditCost) {
    base = baseCreditCost[executionMode] ?? baseCreditCost.auto;
  } else {
    // Default weights from PRD table
    if (deliverableType === 'Asset') {
      const costs: Record<ExecutionMode, number> = {
        fast: 1,
        auto: 2,
        critique: 10,
        sensitive: 20,
      };
      base = costs[executionMode];
    } else {
      const costs: Record<ExecutionMode, number> = {
        fast: 18,
        auto: 26,
        critique: 50,
        sensitive: 80,
      };
      base = costs[executionMode];
    }
  }

  // 10% discount for Auto mode as specified in PRD
  if (executionMode === 'auto') {
    base = Math.max(1, Math.round(base * 0.9));
  }

  // 50% discount for rebuild after modifying source context
  if (isRebuildAfterContextChange) {
    base = Math.max(1, Math.ceil(base * 0.5));
  }

  return base;
}

export function estimateRemainingOutputs(credits: number, avgCostPerDeliverable = 23): number {
  if (credits <= 0) return 0;
  return Math.floor(credits / avgCostPerDeliverable);
}

/**
 * Fair-use chat limit checker:
 * Returns remaining count and whether the daily fair-use limit is exceeded.
 */
export function checkChatFairUse(planId: PlanId, todayChatCount: number): {
  allowed: boolean;
  isSoftExceeded: boolean;
  isHardExceeded: boolean;
  limit: number;
  remaining: number;
} {
  const plan = PLANS[planId] || PLANS.starter;
  const limit = plan.dailyChatLimit;
  const remaining = Math.max(0, limit - todayChatCount);
  const isSoftExceeded = todayChatCount >= limit;
  const isHardExceeded = todayChatCount >= limit * 2;

  return {
    allowed: !isHardExceeded,
    isSoftExceeded,
    isHardExceeded,
    limit,
    remaining,
  };
}

/**
 * Which price row an AI plan is charged at. The plan is what the router actually decided (shown to the user
 * BEFORE the run), so Auto that escalates is priced at the level it escalated to.
 *  - sensitive mode → sensitive
 *  - critique pattern, or any frontier-tier run → critique
 *  - single on the cheap tier, or the explicit "fast" mode → fast
 *  - everything else (balanced single/cascade) → auto
 */
export function creditModeForPlan(plan: Pick<AiPlan, 'pattern' | 'tier' | 'userMode'>): ExecutionMode {
  if (plan.userMode === 'sensitive') return 'sensitive';
  if (plan.pattern === 'critique' || plan.tier === 'frontier') return 'critique';
  if (plan.userMode === 'fast' || (plan.pattern === 'single' && plan.tier === 'cheap')) return 'fast';
  return 'auto';
}

/** Credits shown before running (and charged after): derived from the plan, not from the button the user pressed. */
export function previewCredits(params: Omit<CalculateCostParams, 'executionMode'> & { plan: Pick<AiPlan, 'pattern' | 'tier' | 'userMode'> }): number {
  const { plan, ...rest } = params;
  return calculateCreditCost({ ...rest, executionMode: creditModeForPlan(plan) });
}

/** Bring-your-own-key requests never consume credits (tokens and cost are still written to the ledger). */
export function effectiveCredits(cost: number, byok: boolean): number {
  return byok ? 0 : cost;
}

/** Rebuilding after a context change costs half (once per change). */
export function rebuildCredits(cost: number): number {
  return Math.ceil(cost * 0.5);
}

/** Chat: Auto is free (fair-use capped), "deep" costs 5 credits. */
export const CHAT_DEEP_CREDITS = 5;
export function chatCredits(deep: boolean): number {
  return deep ? CHAT_DEEP_CREDITS : 0;
}
