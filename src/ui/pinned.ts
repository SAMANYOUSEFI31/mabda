/**
 * What stays pinned while a page scrolls (layout.md «چه چیزی بالا می‌ماند»). The app's own bar (`data-sticky="app"`: the desktop top
 * bar, the phone top bar) is the only thing at the very top; a page's own bar (`data-sticky="secondary"`: the section path, the document
 * menu) pins UNDER it, never in its place. Their heights are measured here and given to CSS as --sticky-top and --sticky-secondary, so
 * nothing pinned covers another, and keyboard focus and anchors stop below them (scroll-padding). The phone's bottom bar is
 * measured too (--fixed-bottom-inset): focus and anchors stop above it, whatever its height with the system's home bar.
 * A bar stepping aside (`data-away`: the phone's top bar while she reads down) counts 0, so the page's bar moves up into its place.
 * Layers: the app's bars sit on --layer-chrome, above every page's own pinned bar (--layer-sticky). A page bar that has not stuck
 * yet is ordinary content: it scrolls under the phone's bottom bar like the text around it, never over it.
 */
export function installPinned(): () => void {
  if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return () => {};
  const root = document.documentElement;
  const visibleHeight = (sel: string, onlyPinned = false) => Math.max(0, ...[...document.querySelectorAll<HTMLElement>(sel)]
    .filter((e) => !e.closest('[inert]') && !e.hasAttribute('data-away') && (!onlyPinned || getComputedStyle(e).position === 'sticky'))
    .map((e) => e.getBoundingClientRect().height));
  let frame = 0;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty('--sticky-top', `${Math.round(visibleHeight('[data-sticky=app]'))}px`);
      root.style.setProperty('--sticky-secondary', `${Math.round(visibleHeight('[data-sticky=secondary]', true))}px`);
      root.style.setProperty('--fixed-bottom-inset', `${Math.round(visibleHeight('[data-sticky=app-bottom]'))}px`);
    });
  };
  const ro = new ResizeObserver(measure);
  const watch = () => { ro.disconnect(); document.querySelectorAll('[data-sticky]').forEach((e) => ro.observe(e)); measure(); };
  // bars come and go with pages: watch the document for new ones (cheap: only attribute-bearing nodes are observed)
  let pending = false;
  const mo = new MutationObserver(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; watch(); }); });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-away'] });
  window.addEventListener('resize', measure);
  watch();
  return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', measure); cancelAnimationFrame(frame); };
}
