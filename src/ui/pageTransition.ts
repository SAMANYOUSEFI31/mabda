/**
 * Going from one page to another (motion.md «رفتن بین صفحه‌ها», decisions.md §۵۷): «fade through». The page being left fades out
 * (exit = one step down, 80) and only then is the new one drawn, fading in (140) in the same place, so the words of two pages never
 * sit on top of each other. The bars are not part of it: they stay live and the indicator glides at once (AppNavigation).
 *
 * Plain CSS on the page area, not View Transitions: while a view transition runs, the browser hit-tests its picture of the page,
 * so every click and tap (a bar too) was lost for 300–500ms, and up to 1.4s on a mid-range phone after a heavy page. Here the page
 * being left only stops taking pointer events; everything else answers at once.
 *
 * «قطع و ادامه»: a second switch while the first is still leaving goes straight to the newest page, with no second fade.
 */

/** the class a new page wears: it fades in where it appears (the page area is keyed by the page, so it plays on every switch) */
export const pageEnterClass = 'mb-page-enter';

let pending: { timer: number; update: () => void } | null = null;

/** the length of the exit step, from the motion tokens (0 when «کاهش حرکت» asks for no wait) */
const exitMs = (el: Element): number => {
  const v = getComputedStyle(el).getPropertyValue('--duration-instant').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith('ms') ? n : n * 1000) : 80;
};

export function switchPage(update: () => void): void {
  const page = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('#main > .mb-page') : null;
  if (pending) {
    // a second switch during the exit: no second fade, the newest page comes now
    clearTimeout(pending.timer);
    pending = null;
    page?.removeAttribute('data-leaving');
    update();
    return;
  }
  // a hidden tab (or a test without a screen) has nothing to show
  if (!page || document.visibilityState !== 'visible') { update(); return; }
  page.setAttribute('data-leaving', '');
  const timer = window.setTimeout(() => {
    pending = null;
    page.removeAttribute('data-leaving');
    update();
  }, exitMs(page));
  pending = { timer, update };
}
