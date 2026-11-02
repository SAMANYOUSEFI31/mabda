/**
 * Edge routing for the canvas. Pure.
 *
 * What a drawn line must never do (the three faults of the old map):
 *  · hook — both ends leave from the same side, so two stacked cards got a loop. Here the two FACING sides are chosen:
 *    vertical (bottom → top) for cards stacked on each other, horizontal (end → start) for cards side by side.
 *  · cross a card — every segment is tested against the other cards; if the direct channel is blocked another channel
 *    is tried, and as a last resort the line goes around through a free corridor above or below them.
 *  · sit on another line — edges that share a card side get separate attachment slots, and two edges between the same
 *    pair of cards get separate lanes.
 * The path is orthogonal with rounded corners; `mid` is where a label chip sits and `endDir` the direction of the last
 * segment (the arrow always points INTO the influenced card — callers pass influencer first, influenced second).
 * Coordinates are plain numbers (e = larger x, s = larger y); nothing here knows about RTL.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
export type Side = 'n' | 's' | 'e' | 'w';

export interface RouteOptions {
  /** every other card (the two ends are ignored if they are in the list) */
  obstacles?: Rect[];
  /** parallel edges between the same two cards get lanes … -1, 0, 1 … (spacing apart) */
  lane?: number;
  /** offset of the attachment point along the side of the first / second card */
  slotA?: number;
  slotB?: number;
  /** distance kept from the cards (default 8) */
  clearance?: number;
}
export interface Route {
  sideA: Side;
  sideB: Side;
  start: Pt;
  end: Pt;
  points: Pt[];
  /** SVG path with rounded corners */
  d: string;
  /** a point halfway along the line (label anchor) */
  mid: Pt;
  /** unit direction of the last segment (into the second card) */
  endDir: Pt;
  length: number;
  /** the straight channel was blocked and the line goes around */
  detour: boolean;
}

export const LANE_SPACING = 12;
const STUB = 16;
const CORNER = 12;
const EDGE_MARGIN = 14; // an attachment point keeps this far from the corners of the side

const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const inflate = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const transposeRect = (r: Rect): Rect => ({ x: r.y, y: r.x, w: r.h, h: r.w });
const transposePt = (p: Pt): Pt => ({ x: p.y, y: p.x });

/** does the axis-aligned segment p→q pass through the interior of r? */
export function segmentHitsRect(p: Pt, q: Pt, r: Rect): boolean {
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
  return x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h;
}
export const pathHitsAny = (pts: Pt[], rects: Rect[]): boolean => {
  for (let i = 0; i < pts.length - 1; i++) for (const r of rects) if (segmentHitsRect(pts[i], pts[i + 1], r)) return true;
  return false;
};

/** which sides face each other */
export function facingSides(a: Rect, b: Rect): [Side, Side] {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const stacked = overlapX > Math.min(a.w, b.w) * 0.25; // share a column
  const beside = overlapY > Math.min(a.h, b.h) * 0.25;  // share a row
  const vertical = (): [Side, Side] => (a.y + a.h / 2 <= b.y + b.h / 2 ? ['s', 'n'] : ['n', 's']);
  const horizontal = (): [Side, Side] => (a.x + a.w / 2 <= b.x + b.w / 2 ? ['e', 'w'] : ['w', 'e']);
  if (stacked && !beside) return vertical();
  if (beside && !stacked) return horizontal();
  if (stacked && beside) return Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? horizontal() : vertical(); // overlapping cards: the longer axis
  // diagonal: leave along the axis with the larger gap, so the line has room for its bend
  const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  return gapX >= gapY ? horizontal() : vertical();
}

export function attachPoint(r: Rect, side: Side, slot = 0): Pt {
  const clampAlong = (len: number) => Math.max(-len / 2 + EDGE_MARGIN, Math.min(len / 2 - EDGE_MARGIN, slot));
  if (side === 'e') return { x: r.x + r.w, y: r.y + r.h / 2 + clampAlong(r.h) };
  if (side === 'w') return { x: r.x, y: r.y + r.h / 2 + clampAlong(r.h) };
  if (side === 's') return { x: r.x + r.w / 2 + clampAlong(r.w), y: r.y + r.h };
  return { x: r.x + r.w / 2 + clampAlong(r.w), y: r.y };
}

const dedupe = (pts: Pt[]): Pt[] => {
  const out: Pt[] = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.abs(l.x - p.x) > 0.01 || Math.abs(l.y - p.y) > 0.01) out.push(p); }
  // drop collinear middle points
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1], b = out[i + 1];
    return !((Math.abs(a.x - p.x) < 0.01 && Math.abs(p.x - b.x) < 0.01) || (Math.abs(a.y - p.y) < 0.01 && Math.abs(p.y - b.y) < 0.01));
  });
};

/** the horizontal case: leave `a` through its east or west side, enter `b` through the facing one. Everything else is this, transposed. */
function routeHorizontal(start: Pt, end: Pt, dirOut: 1 | -1, a: Rect, b: Rect, obstacles: Rect[], lane: number, clearance: number): { pts: Pt[]; detour: boolean } {
  const blockers = obstacles.map((o) => inflate(o, 2));
  const ends = [a, b];
  const inside = (p: Pt, r: Rect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  // a line must not cross another card, and its bends must not sit inside one of its own two cards
  const ok = (pts: Pt[]) => !pathHitsAny(pts, blockers) && !pts.slice(1, -1).some((p) => ends.some((r) => inside(p, r)));
  const facing = (end.x - start.x) * dirOut > clearance * 2; // the target lies ahead: a single vertical channel between the cards
  if (facing) {
    const base = (start.x + end.x) / 2 + lane * LANE_SPACING;
    const lo = Math.min(start.x, end.x) + clearance, hi = Math.max(start.x, end.x) - clearance;
    const candidates = [base];
    for (let i = 1; i <= 14; i++) candidates.push(base + i * 14, base - i * 14);
    for (const x of candidates) {
      if (x < lo || x > hi) continue;
      const pts = dedupe([start, { x, y: start.y }, { x, y: end.y }, end]);
      if (ok(pts)) return { pts, detour: false };
    }
  }
  // detour: leave straight out, run through a free corridor above or below everything in the way, come back in
  const out = start.x + dirOut * STUB;
  const inn = end.x - dirOut * STUB;
  const xs = [start.x, end.x, out, inn];
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const span = blockers.filter((r) => r.x + r.w > lo && r.x < hi);
  const top = Math.min(a.y, b.y, ...span.map((r) => r.y)) - 12 - Math.abs(lane) * LANE_SPACING;
  const bottom = Math.max(a.y + a.h, b.y + b.h, ...span.map((r) => r.y + r.h)) + 12 + Math.abs(lane) * LANE_SPACING;
  const tries = [top, bottom].map((cy) => dedupe([start, { x: out, y: start.y }, { x: out, y: cy }, { x: inn, y: cy }, { x: inn, y: end.y }, end]));
  const length = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), 0);
  const valid = tries.filter(ok).sort((p, q) => length(p) - length(q));
  if (valid.length) return { pts: valid[0], detour: true };
  // nothing is clear (a wall of cards): the straight channel anyway, so the edge is at least drawn
  const x = (start.x + end.x) / 2;
  return { pts: dedupe([start, { x, y: start.y }, { x, y: end.y }, end]), detour: true };
}

const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
function pointAt(pts: Pt[], at: number): Pt {
  let left = at;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (left <= seg || i === pts.length - 1) { const t = seg === 0 ? 0 : Math.min(1, left / seg); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }; }
    left -= seg;
  }
  return pts[pts.length - 1];
}
const n2 = (n: number) => Math.round(n * 100) / 100;
/** polyline → SVG path with rounded corners */
export function roundedPath(pts: Pt[], radius = CORNER): string {
  if (pts.length < 2) return '';
  let d = `M ${n2(pts[0].x)} ${n2(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, la / 2, lb / 2);
    const p0 = { x: p.x + ((a.x - p.x) / la) * r, y: p.y + ((a.y - p.y) / la) * r };
    const p1 = { x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r };
    d += ` L ${n2(p0.x)} ${n2(p0.y)} Q ${n2(p.x)} ${n2(p.y)} ${n2(p1.x)} ${n2(p1.y)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${n2(last.x)} ${n2(last.y)}`;
}

/** the route of ONE line from `a` (the influencer) to `b` (the influenced) */
export function routeEdge(a: Rect, b: Rect, o: RouteOptions = {}): Route {
  const clearance = o.clearance ?? 8;
  const others = (o.obstacles ?? []).filter((r) => !same(r, a) && !same(r, b));
  const [sideA, sideB] = facingSides(a, b);
  const lane = o.lane ?? 0;
  const start = attachPoint(a, sideA, o.slotA ?? lane * LANE_SPACING);
  const end = attachPoint(b, sideB, o.slotB ?? lane * LANE_SPACING);
  let pts: Pt[]; let detour: boolean;
  if (sideA === 'e' || sideA === 'w') {
    ({ pts, detour } = routeHorizontal(start, end, sideA === 'e' ? 1 : -1, a, b, others, lane, clearance));
  } else {
    const r = routeHorizontal(transposePt(start), transposePt(end), sideA === 's' ? 1 : -1, transposeRect(a), transposeRect(b), others.map(transposeRect), lane, clearance);
    pts = r.pts.map(transposePt); detour = r.detour;
  }
  const len = lengthOf(pts);
  const last = pts[pts.length - 1], prev = pts[pts.length - 2] ?? pts[0];
  const ll = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  return { sideA, sideB, start, end, points: pts, d: roundedPath(pts), mid: pointAt(pts, len / 2), endDir: { x: (last.x - prev.x) / ll, y: (last.y - prev.y) / ll }, length: len, detour };
}

export interface RouteEdgeInput { id: string; /** the influencer */ from: string; /** the influenced */ to: string }

/**
 * All lines at once: edges that meet the same side of a card are spread over separate slots (ordered by where the other
 * end is, so they do not cross at the card), and edges between the same two cards get separate lanes.
 */
export function routeEdges(edges: RouteEdgeInput[], rects: Map<string, Rect>, o: { obstacles?: Rect[]; slotSpacing?: number } = {}): Map<string, Route> {
  const spacing = o.slotSpacing ?? 14;
  const live = edges.filter((e) => rects.has(e.from) && rects.has(e.to) && e.from !== e.to);
  const sides = new Map<string, [Side, Side]>(live.map((e) => [e.id, facingSides(rects.get(e.from)!, rects.get(e.to)!)]));
  // slots per (card, side)
  const bySide = new Map<string, Array<{ id: string; end: 'a' | 'b'; other: Pt }>>();
  for (const e of live) {
    const [sa, sb] = sides.get(e.id)!;
    const ra = rects.get(e.from)!, rb = rects.get(e.to)!;
    const push = (card: string, side: Side, end: 'a' | 'b', other: Rect) => { const k = `${card}|${side}`; bySide.set(k, [...(bySide.get(k) ?? []), { id: e.id, end, other: { x: other.x + other.w / 2, y: other.y + other.h / 2 } }]); };
    push(e.from, sa, 'a', rb); push(e.to, sb, 'b', ra);
  }
  const slotOf = new Map<string, number>(); // `${edgeId}|a|b` → offset
  for (const [k, list] of bySide) {
    const side = k.slice(k.lastIndexOf('|') + 1) as Side;
    const along = (p: Pt) => (side === 'n' || side === 's' ? p.x : p.y);
    list.sort((p, q) => along(p.other) - along(q.other) || p.id.localeCompare(q.id));
    const card = rects.get(k.slice(0, k.lastIndexOf('|')))!;
    const sideLen = side === 'n' || side === 's' ? card.w : card.h;
    const step = Math.min(spacing, Math.max(4, (sideLen - 2 * EDGE_MARGIN) / Math.max(1, list.length - 1)));
    list.forEach((it, i) => slotOf.set(`${it.id}|${it.end}`, list.length === 1 ? 0 : (i - (list.length - 1) / 2) * step));
  }
  // lanes for parallel edges (same unordered pair)
  const pair = new Map<string, string[]>();
  for (const e of live) { const k = [e.from, e.to].sort().join('|'); pair.set(k, [...(pair.get(k) ?? []), e.id]); }
  const laneOf = new Map<string, number>();
  for (const ids of pair.values()) ids.sort().forEach((id, i) => laneOf.set(id, ids.length === 1 ? 0 : i - (ids.length - 1) / 2));
  const out = new Map<string, Route>();
  for (const e of live) out.set(e.id, routeEdge(rects.get(e.from)!, rects.get(e.to)!, { obstacles: o.obstacles ?? [...rects.values()], lane: laneOf.get(e.id), slotA: slotOf.get(`${e.id}|a`), slotB: slotOf.get(`${e.id}|b`) }));
  return out;
}
