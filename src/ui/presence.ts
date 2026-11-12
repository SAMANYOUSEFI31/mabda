import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Enter and exit for things that leave the DOM (motion.md «پیاده‌سازی»): while `open` turns false the element stays mounted with
 * `data-state="closed"`, its exit animation runs, and it unmounts on `animationend` — never on a timer. With no exit animation
 * (a test DOM, an element without one) it unmounts at once. Reopening during the exit simply shows it open again.
 */
export function usePresence(open: boolean, ref: RefObject<HTMLElement | null>): { mounted: boolean; state: 'open' | 'closed' } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  useLayoutEffect(() => {
    if (open || !mounted) return;
    const el = ref.current;
    if (!el || typeof el.getAnimations !== 'function' || el.getAnimations().length === 0) { setMounted(false); return; }
    const done = (e: AnimationEvent) => { if (e.target === el) setMounted(false); };
    el.addEventListener('animationend', done);
    el.addEventListener('animationcancel', done);
    return () => { el.removeEventListener('animationend', done); el.removeEventListener('animationcancel', done); };
  }, [open, mounted, ref]);
  return { mounted: open || mounted, state: open ? 'open' : 'closed' };
}
