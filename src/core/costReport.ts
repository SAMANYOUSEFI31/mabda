/**
 * Manager ledger maths: platform AI cost per workspace, grouped by use. Legacy personal-key rows remain excluded.
 * Pure; used by the admin endpoint and the tests.
 */

import type { LedgerEntry } from '../types';

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
  /** what the platform paid for this workspace's AI calls in the month (real provider metadata) */
  ourCostUsd: number;
  lines: CostLine[];
}

/** One workspace's platform AI cost for the month, grouped by use. No price to compare with: the subscription model was removed. */
export function costReport(entries: Array<Pick<LedgerEntry, 'mode' | 'estimatedAiCostUsd'> & Pick<LedgerEntry, 'byok'>>): CostReportRow {
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
  return { ourCostUsd: ours, lines: [...byCat.values()].sort((a, b) => b.costUsd - a.costUsd) };
}
