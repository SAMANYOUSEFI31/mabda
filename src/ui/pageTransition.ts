/**
 * Going from one page to another (motion.md «رفتن بین صفحه‌ها»): where the browser has View Transitions, the old page fades out
 * (80) and then the new one fades in (140) in the same place, «fade through», so the words of two pages never sit on top of each
 * other; the bars are not part of it. Elsewhere the new page simply fades in (`.mb-page-enter`), as before.
 *
 * «قطع و ادامه»: a second switch while one is running ends the first at once (skipTransition), so nothing waits for a fade.
 * The update runs synchronously inside the browser's callback (flushSync), so the new page is what the browser captures.
 */
import { flushSync } from 'react-dom';

type ViewTransitionLike = { finished: Promise<void>; skipTransition: () => void };
type DocWithVT = Document & { startViewTransition?: (cb: () => void) => ViewTransitionLike };

/** the class a new page wears: the plain fade-in only where the browser has no View Transitions (otherwise the fade is the browser's,
 * and a CSS animation on the page would replay when the transition ends) */
export const pageEnterClass = typeof document !== 'undefined' && typeof (document as DocWithVT).startViewTransition === 'function' ? '' : 'mb-page-enter';

let running: ViewTransitionLike | null = null;

export function switchPage(update: () => void): void {
  const doc = document as DocWithVT;
  // a hidden tab (or a test without a screen) has nothing to show; the browser would skip it anyway
  if (typeof doc.startViewTransition !== 'function' || document.visibilityState !== 'visible') { update(); return; }
  running?.skipTransition();
  const root = document.documentElement;
  root.dataset.pageVt = '';
  const vt = doc.startViewTransition(() => { flushSync(update); });
  running = vt;
  const done = () => { if (running === vt) { running = null; delete root.dataset.pageVt; } };
  vt.finished.then(done, done);
}
