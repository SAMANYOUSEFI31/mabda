/**
 * Where she is in a long page, and how to get anywhere in it: one rule for «ساختار» and «سند» (docs/ux/decisions.md §۵۲).
 *
 * - The reading line is just under everything pinned at the top (--pin-top + --pin-sub, the same line the page's scroll-padding
 *   lands a jump on): the section whose heading has passed it is «اکنون». A fraction of the window ignored the pinned bars, which
 *   take a third of a phone by themselves.
 * - A section she chose stays «اکنون» until she scrolls herself: a short last section never reaches the line.
 * - The scrubber: the sections as one line, each part as long as its section is on the page. It shows the shape of the whole and
 *   where she is in it (what a list of names cannot), and a drag along it moves through the page section by section, naming each.
 *   A tap jumps; the keyboard moves one section per arrow (WCAG 2.5.7: a drag always has a single-pointer and a key alternative).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../ui/format';

export interface ReadingItem { id: string; label: string; level: number }

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pinned = () => {
  const s = getComputedStyle(document.documentElement);
  return (parseFloat(s.getPropertyValue('--pin-top')) || 0) + (parseFloat(s.getPropertyValue('--pin-sub')) || 0);
};
/** the line under the pinned bars where content becomes readable */
export const readingLine = () => pinned() + 12; // a jump lands its heading at +8 (scroll-padding); 4px for rounding

export const useReadingPosition = (items: ReadingItem[], anchorOf: (id: string) => string, on = true) => {
  const [active, setActive] = useState<string | undefined>(items[0]?.id);
  const chosen = useRef<string | null>(null);
  useEffect(() => {
    if (!on || items.length === 0) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (chosen.current) { setActive(chosen.current); return; }
      const line = readingLine();
      let cur = items[0].id;
      for (const i of items) { const el = document.getElementById(anchorOf(i.id)); if (el && el.getBoundingClientRect().top <= line) cur = i.id; }
      const el = document.scrollingElement ?? document.documentElement;
      if (el.scrollTop + window.innerHeight >= el.scrollHeight - 2 && el.scrollTop > 0) cur = items[items.length - 1].id;
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const own = () => { chosen.current = null; };
    const ownKey = (e: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key) && !(e.target as HTMLElement)?.closest?.('[role=slider]')) own(); };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', own, { passive: true });
    window.addEventListener('touchmove', own, { passive: true });
    window.addEventListener('keydown', ownKey);
    measure();
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); window.removeEventListener('wheel', own); window.removeEventListener('touchmove', own); window.removeEventListener('keydown', ownKey); if (raf) cancelAnimationFrame(raf); };
  }, [items, anchorOf, on]);

  /** brings a section's heading just under the pinned bars; `instant` while scrubbing (the page follows the finger) */
  const goTo = useCallback((id: string, opts: { instant?: boolean; focus?: boolean } = {}) => {
    const el = document.getElementById(anchorOf(id));
    if (!el) return false;
    const top = el.getBoundingClientRect().top + window.scrollY - pinned() - 8;
    chosen.current = id;
    window.scrollTo({ top: Math.max(0, top), behavior: opts.instant || reduceMotion() ? 'auto' : 'smooth' });
    if (opts.focus !== false) el.focus({ preventScroll: true });
    setActive(id);
    return true;
  }, [anchorOf]);
  return { active, goTo };
};

/** how long each section is on the page now (heading to next heading), for the scrubber's parts */
const weightsOf = (items: ReadingItem[], anchorOf: (id: string) => string) => {
  const tops = items.map((i) => { const el = document.getElementById(anchorOf(i.id)); return el ? el.getBoundingClientRect().top + window.scrollY : NaN; });
  const end = (document.scrollingElement ?? document.documentElement).scrollHeight;
  return tops.map((t, k) => { const next = tops.slice(k + 1).find((x) => !Number.isNaN(x)) ?? end; return Number.isNaN(t) ? 1 : Math.max(1, next - t); });
};

/**
 * «اکنون: …» over the scrubber line, as one control the height of a touch target: the name says where she is, the line shows where
 * that is in the whole. No extra height on a phone, no edge strip (a drag from a phone's edge is the system's «back»).
 */
export const SectionScrubber: React.FC<{
  items: ReadingItem[]; active?: string; anchorOf: (id: string) => string;
  onGo: (id: string, opts: { instant?: boolean; focus?: boolean }) => void; label: string;
}> = ({ items, active, anchorOf, onGo, label }) => {
  const [weights, setWeights] = useState<number[]>(() => items.map(() => 1));
  const [preview, setPreview] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const m = () => setWeights(weightsOf(items, anchorOf));
    m();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m()) : null;
    ro?.observe(document.body);
    return () => ro?.disconnect();
  }, [items, anchorOf]);
  const idx = Math.max(0, items.findIndex((i) => i.id === active));
  const shown = preview ?? idx;
  /** the part under the finger; past either end, the end part */
  const at = (x: number) => {
    const parts = [...(track.current?.children ?? [])] as HTMLElement[];
    let best = 0, dist = Infinity;
    parts.forEach((p, k) => { const r = p.getBoundingClientRect(); const a = r.x, b = r.x + r.width; const d = x < a ? a - x : x > b ? x - b : 0; if (d < dist) { dist = d; best = k; } });
    return best;
  };
  const go = (k: number, final: boolean) => { const i = items[Math.min(items.length - 1, Math.max(0, k))]; if (i) onGo(i.id, { instant: !final, focus: final }); };
  const down = (e: React.PointerEvent) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const k = at(e.clientX); setPreview(k); go(k, false); };
  const move = (e: React.PointerEvent) => { if (preview === null) return; const k = at(e.clientX); if (k !== preview) { setPreview(k); go(k, false); } };
  const up = () => { if (preview === null) return; const k = preview; setPreview(null); go(k, true); };
  // RTL: the page starts at the right, so «next» is the left arrow; up/down follow the page
  const key = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1, PageDown: 3, PageUp: -3 };
    const k = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key in step ? idx + step[e.key] : null;
    if (k === null) return;
    e.preventDefault();
    go(k, false);
  };
  const cur = items[shown];
  return (
    <div
      role="slider" tabIndex={0} aria-label={label} aria-orientation="horizontal"
      aria-valuemin={1} aria-valuemax={items.length} aria-valuenow={shown + 1} aria-valuetext={cur?.label}
      data-testid="section-scrubber" data-scrubbing={preview !== null || undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
      className="flex min-h-touch min-w-space-0 flex-1 cursor-pointer touch-pan-y select-none flex-col justify-center gap-stack-xs rounded-control-sm px-inset-xs outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <p className={`body-sm truncate ${preview !== null ? 'text-text-default' : 'text-text-subtle'}`} aria-hidden="true">
        {preview !== null ? `${formatPos(shown + 1, items.length)} · ` : 'اکنون: '}{cur?.label}
      </p>
      <div ref={track} className="flex h-space-1 items-stretch gap-space-0" aria-hidden="true">
        {items.map((i, k) => (
          <span
            key={i.id}
            style={{ flexGrow: weights[k] ?? 1, flexBasis: 0 }}
            // a main section starts with a gap (the shape of the whole); its subsections touch, split by a hairline of page colour
            className={`min-w-space-0 ${k > 0 ? (i.level <= 1 ? 'ms-space-1' : 'border-s border-surface-page') : ''} ${k === shown ? 'bg-bg-neutral-bold' : k < shown ? 'bg-icon-subtle' : 'bg-border-default'} rounded-control-sm`}
          />
        ))}
      </div>
    </div>
  );
};
const formatPos = (n: number, of: number) => `${formatNumber(n)} از ${formatNumber(of)}`;
