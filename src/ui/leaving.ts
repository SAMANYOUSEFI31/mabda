import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * A row that leaves a list (motion.md «حذف و بایگانی ردیف» and «تأیید: پیشنهاد ← حقیقت»): «برو، بعد جا را ببند». The row stays a
 * moment longer than the data that held it: it fades, and half-way through the fade the gap it leaves closes, so the rows under it
 * slide up instead of jumping. Total ≤ 360ms after an optional pause (`delay`) that lets the row first show what happened to it
 * (its dot settling into «حقیقت»). While it leaves it is inert: no click lands on something that is going.
 *
 * Interruptible (motion.md «قطع و ادامه»): if the item comes back (an optimistic change rolled back), its leave is cancelled where
 * it is and the row is simply there again. «کاهش حرکت»: only the fade; the gap closes at once.
 */
export interface Leaving<T> { item: T; key: string; leaving: boolean; /** just added by a person (one or two new rows, not a filter): give it `mb-appear` */ entering: boolean }

const reduced = () => typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduced'
  || (document.documentElement.dataset.motion !== 'full' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
const ms = (el: Element, token: string, fallback: number) => {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(token));
  return Number.isFinite(v) ? v : fallback;
};

/** run the leave on one element; resolves when it is over (or at once without the Web Animations API, e.g. a test DOM) */
export function leave(el: HTMLElement, { delay = 0 }: { delay?: number } = {}): Promise<void> {
  if (typeof el.animate !== 'function') return Promise.resolve();
  const fade = ms(el, '--duration-fast', 140), close = ms(el, '--duration-base', 200);
  const parent = el.parentElement;
  const gap = parent ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
  const h = el.getBoundingClientRect().height;
  el.setAttribute('inert', '');
  el.style.overflow = 'clip';
  const easeStd = getComputedStyle(el).getPropertyValue('--ease-standard').trim() || 'linear';
  const easeExit = getComputedStyle(el).getPropertyValue('--ease-exit').trim() || 'linear';
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fade, delay, easing: easeExit, fill: 'forwards' });
  if (reduced()) return a.finished.then(() => undefined, () => undefined);
  const b = el.animate(
    [{ blockSize: `${h}px`, marginBlockEnd: '0px', paddingBlock: getComputedStyle(el).paddingBlock },
      { blockSize: '0px', marginBlockEnd: `${-gap}px`, paddingBlock: '0px' }],
    { duration: close, delay: delay + fade / 2, easing: easeStd, fill: 'forwards' },
  );
  return Promise.all([a.finished, b.finished]).then(() => undefined, () => undefined);
}

/**
 * The list to render: today's items in their order, plus the ones that just left at the place they were, marked `leaving`.
 * `latest` lets a leaving row show its new state (an approved proposal draws its dot as truth while it goes).
 * Give each row `ref={rowRef(key)}`.
 */
export function useLeaving<T>(items: T[], keyOf: (t: T) => string, opts: { delay?: (item: T) => number; latest?: (key: string) => T | undefined } = {}) {
  const prev = useRef<{ list: Leaving<T>[]; seen: Set<string> | null; entering: Set<string> }>({ list: [], seen: null, entering: new Set() });
  const [, bump] = useState(0);
  const gone = useRef(new Set<string>());
  const els = useRef(new Map<string, HTMLElement>());
  const started = useRef(new Set<string>());
  const optsRef = useRef(opts); optsRef.current = opts;

  const now = new Set(items.map(keyOf));
  // «جا باز کن، بعد بیا»: a row added now (not on the first render, and not a whole new set after a filter) fades in 4px
  const seen = prev.current.seen;
  const keys = items.map(keyOf);
  // a row whose key changed in place (an optimistic row replaced by the stored one: same place, new id) is the same row: it neither
  // leaves nor enters
  const replaced = new Set<string>();
  prev.current.list.forEach((row, i) => { if (!row.leaving && !now.has(row.key) && keys[i] !== undefined && seen && !seen.has(keys[i])) { replaced.add(row.key); replaced.add(keys[i]); } });
  const fresh = seen ? keys.filter((k) => !seen.has(k) && !replaced.has(k)) : [];
  const entering = fresh.length > 0 && fresh.length <= 2 ? new Set([...prev.current.entering, ...fresh]) : prev.current.entering;
  const out: Leaving<T>[] = items.map((item) => { const key = keyOf(item); return { item, key, leaving: false, entering: entering.has(key) }; });
  // put back, at their old place, the rows that were here and are not any more (unless their leave already finished)
  // one or two rows going is something a person did to them; many at once is a filter or a new set, which changes without motion
  const vanished = prev.current.list.filter((row) => !row.leaving && !now.has(row.key) && !replaced.has(row.key));
  if (vanished.length > 2) vanished.forEach((row) => gone.current.add(row.key));
  prev.current.list.forEach((row, i) => {
    if (now.has(row.key) || gone.current.has(row.key) || replaced.has(row.key)) return;
    const item = optsRef.current.latest?.(row.key) ?? row.item;
    out.splice(Math.min(i, out.length), 0, { item, key: row.key, leaving: true, entering: false });
  });
  for (const k of now) gone.current.delete(k); // a key that is back is no longer gone
  useLayoutEffect(() => {
    prev.current.list = out;
    prev.current.seen = new Set([...(prev.current.seen ?? []), ...now]);
    prev.current.entering = entering;
    // a leave that had started for a row that is back is undone where it is
    for (const k of now) {
      if (!started.current.has(k)) continue;
      started.current.delete(k);
      const el = els.current.get(k);
      el?.getAnimations().forEach((a) => a.cancel());
      if (el) { el.removeAttribute('inert'); el.style.overflow = ''; }
    }
  });

  const rowRef = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el); else els.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    for (const row of out) {
      if (!row.leaving || started.current.has(row.key)) continue;
      const el = els.current.get(row.key);
      if (!el) { gone.current.add(row.key); continue; }
      started.current.add(row.key);
      void leave(el, { delay: optsRef.current.delay?.(row.item) ?? 0 }).then(() => {
        if (!started.current.has(row.key)) return; // it came back meanwhile
        started.current.delete(row.key);
        gone.current.add(row.key);
        bump((n) => n + 1);
      });
    }
  });

  return { rows: out, rowRef };
}
