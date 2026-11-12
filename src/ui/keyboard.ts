/**
 * The phone's on-screen keyboard (layout.md «صفحه‌کلید گوشی»). The layout viewport does not shrink when it opens (iOS), so a
 * full-height sheet would keep its top where the page was and the browser would push everything up to reach the field: the
 * field she is typing in slides out of view. Here the visible part (visualViewport) is given to CSS as --vv-h and --vv-top,
 * sheets are sized and placed by it, `data-keyboard` on <html> tells the bottom bar to step aside, and the focused field is
 * brought back into the visible part whenever that part changes.
 */
export function installKeyboard(): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};
  const root = document.documentElement;
  const typing = (e: Element | null) => !!e && ((e as HTMLElement).isContentEditable || (/^(INPUT|TEXTAREA)$/.test(e.tagName) && !/^(checkbox|radio|button|submit|file|range|color)$/.test((e as HTMLInputElement).type)));
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
      const open = window.innerHeight - vv.height > 120 && typing(document.activeElement);
      root.toggleAttribute('data-keyboard', open);
      // the field stays where she can see it: inside the visible part, not under the keyboard or above the top
      const a = document.activeElement as HTMLElement | null;
      if (open && a && typing(a)) {
        const r = a.getBoundingClientRect();
        if (r.top < vv.offsetTop || r.bottom > vv.offsetTop + vv.height) a.scrollIntoView({ block: 'nearest' });
      }
    });
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
  return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); cancelAnimationFrame(frame); };
}
