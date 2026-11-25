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
import { startTransition, useEffect, useRef } from 'react';

/**
 * Two kinds of switch, two movements (motion.md «رفتن بین صفحه‌ها» and «نمای صفحه»):
 *  · another PLACE (خانه، فکر، حقیقت، خروجی‌ها): the places are not side by side in any space, so nothing slides; the new page is
 *    laid down: it fades in and settles 4px («fade through» without the exit, so the press still answers at once).
 *  · another VIEW of the same place (ساختار / نمای کلی / سند / جدول، فهرست / بوم): the views ARE side by side, in the switch
 *    above them, so the new one comes in from the side of the key that was pressed, 24px, the same way the key's thumb glides
 *    («shared axis»). In RTL a key further to the left (later in the switch) brings its view in from the left.
 */
export const pageEnterClass = 'mb-page-enter';
export const viewEnterClass = 'mb-view-enter';

/** where the newly chosen view sits in the switch relative to the last one: `data-axis` for the keyed view area (none at first) */
export function useViewAxis<T extends string>(value: T, order: readonly T[]): 'fwd' | 'back' | undefined {
  const prev = useRef<T | null>(null);
  const last = useRef<'fwd' | 'back' | undefined>(undefined);
  if (prev.current !== null && prev.current !== value) {
    const d = order.indexOf(value) - order.indexOf(prev.current);
    last.current = d > 0 ? 'fwd' : d < 0 ? 'back' : last.current;
  }
  const axis = prev.current === null ? undefined : last.current;
  useEffect(() => { prev.current = value; });
  return axis;
}

/** the one door for a change of page or view, so the way it moves stays in this file */
export function switchPage(update: () => void): void {
  startTransition(update);
}
