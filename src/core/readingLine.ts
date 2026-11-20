/**
 * Which section is «اکنون» on a long page (decisions.md §۵۲, revised §۵۳ ۵). One rule for «سند» and «ساختار», at every width.
 *
 * The reading line sits a QUARTER of the way down the readable part of the window (the window minus the bars pinned at the top).
 * That is where the eye is after a scroll: the heading of what she is reading has just entered the upper quarter; the line right
 * under the bars (§۵۲) kept the previous section lit on a tall screen while two or three later sections were already in full view.
 * A jump still lands its heading at the top of the readable part, above the line, so a chosen section is «اکنون» at once.
 *
 * On the last screen the line slides down with the scroll, from its place to the window's bottom edge, so every section, however
 * short the last ones are, becomes «اکنون» on the way, one after another, and the last one at the very end. Forcing the last
 * section at the bottom (as before) skipped the short sections above it.
 */
export interface ReadingGeometry {
  /** height of what is pinned at the top of the window (the app bar, the page's own sticky bar) */
  pinned: number;
  /** the window's height */
  viewport: number;
  scrollTop: number;
  scrollHeight: number;
}

/** the share of the readable height above the line */
export const READING_FRACTION = 0.25;
/** never closer to the bars than this: a jump lands a heading 8px under them */
const MIN_GAP = 12;

/** the reading line, in window coordinates (px from the window's top edge) */
export function readingLineY(g: ReadingGeometry): number {
  const readable = Math.max(0, g.viewport - g.pinned);
  const base = g.pinned + Math.max(MIN_GAP, readable * READING_FRACTION);
  const maxScroll = Math.max(0, g.scrollHeight - g.viewport);
  if (maxScroll <= 0) return base;
  // the last screen of scrolling (or all of it, on a page shorter than two screens)
  const start = Math.max(0, maxScroll - readable);
  const t = maxScroll > start ? Math.min(1, Math.max(0, (g.scrollTop - start) / (maxScroll - start))) : 0;
  return base + (g.viewport - base) * t;
}

/** the index of the section whose heading has passed the line: the last heading at or above it (the first when none has) */
export function activeIndex(headingTops: number[], line: number): number {
  let cur = 0;
  headingTops.forEach((top, i) => { if (Number.isFinite(top) && top <= line) cur = i; });
  return cur;
}
