/**
 * The phone's on-screen keyboard (layout.md «صفحه‌کلید گوشی»), the same on every phone and browser.
 *
 * Browsers disagree on what the keyboard does to the page: iOS Safari keeps the layout viewport and shrinks only the visible
 * part (visualViewport), Android Chrome with `interactive-widget=resizes-content` (index.html) shrinks both, and each of
 * them scrolls the page by its own rules when a field takes focus (iOS scrolls the window even under a fixed sheet).
 * So nothing here relies on one browser's behaviour. Three facts are read from the one API they all share (visualViewport):
 *   1. the visible part → CSS `--vv-h` / `--vv-top`: sheets are sized and placed inside it;
 *   2. whether a keyboard is up → `data-keyboard` on <html>: the bottom bar steps aside. «Up» = the visible part is clearly
 *      shorter than the tallest it has been at this width (not window.innerHeight, which shrinks with it on Android);
 *   3. where the focused field is → it is brought inside the visible part by scrolling ITS OWN scroll container (a sheet's
 *      body, or the page), never with scrollIntoView, which on iOS also scrolls the window and moves a fixed sheet away.
 * Fact 3 is checked on focus, on every change of the visible part, and once more after the keyboard has settled
 * (iOS reports its size in steps while the keyboard slides in).
 */
const MARGIN = 12;

const typing = (e: Element | null): e is HTMLElement =>
  !!e && ((e as HTMLElement).isContentEditable || (/^(INPUT|TEXTAREA)$/.test(e.tagName) && !/^(checkbox|radio|button|submit|file|range|color)$/.test((e as HTMLInputElement).type)));

/** the nearest ancestor that scrolls vertically; null = the page itself (stops at a fixed layer: past it, nothing moves the field) */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1) return a;
    if (cs.position === 'fixed') return null;
  }
  return null;
}

/**
 * How far the container must scroll so the field sits inside `band` (pure, tested). A field taller than the band shows its top
 * part (where a short text and the caret of a new one are). Positive = scroll down.
 */
export function shiftInto(field: { top: number; bottom: number }, band: { top: number; bottom: number }): number {
  const room = band.bottom - band.top;
  if (room <= 0) return 0;
  const shown = Math.min(field.bottom - field.top, room);
  if (field.top < band.top) return field.top - band.top;
  if (field.top + shown > band.bottom) return field.top + shown - band.bottom;
  return 0;
}

export function installKeyboard(): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};
  const root = document.documentElement;
  let frame = 0;
  let settle = 0;
  // the height with no keyboard: the tallest visible part seen at this width (turning the phone starts it again)
  let full = 0, fullAt = 0;

  const bring = () => {
    const a = document.activeElement;
    if (!typing(a) || !root.hasAttribute('data-keyboard')) return;
    const box = scroller(a);
    // the visible band: the visible part of the screen, cut by the container's own box (a sheet's pinned head and foot stay out)
    let top = vv.offsetTop + MARGIN, bottom = vv.offsetTop + vv.height - MARGIN;
    if (box) { const b = box.getBoundingClientRect(); top = Math.max(top, b.top + MARGIN); bottom = Math.min(bottom, b.bottom - MARGIN); }
    else {
      // the page: its sticky top bar covers the first rows
      // (--pin-top: the tallest visible app bar, measured in pinned.ts; a hidden one counts 0)
      const bar = parseFloat(getComputedStyle(root).getPropertyValue('--pin-top')) || 0;
      top = Math.max(top, vv.offsetTop + bar + MARGIN);
    }
    const r = a.getBoundingClientRect();
    const d = shiftInto({ top: r.top, bottom: r.bottom }, { top, bottom });
    if (Math.abs(d) < 1) return;
    if (box) box.scrollTop += d;
    else window.scrollBy(0, d);
  };

  let up = false, keptY = 0, track = 0, trackUntil = 0;
  const sync = () => {
    if (Math.round(vv.width) !== fullAt) { fullAt = Math.round(vv.width); full = 0; }
    full = Math.max(full, vv.height, window.innerHeight);
    const now = full - vv.height > 120 && typing(document.activeElement);
    // the visible part is given to CSS only while the keyboard is up. With it down a sheet takes the whole screen (100dvh, from
    // the top): iOS 26 can leave visualViewport 24px short, or offset, after the keyboard closes (WebKit 297779), and a sheet
    // that followed it would stop short of the bottom with the page showing under it
    if (now) {
      root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    } else { root.style.removeProperty('--vv-h'); root.style.removeProperty('--vv-top'); }
    root.toggleAttribute('data-keyboard', now);
    if (now !== up) {
      up = now;
      // the keyboard went down: iOS scrolled the window to show the field and leaves it there, past the page's end (an empty
      // band under the content) or, under a sheet, somewhere else on the page. Put the page back where she left it
      if (!now) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const y = document.querySelector('.mb-dialog-layer:not(.is-inline)') ? keptY : Math.min(window.scrollY, Math.max(0, max));
        if (Math.abs(window.scrollY - y) > 1) window.scrollTo(window.scrollX, y);
      }
    }
  };
  // while the keyboard slides (iOS reports it in steps, Android every frame) the sheet follows it frame by frame, not one
  // event late: that late frame is the gap with the page showing between the sheet and the keyboard
  const follow = (ms: number) => {
    trackUntil = performance.now() + ms;
    if (track) return;
    const step = () => { sync(); bring(); track = performance.now() < trackUntil ? requestAnimationFrame(step) : 0; };
    track = requestAnimationFrame(step);
  };
  const update = (e?: Event) => {
    if (e?.type === 'focusin' && !up && typing(e.target as Element)) keptY = window.scrollY;
    sync();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      sync();
      // after the new size is laid out (the sheet follows --vv-h in this frame), then once more when the keyboard has settled
      requestAnimationFrame(bring);
      clearTimeout(settle);
      settle = window.setTimeout(() => { sync(); bring(); }, 350);
    });
    if (e?.type === 'focusin' || e?.type === 'focusout') follow(700);
  };
  // A field focused while its sheet is still sliding in (autofocus, or focus a frame after opening) sits low on the screen at
  // that moment, so the browser scrolls the page and the sheet's body to «show» it, and they stay scrolled when the sheet has
  // arrived: the page jumps, and the field ends under the sheet's head. Such a field is focused without that scroll (the
  // keyboard code above brings it into view itself), and on a touch screen the sheet arrives with a short fade instead of the
  // slide, so the one movement she sees is the keyboard's (motion.md «یک حرکت در یک زمان»)
  const proto = HTMLElement.prototype;
  const focus = proto.focus;
  proto.focus = function (this: HTMLElement, opts?: FocusOptions) {
    const sheet = typing(this) ? this.closest<HTMLElement>('.mb-dialog-layer:not(.is-inline) .mb-dialog') : null;
    if (!sheet) return focus.call(this, opts);
    const sliding = sheet.getAnimations?.().filter((a) => a.playState === 'running') ?? [];
    if (sliding.length && matchMedia('(pointer: coarse)').matches) {
      sliding.forEach((a) => a.cancel());
      const cs = getComputedStyle(root);
      sheet.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: parseFloat(cs.getPropertyValue('--duration-fast')) || 150, easing: cs.getPropertyValue('--ease-enter').trim() || 'linear' });
    }
    return focus.call(this, { ...opts, preventScroll: true });
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
  return () => {
    vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update);
    document.removeEventListener('focusin', update); document.removeEventListener('focusout', update);
    cancelAnimationFrame(frame); cancelAnimationFrame(track); clearTimeout(settle); proto.focus = focus;
  };
}
