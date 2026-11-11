/**
 * «ثبت سریع»: قاعده‌های قطعی و خالصِ پشت پنجرهٔ ثبت سریع. هیچ AI و هیچ مسیر ذخیرهٔ موازی نیست؛ ذخیره از همان
 * مسیر «فکر تازه» (handleSaveThought / handleSaveThoughts ← یادداشت ← فکر) می‌گذرد.
 *
 * - `normalizeForDuplicate`: نرمال‌سازی ساده برای مقایسهٔ «دقیقاً یکسان» (یی/کاف عربی، نیم‌فاصله، اعراب، رقم، فاصله‌ها، نشانهٔ نوع).
 * - `findExactDuplicate`: آیا همین متن پیش‌تر ثبت شده؟ فقط یکسانیِ کامل پس از نرمال‌سازی؛ شباهت معنایی اینجا نیست
 *   (آن را فقط نقطهٔ اتصال `duplicate` در suggestionSlots می‌دهد و تا لایهٔ هوش خاموش است هیچ اثری ندارد).
 * - `defaultSectionFor`: بخش پیش‌فرض ثبت سریع = بخشی که کاربر همین الان در آن است؛ وگرنه «تازه‌ها» (بدون جا).
 */
import type { ContextObject, Thought, TreeNode } from '../types';
import { normalizeFa } from './contextEngine';

const DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/** نشانهٔ نوع ([ایده] …) و `\` پایان خط (اتصال خط‌های یک فکر) از متن مقایسه کنار می‌روند */
export function normalizeForDuplicate(text: string): string {
  return normalizeFa(
    text
      .replace(/\r/g, '')
      .replace(/^\s*\[[^\]]{1,20}\]\s*/, '')
      .replace(/\\[ \t]*(\n|$)/g, ' ')
      .replace(/[ـ‏‎]/g, '') // کشیده و نشانه‌های جهت
      .replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d),
  );
}

export interface ExactDuplicate { kind: 'thought' | 'object'; id: string; text: string }

/** فکرهای باز و دانش‌های فعال؛ حل‌شده/بایگانی‌شده «تکراری» حساب نمی‌شوند. متن خیلی کوتاه هرگز تکراری حساب نمی‌شود. */
export function findExactDuplicate(text: string, thoughts: Thought[], objects: ContextObject[]): ExactDuplicate | null {
  const key = normalizeForDuplicate(text);
  if (key.replace(/\s/g, '').length < 2) return null;
  for (const t of thoughts) {
    if (t.status !== 'open') continue;
    if (normalizeForDuplicate(t.text) === key) return { kind: 'thought', id: t.id, text: t.text };
  }
  for (const o of objects) {
    if (o.status === 'Archived' || o.status === 'Superseded') continue;
    if (normalizeForDuplicate(o.content) === key || normalizeForDuplicate(o.title) === key) return { kind: 'object', id: o.id, text: o.title };
  }
  return null;
}

/** بخش فعلی اگر هنوز در درخت هست؛ وگرنه '' یعنی «تازه‌ها» (جا بعداً مشخص می‌شود) */
export function defaultSectionFor(currentNodeId: string | null | undefined, nodes: TreeNode[]): string {
  return currentNodeId && nodes.some((n) => n.id === currentNodeId) ? currentNodeId : '';
}

/** رویدادی که هر جای برنامه (مثلاً پالت فرمان) برای باز کردن ثبت سریع می‌فرستد */
export const QUICK_CAPTURE_EVENT = 'mabda:quick-capture';
export function requestQuickCapture(text?: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT, { detail: { text } }));
}
