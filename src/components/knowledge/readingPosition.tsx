/**
 * Where she is in a long page, and how to get anywhere in it: one rule for «ساختار» and «سند» (docs/ux/decisions.md §۵۲).
 *
 * - The reading line is a quarter of the way down the READABLE part of the window (under --pin-top + --pin-sub), sliding to the
 *   bottom on the last screen: src/core/readingLine.ts (§۵۳ ۵). A fraction of the whole window ignored the pinned bars (a third of a
 *   phone); a line right under them (§۵۲) kept a passed section lit on a tall screen.
 * - A section she chose stays «اکنون» until she scrolls herself: a short last section never reaches the line.
 * - The scrubber: the sections as one line, each part as long as its section is on the page. It shows the shape of the whole and
 *   where she is in it (what a list of names cannot), and a drag along it moves through the page section by section, naming each.
 *   A tap jumps; the keyboard moves one section per arrow (WCAG 2.5.7: a drag always has a single-pointer and a key alternative).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../ui/format';
import { activeIndex, readingLineY } from '../../core/readingLine';

export interface ReadingItem { id: string; label: string; level: number }

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pinned = () => {
  const s = getComputedStyle(document.documentElement);
  return (parseFloat(s.getPropertyValue('--pin-top')) || 0) + (parseFloat(s.getPropertyValue('--pin-sub')) || 0);
};

export const useReadingPosition = (items: ReadingItem[], anchorOf: (id: string) => string, on = true) => {
  const [active, setActive] = useState<string | undefined>(items[0]?.id);
  const chosen = useRef<string | null>(null);
  useEffect(() => {
    if (!on || items.length === 0) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (chosen.current) { setActive(chosen.current); return; }
      const el = document.scrollingElement ?? document.documentElement;
      const line = readingLineY({ pinned: pinned(), viewport: window.innerHeight, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight });
      const tops = items.map((i) => document.getElementById(anchorOf(i.id))?.getBoundingClientRect().top ?? NaN);
      setActive(items[activeIndex(tops, line)].id);
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

/**
 * How far she is through the part being read, 0..1: from its heading to the next part's heading (the last part ends where the
 * content ends, `endId`, not at the page's end, so what follows the content (the «افزودن فایل» area, a footer) never counts).
 */
const progressIn = (items: ReadingItem[], k: number, anchorOf: (id: string) => string, endId?: string) => {
  const top = (id: string) => document.getElementById(anchorOf(id))?.getBoundingClientRect().top ?? NaN;
  const a = top(items[k]?.id ?? '');
  const endEl = endId ? document.getElementById(endId) : null;
  const b = k + 1 < items.length ? top(items[k + 1].id) : endEl ? endEl.getBoundingClientRect().bottom : (document.scrollingElement ?? document.documentElement).scrollHeight - window.scrollY;
  const el = document.scrollingElement ?? document.documentElement;
  const line = readingLineY({ pinned: pinned(), viewport: window.innerHeight, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight });
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.min(1, Math.max(0, (line - a) / (b - a)));
};

/**
 * «اکنون: …» over the scrubber line, as one control the height of a touch target: the name says where she is, the line shows where
 * that is in the whole. No extra height on a phone, no edge strip (a drag from a phone's edge is the system's «back»).
 * The line (decisions.md §۵۴ ۱۳): one EQUAL part per main section, like a segmented progress bar. Parts as long as their sections
 * made a crowded, uneven line (a short section was a sliver, the last one swallowed everything under the content); equal parts read
 * as «section 3 of 7» at a glance, and the part being read fills as she reads through it, so the shape of progress is still there.
 * Past 12 parts the gaps close (each part keeps a hairline), so a large tree stays one calm line.
 */
export const SectionScrubber: React.FC<{
  items: ReadingItem[]; active?: string; anchorOf: (id: string) => string;
  onGo: (id: string, opts: { instant?: boolean; focus?: boolean }) => void; label: string;
  /** what «اکنون» says when it is more than the part's name (the structure: the path of the section being read) */
  now?: string; nowFull?: string;
  /** the element whose bottom ends the last part (the content's own end) */
  endId?: string;
}> = ({ items, active, anchorOf, onGo, label, now, nowFull, endId }) => {
  const [preview, setPreview] = useState<number | null>(null);
  const [fill, setFill] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, items.findIndex((i) => i.id === active));
  useEffect(() => {
    let raf = 0;
    const m = () => { raf = 0; setFill(progressIn(items, idx, anchorOf, endId)); };
    const on = () => { if (!raf) raf = requestAnimationFrame(m); };
    m();
    window.addEventListener('scroll', on, { passive: true, capture: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [items, idx, anchorOf, endId]);
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
  const dense = items.length > SPACED_UP_TO;
  return (
    <div
      role="slider" tabIndex={0} aria-label={label} aria-orientation="horizontal"
      aria-valuemin={1} aria-valuemax={items.length} aria-valuenow={shown + 1} aria-valuetext={preview === null && nowFull ? nowFull : cur?.label}
      data-testid="section-scrubber" data-scrubbing={preview !== null || undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
      className="flex min-h-touch min-w-space-0 flex-1 cursor-pointer touch-pan-y select-none flex-col justify-center gap-stack-xs rounded-control-sm px-inset-xs outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <p className={`body-sm truncate ${preview !== null ? 'text-text-default' : 'text-text-subtle'}`} aria-hidden="true">
        {preview !== null ? `${formatPos(shown + 1, items.length)} · ${cur?.label ?? ''}` : `اکنون: ${now || cur?.label || ''}`}
      </p>
      <div ref={track} className={`flex h-space-1 items-stretch ${dense ? 'gap-space-0' : 'gap-space-1'}`} aria-hidden="true">
        {items.map((i, k) => (
          <span
            key={i.id}
            data-part=""
            style={{ flexGrow: 1, flexBasis: 0 }}
            className={`relative min-w-space-0 overflow-hidden rounded-control-sm ${dense && k > 0 ? 'border-s border-surface-page' : ''} ${k < shown ? 'bg-icon-subtle' : 'bg-border-default'}`}
          >
            {k === shown && <span className="absolute inset-y-0 start-0 bg-bg-neutral-bold" style={{ inlineSize: preview !== null ? '100%' : `${Math.max(8, Math.round(fill * 100))}%` }} />}
          </span>
        ))}
      </div>
    </div>
  );
};
/** up to this many parts keep a gap between them; more, and they touch (a hairline each), so the line stays calm */
const SPACED_UP_TO = 12;
const formatPos = (n: number, of: number) => `${formatNumber(n)} از ${formatNumber(of)}`;
