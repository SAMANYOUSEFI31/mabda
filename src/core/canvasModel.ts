/**
 * Decision board («بوم تصمیم‌ها») model. Pure.
 *
 * Principle: a position means something ONLY because it is declared here —
 *   • the COLUMN is the object's status (in thought = Proposed · confirmed = Confirmed · needs review = Needs Review, or
 *     Confirmed with a changed dependency — the derived state),
 *   • the ROW is its node,
 *   • the order inside a column is a stored «rank» (an explicit priority).
 * x / y of a card are only where it is drawn; no engine reads them. Free notes keep raw x/y (display only).
 */

import type { ContextObject, TreeNode } from '../types';

export type Lane = 'thinking' | 'confirmed' | 'review';
/** reading order; in RTL the first lane is the rightmost column */
export const LANES: Lane[] = ['thinking', 'confirmed', 'review'];
export const LANE_FA: Record<Lane, string> = { thinking: 'در فکر', confirmed: 'تأییدشده', review: 'نیاز به بازبینی' };

export const CARD_W = 232;
export const CARD_H = 112;
export const GAP = 12;
export const ROW_PAD = 14;
export const ROW_HEAD = 30;
const LANE_GAP = 28;

const onBoard = (o: ContextObject) => o.status === 'Confirmed' || o.status === 'Proposed' || o.status === 'Needs Review';

export function laneOf(o: Pick<ContextObject, 'status' | 'id'>, reviewIds: Set<string>): Lane {
  if (o.status === 'Proposed') return 'thinking';
  if (o.status === 'Needs Review' || reviewIds.has(o.id)) return 'review';
  return 'confirmed';
}

/** a rank strictly between two neighbours (either may be missing: start / end of a column) */
export function rankBetween(prev?: number, next?: number): number {
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

export interface CanvasInput {
  nodes: TreeNode[];
  objects: ContextObject[];
  reviewIds: Set<string>;
  /** stored ranks (objectId → rank) */
  ranks: Map<string, number>;
}
export interface CanvasCard { id: string; objectId: string; lane: Lane; nodeId: string; rank: number; x: number; y: number; w: number; h: number; review: boolean }
export interface CanvasRow { nodeId: string; label: string; depth: number; y: number; h: number }
export interface CanvasLaneBand { lane: Lane; x: number; w: number }
export interface CanvasModel { cards: CanvasCard[]; rows: CanvasRow[]; lanes: CanvasLaneBand[]; width: number; height: number; cells: Map<string, CanvasCard[]> }

const cellKey = (lane: Lane, nodeId: string) => `${lane}|${nodeId}`;
/** unranked cards come after ranked ones, oldest first */
const fallbackRank = (o: ContextObject) => 1e12 + (Date.parse(o.createdAt) || 0) / 1000;

export function buildCanvasModel(input: CanvasInput): CanvasModel {
  const children = new Map<string, TreeNode[]>();
  for (const n of input.nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  for (const l of children.values()) l.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const ids = new Set(input.nodes.map((n) => n.id));
  const order: Array<{ node: TreeNode; depth: number }> = [];
  const walk = (n: TreeNode, depth: number) => { order.push({ node: n, depth }); for (const c of children.get(n.id) ?? []) walk(c, depth + 1); };
  input.nodes.filter((n) => !n.parentId || !ids.has(n.parentId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)).forEach((n) => walk(n, 0));

  const cells = new Map<string, CanvasCard[]>();
  for (const o of input.objects.filter(onBoard)) {
    if (!ids.has(o.nodeId)) continue;
    const lane = laneOf(o, input.reviewIds);
    const card: CanvasCard = { id: `o:${o.id}`, objectId: o.id, lane, nodeId: o.nodeId, rank: input.ranks.get(o.id) ?? fallbackRank(o), x: 0, y: 0, w: CARD_W, h: CARD_H, review: input.reviewIds.has(o.id) };
    const k = cellKey(lane, o.nodeId);
    cells.set(k, [...(cells.get(k) ?? []), card]);
  }
  for (const list of cells.values()) list.sort((a, b) => a.rank - b.rank || a.objectId.localeCompare(b.objectId));

  const laneW = CARD_W + 2 * ROW_PAD;
  const lanes: CanvasLaneBand[] = LANES.map((lane, i) => ({ lane, x: (LANES.length - 1 - i) * (laneW + LANE_GAP), w: laneW })); // RTL: first lane rightmost
  const rows: CanvasRow[] = [];
  let y = 0;
  for (const { node, depth } of order) {
    const most = Math.max(1, ...LANES.map((l) => cells.get(cellKey(l, node.id))?.length ?? 0));
    const h = ROW_HEAD + ROW_PAD + most * (CARD_H + GAP);
    rows.push({ nodeId: node.id, label: node.label, depth, y, h });
    for (const band of lanes) (cells.get(cellKey(band.lane, node.id)) ?? []).forEach((c, i) => { c.x = band.x + ROW_PAD; c.y = y + ROW_HEAD + i * (CARD_H + GAP); });
    y += h + GAP;
  }
  return { cards: [...cells.values()].flat(), rows, lanes, width: lanes.length * laneW + (lanes.length - 1) * LANE_GAP, height: Math.max(0, y - GAP), cells };
}

export interface DropTarget { lane: Lane; nodeId: string; /** position inside the cell (0 = first) */ index: number; before?: CanvasCard; after?: CanvasCard }

/** which cell and slot a point (in canvas coordinates) falls on; undefined outside every row/lane. `ignore` = the card being dragged. */
export function dropTarget(model: CanvasModel, px: number, py: number, ignore?: string): DropTarget | undefined {
  const band = model.lanes.find((b) => px >= b.x - LANE_GAP / 2 && px <= b.x + b.w + LANE_GAP / 2);
  const row = model.rows.find((r) => py >= r.y - GAP / 2 && py <= r.y + r.h + GAP / 2);
  if (!band || !row) return undefined;
  const list = (model.cells.get(cellKey(band.lane, row.nodeId)) ?? []).filter((c) => c.objectId !== ignore);
  const index = list.filter((c) => c.y + c.h / 2 < py).length;
  return { lane: band.lane, nodeId: row.nodeId, index, before: list[index - 1], after: list[index] };
}

export type MoveKind = 'accept' | 'accept_review' | 'status' | 'node' | 'rank' | 'none';
export interface MoveEffect {
  kind: MoveKind;
  /** the status the object gets (undefined when it keeps it) */
  status?: ContextObject['status'];
  /** leaving «confirmed» (or a derived review) backward must be confirmed explicitly */
  needsConfirm: boolean;
  nodeChanged: boolean;
}

/** what dropping a card in `toLane` / `toNode` means (the single source of truth for the UI and the server) */
export function moveEffect(o: Pick<ContextObject, 'status' | 'nodeId' | 'id'>, reviewIds: Set<string>, toLane: Lane, toNode: string): MoveEffect {
  const from = laneOf(o, reviewIds);
  const nodeChanged = o.nodeId !== toNode;
  const derived = o.status === 'Confirmed' && reviewIds.has(o.id);
  if (from === toLane) return { kind: nodeChanged ? 'node' : 'rank', needsConfirm: false, nodeChanged };
  if (toLane === 'confirmed') {
    if (o.status === 'Proposed') return { kind: 'accept', status: 'Confirmed', needsConfirm: false, nodeChanged };
    if (derived) return { kind: 'accept_review', needsConfirm: false, nodeChanged };
    return { kind: 'status', status: 'Confirmed', needsConfirm: false, nodeChanged };
  }
  const status = toLane === 'thinking' ? 'Proposed' : 'Needs Review';
  return { kind: 'status', status, needsConfirm: o.status === 'Confirmed', nodeChanged };
}

/** only cards that intersect the viewport are drawn */
export function visibleCards(model: CanvasModel, view: { x: number; y: number; w: number; h: number }, margin = 200): CanvasCard[] {
  const x0 = view.x - margin, y0 = view.y - margin, x1 = view.x + view.w + margin, y1 = view.y + view.h + margin;
  return model.cards.filter((c) => c.x + c.w >= x0 && c.x <= x1 && c.y + c.h >= y0 && c.y <= y1);
}
