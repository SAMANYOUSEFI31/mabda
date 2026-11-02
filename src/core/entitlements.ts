/**
 * Entitlements: what a plan includes. Separate from creditEngine (credits are only for the managed-AI layer).
 * Pure; the server enforces, the UI explains with the same functions.
 */

import { ENTITLEMENTS_CONFIG } from './entitlements.config';
import type { PlanEntitlements, PlanKey } from './entitlements.config';
import type { PlanId } from '../types';

export type { PlanEntitlements, PlanKey };
export const PLAN_IDS: PlanId[] = ['starter', 'pro', 'max'];
export const COST_WARN_RATIO = ENTITLEMENTS_CONFIG.costWarnRatio;

export const entitlementsOf = (plan: PlanId): PlanEntitlements => ENTITLEMENTS_CONFIG.plans[plan] ?? ENTITLEMENTS_CONFIG.plans.starter;

export type Feature = 'changeImpact' | 'semanticContradiction' | 'mcp' | 'contextPack' | 'byok' | 'customSpecs';

export function can(plan: PlanId, feature: Feature): boolean {
  const e = entitlementsOf(plan);
  switch (feature) {
    case 'changeImpact': return e.engines.changeImpact;
    case 'semanticContradiction': return e.engines.semanticContradiction;
    default: return e[feature];
  }
}

/** the cheapest plan that has a feature (for «از پلن X» messages) */
export function cheapestPlanWith(feature: Feature): PlanId | null {
  return PLAN_IDS.find((p) => can(p, feature)) ?? null;
}

export interface Meter {
  key: 'objects' | 'fileTokens' | 'judgments' | 'coach';
  label: string;
  used: number;
  limit: number;
  /** 0..1 (can exceed 1) */
  ratio: number;
  exceeded: boolean;
  /** shown as «نزدیک سقف» from this ratio */
  nearLimit: boolean;
  unit: string;
}

export interface UsageNumbers { objects: number; fileTokens: number; judgmentsToday: number; coachToday: number }

const meter = (key: Meter['key'], label: string, unit: string, used: number, limit: number): Meter => ({
  key, label, unit, used, limit, ratio: limit > 0 ? used / limit : 1, exceeded: used >= limit, nearLimit: limit > 0 && used / limit >= 0.8,
});

/** The four meters the usage panel shows, in a stable order. */
export function meters(plan: PlanId, u: UsageNumbers): Meter[] {
  const e = entitlementsOf(plan);
  return [
    meter('objects', 'قلم دانش', 'قلم', u.objects, e.maxObjects),
    meter('fileTokens', 'پردازش فایل این ماه', 'توکن', u.fileTokens, e.fileTokensPerMonth),
    meter('judgments', 'قضاوت‌های امروز (لایهٔ تصمیم)', 'قضاوت', u.judgmentsToday, e.decisionJudgmentsPerDay),
    meter('coach', 'مربی دانش امروز', 'جلسه', u.coachToday, e.coachPerDay),
  ];
}

export const objectsRemaining = (plan: PlanId, activeObjects: number) => Math.max(0, entitlementsOf(plan).maxObjects - activeObjects);

export const workspaceLimitMessage = (plan: PlanId) => `سقف فضای کاری این پلن (${entitlementsOf(plan).workspaces} عدد) پر شده است.`;
export const objectLimitMessage = (plan: PlanId) => `سقف قلم دانش این پلن (${entitlementsOf(plan).maxObjects} قلم فعال) پر شده است؛ موارد قدیمی را بایگانی کن یا پلن را ارتقا بده.`;
