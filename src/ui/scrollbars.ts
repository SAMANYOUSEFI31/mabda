/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The scrollbar's visibility (layout.md «اسکرول و نوار اسکرول»): the bar's place is always kept by CSS; this only says when the thin
 * bar is drawn. While anything scrolls (wheel, trackpad, keys, dragging), when the mouse comes near the page's own bar, and for a
 * moment after a page opens, so she sees there is more below. Touch devices keep the system's overlay bars.
 */
export function installScrollbars(): () => void {
  const root = document.documentElement;
  let timer = 0;
  const show = (ms = 1200) => {
    root.setAttribute('data-scrolling', '');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => root.removeAttribute('data-scrolling'), ms);
  };
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

/** a page or view just opened: show the bar for a moment so its length is known */
export function flashScrollbar(): void {
  const root = document.documentElement;
  root.setAttribute('data-scrolling', '');
  window.setTimeout(() => root.removeAttribute('data-scrolling'), 1500);
}
