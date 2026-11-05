/**
 * Manager ledger maths: platform AI cost against plan revenue. Legacy personal-key rows remain excluded.
 * Pure; used by the admin endpoint, the cost simulation and the tests.
 */

import type { LedgerEntry, PlanId } from '../types';
import { COST_WARN_RATIO, entitlementsOf } from './entitlements';

export type CostCategory = 'judgments' | 'fileProcessing' | 'coach' | 'generation';

export const CATEGORY_LABEL: Record<CostCategory, string> = {
  judgments: 'قضاوت‌های لایهٔ تصمیم',
  fileProcessing: 'پردازش فایل',
  coach: 'مربی دانش',
  generation: 'خروجی و گفتگو (AI مدیریت‌شده)',
};

export function categoryOf(mode: LedgerEntry['mode']): CostCategory {
  switch (mode) {
    case 'gap_judge': case 'note_extract': case 'asset_extract': case 'import_parse': case 'contradiction': return 'judgments';
    case 'memory_import': return 'fileProcessing';
    case 'thread': return 'coach';
    case 'file_processing': return 'fileProcessing';
    case 'coach': return 'coach';
    default: return 'generation';
  }
}

/** Legacy ledger entries marked as user-paid are not platform cost. New entries omit this marker. */
export const isOurCost = (e: Pick<LedgerEntry, 'byok'>) => e.byok !== true;

export interface CostLine { category: CostCategory; costUsd: number; calls: number }

export interface CostReportRow {
  planId: PlanId;
  priceUsd: number;
  ourCostUsd: number;
  /** our cost / plan price */
  ratio: number;
  warn: boolean;
  lines: CostLine[];
}

export function costReport(planId: PlanId, entries: Array<Pick<LedgerEntry, 'mode' | 'estimatedAiCostUsd'> & Pick<LedgerEntry, 'byok'>>, warnRatio = COST_WARN_RATIO): CostReportRow {
  const priceUsd = entitlementsOf(planId).priceMonthlyUsd;
  const byCat = new Map<CostCategory, CostLine>();
  let ours = 0;
  for (const e of entries) {
    if (!isOurCost(e)) continue;
    const c = categoryOf(e.mode);
    const l = byCat.get(c) ?? { category: c, costUsd: 0, calls: 0 };
    l.costUsd += e.estimatedAiCostUsd;
    l.calls += 1;
    byCat.set(c, l);
    ours += e.estimatedAiCostUsd;
  }
  const ratio = priceUsd > 0 ? ours / priceUsd : 0;
  return {
    planId, priceUsd, ourCostUsd: ours, ratio, warn: ratio > warnRatio,
    lines: [...byCat.values()].sort((a, b) => b.costUsd - a.costUsd),
  };
}

export interface Pricing { inputPerM: number; outputPerM: number }

/** Heavy-use assumptions of the monthly simulation (all [فرض], tokens per call). */
export interface HeavyUseAssumptions {
  days: number;
  /** a batched Gap judgement: objects judged per call and tokens */
  judgmentCall: { inputTokens: number; outputTokens: number; judgmentsPerCall: number };
  coachCall: { inputTokens: number; outputTokens: number };
  /** file extraction reads at most this window per file (see EXTRACT_WINDOW_TOKENS) */
  fileExtract: { avgFileTokens: number; windowTokens: number; outputTokens: number };
}

export interface HeavyUseResult {
  planId: PlanId;
  priceUsd: number;
  judgmentsCostUsd: number;
  coachCostUsd: number;
  filesCostUsd: number;
  totalUsd: number;
  ratio: number;
  warn: boolean;
}

const callCost = (p: Pricing, input: number, output: number) => (input * p.inputPerM + output * p.outputPerM) / 1_000_000;

/** Worst case a plan allows: every daily cap and the whole file quota used, every day of the month. */
export function heavyUseCost(planId: PlanId, a: HeavyUseAssumptions, cheap: Pricing, balanced: Pricing): HeavyUseResult {
  const e = entitlementsOf(planId);
  const judgmentCalls = Math.ceil(e.decisionJudgmentsPerDay / a.judgmentCall.judgmentsPerCall) * a.days;
  const judgmentsCostUsd = judgmentCalls * callCost(cheap, a.judgmentCall.inputTokens, a.judgmentCall.outputTokens);
  const coachCostUsd = e.coachPerDay * a.days * callCost(balanced, a.coachCall.inputTokens, a.coachCall.outputTokens);
  const files = Math.ceil(e.fileTokensPerMonth / a.fileExtract.avgFileTokens);
  const filesCostUsd = files * callCost(cheap, Math.min(a.fileExtract.avgFileTokens, a.fileExtract.windowTokens), a.fileExtract.outputTokens);
  const totalUsd = judgmentsCostUsd + coachCostUsd + filesCostUsd;
  const ratio = totalUsd / e.priceMonthlyUsd;
  return { planId, priceUsd: e.priceMonthlyUsd, judgmentsCostUsd, coachCostUsd, filesCostUsd, totalUsd, ratio, warn: ratio > COST_WARN_RATIO };
}
