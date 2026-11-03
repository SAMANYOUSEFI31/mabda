/**
 * «ثبت دانش» defaults: the user only writes what is true; the kind of knowledge and its title are GUESSED from the text and shown as
 * editable choices (docs/design-principles.md → پیش‌فرض به‌جای پرسش). Pure; the guess never decides anything the user cannot change.
 *
 *   خط قرمز  — a prohibition: «هرگز»، «نباید»، «ممنوع»، «مجاز نیست»، «خط قرمز» (strong), or «نداریم / نمی‌دهیم …» (weak)
 *   تصمیم   — «تصمیم گرفتیم»، «انتخاب کردیم»، «قرار شد» …
 *   واقعیت  — everything else
 * A strong prohibition wins over a decision («تصمیم گرفتیم هرگز … نکنیم» is a red line); a decision wins over a weak negative
 * («تصمیم گرفتیم تخفیف ندهیم»); a weak negative alone is a red line («تخفیف نداریم»).
 */

import type { ContextType } from '../types';
import { normalizeFa } from './contextEngine';

export const TYPE_CHIP_FA: Record<ContextType, string> = { Fact: 'واقعیت', Decision: 'تصمیم', Constraint: 'خط قرمز' };

const STRONG = ['هرگز', 'نباید', 'ممنوع', 'مجاز نیست', 'خط قرمز', 'اجازه نداریم', 'نمی توانیم', 'نمیتوانیم', 'نبایستی'];
const DECISION = ['تصمیم گرفتیم', 'تصمیم گرفته ایم', 'تصمیم گرفتم', 'تصمیم داریم', 'تصمیم این است', 'انتخاب کردیم', 'انتخاب کرده ایم', 'برگزیدیم', 'قرار شد', 'قرار گذاشتیم', 'ترجیح دادیم', 'تصمیم ما'];
const WEAK = ['نداریم', 'ندارد', 'ندارم', 'نمی دهیم', 'نمیدهیم', 'نمی کنیم', 'نمیکنیم', 'نمی شود', 'نمیشود', 'نمی فروشیم', 'نمیفروشیم', 'نمی پذیریم', 'نمیپذیریم'];

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

/** the kind of knowledge this text most likely is (a short text with no marker is a fact) */
export function guessType(text: string): ContextType {
  const t = ` ${normalizeFa(text).replace(/[،؛.!؟?:()«»"']/g, ' ').replace(/\s+/g, ' ')} `;
  if (has(t, STRONG)) return 'Constraint';
  if (has(t, DECISION)) return 'Decision';
  if (has(t, WEAK)) return 'Constraint';
  return 'Fact';
}

const TITLE_MAX = 60;
export const FALLBACK_TITLE = 'دانش تازه';

/** a short title from the first sentence of the text (never cut in the middle of a word, no trailing punctuation) */
export function guessTitle(text: string): string {
  const firstLine = text.split('\n').map((l) => l.replace(/^[\s#>*\-•\d۰-۹.)]+/, '').trim()).find(Boolean) ?? '';
  const sentence = firstLine.split(/[.!؟?؛۔]\s|[.!؟?؛۔]$/)[0].trim();
  let t = sentence;
  if (t.length > TITLE_MAX) { const cut = t.slice(0, TITLE_MAX); const sp = cut.lastIndexOf(' '); t = (sp > TITLE_MAX * 0.5 ? cut.slice(0, sp) : cut).trim(); }
  t = t.replace(/[\s،؛:,\-–—]+$/, '').replace(/@«([^»]*)»/g, '$1').trim();
  return t || FALLBACK_TITLE;
}
