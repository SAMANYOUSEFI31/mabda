/**
 * What stays pinned while a page scrolls (layout.md «چه چیزی بالا می‌ماند»). The app's own bar (`data-pin="app"`: the desktop top
 * bar, the phone top bar) is the only thing at the very top; a page's own bar (`data-pin="sub"`: the section path, the document
 * menu) pins UNDER it, never in its place. Their heights are measured here and given to CSS as --pin-top and --pin-sub, so
 * nothing pinned covers another, and keyboard focus and anchors stop below them (scroll-padding).
 */
export function installPinned(): () => void {
  if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return () => {};
  const root = document.documentElement;
  const visibleHeight = (sel: string, onlyPinned = false) => Math.max(0, ...[...document.querySelectorAll<HTMLElement>(sel)]
    .filter((e) => !e.closest('[inert]') && (!onlyPinned || getComputedStyle(e).position === 'sticky'))
    .map((e) => e.getBoundingClientRect().height));
  let frame = 0;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty('--pin-top', `${Math.round(visibleHeight('[data-pin=app]'))}px`);
      root.style.setProperty('--pin-sub', `${Math.round(visibleHeight('[data-pin=sub]', true))}px`);
    });
  };
  const ro = new ResizeObserver(measure);
  const watch = () => { ro.disconnect(); document.querySelectorAll('[data-pin]').forEach((e) => ro.observe(e)); measure(); };
  // bars come and go with pages: watch the document for new ones (cheap: only attribute-bearing nodes are observed)
  let pending = false;
  const mo = new MutationObserver(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; watch(); }); });
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', measure);
  watch();
  return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', measure); cancelAnimationFrame(frame); };
}
