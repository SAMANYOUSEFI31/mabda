/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The scrollbar's visibility (layout.md «اسکرول و نوار اسکرول»): the bar's place is always kept by CSS; this only says when the thin
 * bar is drawn. While anything scrolls (wheel, trackpad, keys, dragging), when the mouse comes near the page's own bar, and for a
 * moment after a page opens, so she sees there is more below. Touch devices keep the system's overlay bars.
 */
let timer = 0;
function show(ms = 1200): void {
  const root = document.documentElement;
  root.setAttribute('data-scrolling', '');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => root.removeAttribute('data-scrolling'), ms);
}

export function installScrollbars(): () => void {
  const root = document.documentElement;
  const onScroll = () => show();
  // where the page's bar is: Chromium draws it on the right even in an RTL page, Firefox on the left; the reserved gutter
  // tells which (the body starts after it when it is on the left)
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const gutter = window.innerWidth - root.clientWidth;
    const onLeft = document.body.getBoundingClientRect().left >= gutter - 0.5 && gutter > 0 && document.body.getBoundingClientRect().left > 0;
    const near = gutter > 0 && (onLeft ? e.clientX <= gutter + 8 : e.clientX >= window.innerWidth - gutter - 8);
    if (near !== root.hasAttribute('data-scroll-near')) root.toggleAttribute('data-scroll-near', near);
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('pointermove', onMove, { passive: true });
  show(1500);
  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    document.removeEventListener('pointermove', onMove);
    window.clearTimeout(timer);
  };
}

/** a page or view just opened: show the bar for a moment so she sees how much is below (only when there is more than one screen) */
export function flashScrollbar(): void {
  if (typeof document === 'undefined') return;
  // after the new page has laid out
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const de = document.documentElement;
    if (de.scrollHeight > de.clientHeight + 1) show(1500);
  }));
}
