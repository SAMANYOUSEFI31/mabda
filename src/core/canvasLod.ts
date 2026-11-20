/**
 * Semantic zoom of the canvas (docs/ux/decisions.md §۵۰). Every range is defined by what can be READ on screen, in CSS pixels, so the
 * same rule holds on every device; only the stage size (fit-all, the card's share of the width) differs between devices.
 *   far  — a card is too narrow on screen for a title (< ~100px): the overview draws one summary per row, the free canvas the section
 *          frames with their names; cards are shapes (and, with many in view, a cluster with a count)
 *   mid  — the card's marks and title, counter-scaled so they read at about their natural size on screen (never under
 *          MIN_SCREEN_TEXT); as many title lines as the card holds; below MID_MARKS_FROM the title alone; the summary waits for «near»
 *   near — the whole card at its natural size: marks, title, a short summary. The full text is in «جزئیات», never on the card
 * Edges follow the same rule: far draws only the emphasized ones. Pure.
 */

export type Lod = 'far' | 'mid' | 'near';
/** the smallest text the canvas ever draws, in screen px (the design system's caption size is the floor for readable text) */
export const MIN_SCREEN_TEXT = 13;
/** a card title's natural size (body-sm) */
export const TITLE_PX = 14;
/** below this a 220-wide card is under ~100px on screen: a 13px title would show one or two words a line */
export const LOD_FAR_BELOW = 0.45;
/** from here the card drawn as itself reads: its 14px title is ≥ 12.6px and its 12px chips ≥ 11px on screen */
export const LOD_NEAR_FROM = 0.9;
/** in «mid», from here the marks (type, status, red line) still fit above a title line once the card's content is counter-scaled */
export const MID_MARKS_FROM = 0.6;
/**
 * The first view of the overview and of «دور این مورد» (§۵۰, was 80٪ / 50٪): the widest view in which every card still shows its marks
 * (type, «پیشنهاد», red line: a proposal must never read as a fact) AND two lines of title. Below it a title loses its second line
 * (0.6) or its marks (under MID_MARKS_FROM); above it fewer columns fit, and the question of this view is how columns connect.
 */
export const FIRST_VIEW_K = 0.65;
/** zoomed out further than this, even the far summaries (two lines of 15px in the shortest row) no longer fit */
export const FAR_MIN_K = 0.25;
/** zoomed in past this the card only grows: its title is ~18px (comfortable reading) and no new information appears */
export const ZOOM_MAX = 1.25;

export function lodOf(k: number): Lod {
  return k < LOD_FAR_BELOW ? 'far' : k >= LOD_NEAR_FROM ? 'near' : 'mid';
}
export const LOD_FA: Record<Lod, string> = { far: 'دور', mid: 'متوسط', near: 'نزدیک' };

/** how much text inside the stage is enlarged at zoom k so it reads at MIN_SCREEN_TEXT or more (1 = natural size) */
export const readableScale = (k: number, natural = TITLE_PX): number => Math.max(1, MIN_SCREEN_TEXT / (natural * Math.max(k, 0.01)));
/** stage-px font size of text that must stay readable at zoom k: its natural size, or larger so it never reads under MIN_SCREEN_TEXT */
export const readablePx = (k: number, natural = TITLE_PX): number => Math.max(natural, MIN_SCREEN_TEXT / Math.max(k, 0.01));
/** how many lines of that text fit in `room` stage px (line height 1.5), between 1 and `most` */
export const linesThatFit = (room: number, px: number, most = 3): number => Math.max(1, Math.min(most, Math.floor(room / (px * 1.5))));

/**
 * «mid»: the card's content is counter-scaled (CSS zoom `s`) so its marks and title read at about their natural size on screen; the
 * title gets as many lines as the card still holds (`h` = card height in stage px; 16 = its padding, 30 = the marks row).
 */
export const midLayout = (k: number, h: number, marks: boolean) => {
  const s = readableScale(k);
  const room = (h - 16) / s - (marks ? 30 : 0);
  return { s, lines: linesThatFit(room, TITLE_PX) };
};

export interface ZoomRange { min: number; max: number; fit: number }
/**
 * The zoom range of a stage, from what each end is for:
 *  · out: to see the whole shape. Past «everything fits» nothing new appears, and past FAR_MIN_K the far summaries no longer fit, so
 *    the floor is a little under fit-all, never under FAR_MIN_K, and never above the near level (a small board can still step back);
 *  · in: to read a card. Past ZOOM_MAX nothing new appears; and a card wider than 60% of the stage hides where its lines go, so on a
 *    narrow stage (a phone) the ceiling is lower, never under 1 (the natural size).
 */
export function zoomRange(o: { stageW: number; stageH: number; contentW: number; contentH: number; cardW: number }): ZoomRange {
  const fit = Math.min((o.stageW - 32) / Math.max(o.contentW, 1), (o.stageH - 32) / Math.max(o.contentH, 1));
  const min = Math.min(LOD_NEAR_FROM, Math.max(FAR_MIN_K, fit * 0.9));
  const max = Math.min(ZOOM_MAX, Math.max(1, (0.6 * o.stageW) / o.cardW));
  return { min, max, fit };
}

/**
 * Keeps the board on screen: in each axis, a board smaller than the stage stays inside it, and a larger one never leaves more than
 * `margin` px of empty stage at either edge. Zooming out around the stage centre can no longer push the board off to one side.
 * `endInset` is room kept free at the far end of the x axis (the overview's pinned row labels).
 */
export function clampView(v: { x: number; y: number; k: number }, o: { stageW: number; stageH: number; contentW: number; contentH: number; marginX: number; marginY: number; endInset?: number }) {
  const axis = (pos: number, content: number, stage: number, margin: number) => {
    const c = content * v.k;
    const lo = stage - margin - c, hi = margin;
    // smaller than the stage: anywhere inside it; larger: no gap wider than the margin at either edge
    return c <= stage - 2 * margin ? Math.min(Math.max(pos, margin), stage - margin - c) : Math.min(Math.max(pos, lo), hi);
  };
  return { k: v.k, x: axis(v.x, o.contentW, o.stageW - (o.endInset ?? 0), o.marginX), y: axis(v.y, o.contentH, o.stageH, o.marginY) };
}

export interface Placed { id: string; x: number; y: number; w: number; h: number }
export interface Cluster { id: string; x: number; y: number; count: number; ids: string[] }

/**
 * Far view of a dense area: items whose centres fall into the same screen cell (`cellPx` at zoom `k`) become one cluster
 * with a count; a lone item stays an item (count 1). Cluster positions are the mean of their members, in stage coordinates.
 */
export function clusterItems(items: Placed[], k: number, cellPx = 36): Cluster[] {
  const cell = cellPx / Math.max(k, 0.01);
  const buckets = new Map<string, Placed[]>();
  for (const it of items) {
    const key = `${Math.floor((it.x + it.w / 2) / cell)}:${Math.floor((it.y + it.h / 2) / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(it); else buckets.set(key, [it]);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({
    id: list.length === 1 ? list[0].id : `cluster:${key}`,
    x: list.reduce((s, i) => s + i.x + i.w / 2, 0) / list.length,
    y: list.reduce((s, i) => s + i.y + i.h / 2, 0) / list.length,
    count: list.length,
    ids: list.map((i) => i.id).sort(),
  }));
}

/** how many edges are drawn at a level of detail (the emphasized ones always are) */
export const edgeBudget = (lod: Lod): number => (lod === 'far' ? 0 : lod === 'mid' ? 600 : 1200);
