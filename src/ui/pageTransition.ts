/**
 * Going from one page (or one view of a page) to another (motion.md «رفتن بین صفحه‌ها»): the place she asked for shows as chosen
 * on the press (the bars and the view switch keep their own «asked» state), the page she is leaving stays on screen and usable
 * while the new one is built, and the new one then fades in (140) in the same place. Nothing waits for the old page, nothing waits
 * behind a «loading» placeholder, and a second press while a page is still being built wins at once: the first build is dropped.
 *
 * How: the change runs as a React transition. A transition is built in small slices between frames, so the press paints first
 * (the measured freeze on a mid-range phone was 315–430ms before anything moved, audit round 4), and React keeps what is on screen
 * until the new page is ready. The page chunks are loaded ahead of time (src/app/lazy.tsx `warmChunks`), so a view that was
 * never opened does not show «در حال بار شدن…» either.
 *
 * Not View Transitions: while one runs the browser hit-tests its picture of the page, so every click and tap was lost for
 * 300–500ms (audit round 2).
 *
 * Provisional (docs/ux/taste-review.md «حرکت گذر صفحه»): fade-in only, chosen over «fade through» (an 80ms exit before the new page).
 */
import { startTransition } from 'react';

/** the class a new page or view wears: it fades in where it appears (the area is keyed, so it plays on every switch) */
export const pageEnterClass = 'mb-page-enter';

/** the one door for a change of page or view, so the way it moves stays in this file */
export function switchPage(update: () => void): void {
  startTransition(update);
}
