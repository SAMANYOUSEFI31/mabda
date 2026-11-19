/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Tour, markTourDone, tourDue } from '../../ui';
import type { TourStep } from '../../ui';

/**
 * The first-visit walk (decisions.md §۴۸): five stops, in the order of the product's one loop — write it down (فکر), confirm it
 * (حقیقت), use it (خروجی), keep it current (قدیمی) — then where help lives. Each stop lights a control that already says its own
 * name; the sentence says what it is FOR. Shown once on this device; «گشت کوتاه» in the account menu shows it again.
 */
const navButton = (label: string) => () => {
  const all = document.querySelectorAll<HTMLElement>('nav[aria-label="بخش‌های اصلی نرم‌افزار"] button, nav[aria-label="منوی پایینی موبایل"] button');
  for (const b of all) {
    const r = b.getBoundingClientRect();
    if (r.width > 0 && ((b.getAttribute('aria-label') ?? '').startsWith(label) || (b.textContent ?? '').trim().startsWith(label))) return b;
  }
  return null;
};
const firstShown = (selector: string) => () => [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0) ?? null;

export const WELCOME_STEPS: TourStep[] = [
  { find: firstShown('[aria-keyshortcuts="N"], [data-testid="quick-capture-fab"]'), title: 'هرچه در ذهنت است', body: 'هر وقت چیزی به ذهنت رسید، «افزودن» همیشه همین‌جاست. اول «فکر» می‌شود: لازم نیست درست یا کامل باشد، و جایش را بعد هم می‌شود عوض کرد.' },
  { find: navButton('فکر'), title: 'فکر', body: 'ایده‌ها، سؤال‌ها، فرض‌ها و پیشنهادها اینجا می‌مانند. هیچ‌کدام به خروجی نمی‌رود تا خودت تأییدش کنی.' },
  { find: navButton('حقیقت'), title: 'حقیقت', body: 'آنچه تأیید کرده‌ای، در درختی از بخش‌ها: منبع هر خروجی. «نمای کلی» نشان می‌دهد چه چیزی به چه چیزی تکیه دارد.' },
  { find: navButton('خروجی'), title: 'خروجی‌ها', body: 'متن‌هایی که از حقیقت ساخته‌ای. هر کدام می‌داند از کدام نسخه ساخته شده؛ اگر آن حقیقت عوض شود، «قدیمی» علامت می‌خورد.' },
  { find: firstShown('[aria-label^="حساب کاربری"]'), title: 'هر وقت لازم شد', body: 'این گشت را از منوی حساب دوباره ببین. ⓘ کنار واژه‌های تازه می‌گوید هرکدام چیست؛ اگر دیگر لازمش نداری، همان‌جا خاموشش کن.' },
];

export function WelcomeTour({ request }: { /** a number that changes when the person asks to see it again */ request: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (tourDue()) { const t = window.setTimeout(() => setOpen(true), 900); return () => window.clearTimeout(t); } return undefined; }, []);
  useEffect(() => { if (request) setOpen(true); }, [request]);
  return <Tour steps={WELCOME_STEPS} open={open} onClose={() => { markTourDone(); setOpen(false); }} />;
}
