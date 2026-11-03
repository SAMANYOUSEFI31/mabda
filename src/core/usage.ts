/**
 * Local usage counters («استفاده از امکانات»): which features are opened or used, how often, and when last — on this install only.
 * A counter is a KEY from the fixed catalog below plus a number and a time. No text, title, id or any user data is ever stored,
 * and an unknown key is refused (so nothing can be smuggled in as a «feature name»). Only an admin sees the numbers.
 * Pure.
 */

export type FeatureLevel = 1 | 2 | 3;
export interface FeatureInfo { key: string; label: string; level: FeatureLevel }

/** every feature that is counted, with its level in docs/design-principles.md */
export const FEATURES: FeatureInfo[] = [
  { key: 'view.home', label: 'خانه', level: 1 },
  { key: 'view.context', label: 'منبع حقیقت', level: 1 },
  { key: 'view.workstreams', label: 'جریان‌های کار', level: 1 },
  { key: 'view.assets', label: 'دارایی‌ها', level: 1 },
  { key: 'view.ledger', label: 'مصرف و دفتر کل', level: 3 },
  { key: 'context.doc', label: 'نمای ساختار', level: 1 },
  { key: 'context.read', label: 'نمای سند', level: 1 },
  { key: 'context.canvas', label: 'نمای بوم', level: 1 },
  { key: 'context.table', label: 'نمای جدول', level: 3 },
  { key: 'dialog.record', label: 'ثبت دانش', level: 1 },
  { key: 'dialog.ai-request', label: 'درخواست برای AI', level: 1 },
  { key: 'dialog.search', label: 'جستجوی سراسری', level: 1 },
  { key: 'dialog.quickstart', label: 'شروع سریع', level: 1 },
  { key: 'dialog.packs', label: 'بسته‌های دانش', level: 2 },
  { key: 'dialog.import', label: 'وارد کردن پاسخ AI', level: 2 },
  { key: 'dialog.metrics', label: 'شاخص‌ها', level: 2 },
  { key: 'dialog.weekly', label: 'بازبینی هفتگی', level: 2 },
  { key: 'dialog.connect', label: 'اتصال AI (MCP)', level: 3 },
  { key: 'dialog.memory', label: 'وارد کردن حافظه', level: 3 },
  { key: 'action.record', label: 'دانش ثبت شد', level: 1 },
  { key: 'action.ai-copy', label: 'درخواست AI کپی شد', level: 1 },
  { key: 'action.ai-answer', label: 'درخواست AI همین‌جا جواب گرفت', level: 1 },
  { key: 'action.home-todo', label: 'یکی از کارهای خانه انجام شد', level: 1 },
  { key: 'action.accept-proposal', label: 'پیشنهاد تأیید شد', level: 2 },
  { key: 'action.mention-link', label: 'رابطه از ارجاع @ ساخته شد', level: 3 },
];
export const FEATURE_KEYS: ReadonlySet<string> = new Set(FEATURES.map((f) => f.key));
export const isFeatureKey = (k: unknown): k is string => typeof k === 'string' && FEATURE_KEYS.has(k);

export interface UsageRow { feature: string; count: number; lastAt: string }
export interface UsageSummaryRow extends FeatureInfo { count: number; lastAt?: string }

/** every catalog feature with its count (zero when never used), most used first; keys no longer in the catalog are left out */
export function summarizeUsage(rows: UsageRow[]): { used: UsageSummaryRow[]; unused: UsageSummaryRow[] } {
  const by = new Map(rows.map((r) => [r.feature, r]));
  const all: UsageSummaryRow[] = FEATURES.map((f) => ({ ...f, count: by.get(f.key)?.count ?? 0, ...(by.get(f.key) ? { lastAt: by.get(f.key)!.lastAt } : {}) }));
  return {
    used: all.filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    unused: all.filter((r) => r.count === 0).sort((a, b) => a.level - b.level || a.key.localeCompare(b.key)),
  };
}
