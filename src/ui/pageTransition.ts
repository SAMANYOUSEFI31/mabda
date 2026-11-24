/**
 * Going from one page to another (motion.md «رفتن بین صفحه‌ها»): the page being left goes at once and the new one fades in (140) in
 * the same place. Nothing waits for the old page, so every click answers immediately; the bars are not part of it and the
 * indicator glides at once (AppNavigation).
 *
 * Plain CSS on the page area, not View Transitions: while a view transition runs, the browser hit-tests its picture of the page,
 * so every click and tap was lost for 300–500ms (up to 1.4s on a mid-range phone after a heavy page).
 *
 * Provisional (docs/ux/taste-review.md «حرکت گذر صفحه»): fade-in only, chosen over «fade through» (an 80ms exit before the new page).
 */

/** the class a new page wears: it fades in where it appears (the page area is keyed by the page, so it plays on every switch) */
export const pageEnterClass = 'mb-page-enter';

/** kept as the one door for a page switch, so a later change to the motion stays in this file */
export function switchPage(update: () => void): void {
  update();
}
