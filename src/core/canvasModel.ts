/**
 * Decision board («بوم تصمیم‌ها») model. Pure.
 *
 * Principle: a position means something ONLY because it is declared here —
 *   • the COLUMN is the object's status (in thought = Proposed / Needs Review · confirmed = Confirmed). A changed dependency
 *     is a BADGE («بازبینی») and a filter, never a column. Other column choices (dependency layer, facet) are display only,
 *   • the ROW is its node,
 *   • the order inside a column is a stored «rank» (an explicit priority).
 * The tree is DOMAIN: rows are nodes in tree order, and sibling rows carry no precedence (only a dependency edge does, on the map).
 * x / y of a card are only where it is drawn; no engine reads them. Free notes keep raw x/y (display only).
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { dependencyEdges } from './decisionGraph';
import { layersOf } from './graphAlgo';

export type Lane = 'thinking' | 'confirmed';
/** the status columns, reading order; in RTL the first column is the rightmost. «نیاز به بازبینی» is NOT a column: it is a badge and a filter */
export const LANES: Lane[] = ['thinking', 'confirmed'];
export const LANE_FA: Record<Lane, string> = { thinking: 'در فکر', confirmed: 'تأییدشده' };

export const CARD_W = 232;
export const CARD_H = 120;
export const GAP = 12;
export const ROW_PAD = 14;
export const ROW_HEAD = 30;
const LANE_GAP = 28;

const onBoard = (o: ContextObject) => o.status === 'Confirmed' || o.status === 'Proposed' || o.status === 'Needs Review';

/** Proposed and Needs Review are still in thought; Confirmed is settled (a changed dependency adds a badge, not a column) */
export function laneOf(o: Pick<ContextObject, 'status' | 'id'>): Lane {
  return o.status === 'Proposed' || o.status === 'Needs Review' ? 'thinking' : 'confirmed';
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
  /** derived «needs a review»: a badge on the card (and a filter), never a column */
  reviewIds: Set<string>;
  /** stored ranks (objectId → rank) */
  ranks: Map<string, number>;
  /** what the COLUMNS are (a changeable view, never stored): status (default — the only one where a drop changes something), the dependency layer, the first facet, or none */
  columns?: BoardColumns;
  /** what the ROWS are: the tree (default), the first facet, or none */
  rows?: BoardRows;
  /** needed for columns = 'layer' */
  relationships?: ContextRelationship[];
  /** show only cards whose derived review flag is on */
  onlyReview?: boolean;
}
export type BoardColumns = 'status' | 'layer' | 'facet' | 'none';
export type BoardRows = 'domain' | 'facet' | 'none';
export const BOARD_COLUMNS_FA: Record<BoardColumns, string> = { status: 'وضعیت', layer: 'لایهٔ وابستگی', facet: 'بُعد', none: 'هیچ' };
export const BOARD_ROWS_FA: Record<BoardRows, string> = { domain: 'دامنه', facet: 'بُعد', none: 'هیچ' };
export const NO_FACET_ROW = 'بدون بُعد';
export interface CanvasCard { id: string; objectId: string; /** the status column (always known) */ lane: Lane; /** the column this card is drawn in (= lane when columns = status) */ col: string; nodeId: string; rank: number; x: number; y: number; w: number; h: number; review: boolean }
/** `nodeId` is the ROW key: a tree node for rows = domain, otherwise a facet name / «all» (a row never means «move the object» unless it is a node) */
export interface CanvasRow { nodeId: string; label: string; depth: number; y: number; h: number }
export interface CanvasLaneBand { lane: string; label: string; x: number; w: number }
export interface CanvasModel { columns: BoardColumns; rows_: BoardRows; cards: CanvasCard[]; rows: CanvasRow[]; lanes: CanvasLaneBand[]; width: number; height: number; cells: Map<string, CanvasCard[]> }

const cellKey = (col: string, row: string) => `${col}|${row}`;
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

  const columns = input.columns ?? 'status';
  const rowsKind = input.rows ?? 'domain';
  const onB = input.objects.filter(onBoard).filter((o) => ids.has(o.nodeId)).filter((o) => !input.onlyReview || input.reviewIds.has(o.id));

  // rows
  let rowOf: (o: ContextObject) => string = (o) => o.nodeId;
  let rowDefs: Array<{ key: string; label: string; depth: number }> = order.map(({ node, depth }) => ({ key: node.id, label: node.label, depth }));
  if (rowsKind === 'facet') {
    rowOf = (o) => o.facets?.[0] ?? NO_FACET_ROW;
    const names = [...new Set(onB.map(rowOf))].sort((a, b) => (a === NO_FACET_ROW ? 1 : b === NO_FACET_ROW ? -1 : a.localeCompare(b)));
    rowDefs = names.map((k) => ({ key: k, label: k, depth: 0 }));
  } else if (rowsKind === 'none') {
    rowOf = () => 'all';
    rowDefs = [{ key: 'all', label: 'همه', depth: 0 }];
  }

  // columns
  let colOf: (o: ContextObject) => string = (o) => laneOf(o);
  let colDefs: Array<{ key: string; label: string }> = LANES.map((l) => ({ key: l, label: LANE_FA[l] }));
  if (columns === 'none') { colOf = () => 'all'; colDefs = [{ key: 'all', label: 'همه' }]; }
  else if (columns === 'facet') {
    colOf = (o) => o.facets?.[0] ?? NO_FACET_ROW;
    colDefs = [...new Set(onB.map(colOf))].sort((a, b) => (a === NO_FACET_ROW ? 1 : b === NO_FACET_ROW ? -1 : a.localeCompare(b))).map((k) => ({ key: k, label: k }));
  } else if (columns === 'layer') {
    const live = input.objects.filter((o) => o.status !== 'Superseded' && o.status !== 'Archived');
    const edges = dependencyEdges(live, input.relationships ?? []);
    const out = new Map<string, string[]>();
    for (const e of edges) out.set(e.to, [...(out.get(e.to) ?? []), e.from]); // the depended-on thing comes first
    const level = layersOf(live.map((o) => o.id), out);
    colOf = (o) => `L${level.get(o.id) ?? 0}`;
    colDefs = [...new Set(onB.map(colOf))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((k) => ({ key: k, label: k === 'L0' ? 'پایه' : `لایهٔ ${Number(k.slice(1))}` }));
  }
  if (colDefs.length === 0) colDefs = [{ key: 'all', label: 'همه' }];

  const cells = new Map<string, CanvasCard[]>();
  for (const o of onB) {
    const col = colOf(o);
    const rk = rowOf(o);
    const card: CanvasCard = { id: `o:${o.id}`, objectId: o.id, lane: laneOf(o), col, nodeId: o.nodeId, rank: input.ranks.get(o.id) ?? fallbackRank(o), x: 0, y: 0, w: CARD_W, h: CARD_H, review: input.reviewIds.has(o.id) || o.status === 'Needs Review' };
    const k = cellKey(col, rk);
    cells.set(k, [...(cells.get(k) ?? []), card]);
  }
  for (const list of cells.values()) list.sort((a, b) => a.rank - b.rank || a.objectId.localeCompare(b.objectId));

  const laneW = CARD_W + 2 * ROW_PAD;
  const lanes: CanvasLaneBand[] = colDefs.map((c, i) => ({ lane: c.key, label: c.label, x: (colDefs.length - 1 - i) * (laneW + LANE_GAP), w: laneW })); // RTL: first column rightmost
  const rows: CanvasRow[] = [];
  let y = 0;
  for (const def of rowDefs) {
    const most = Math.max(1, ...colDefs.map((c) => cells.get(cellKey(c.key, def.key))?.length ?? 0));
    const h = ROW_HEAD + ROW_PAD + most * (CARD_H + GAP);
    rows.push({ nodeId: def.key, label: def.label, depth: def.depth, y, h });
    for (const band of lanes) (cells.get(cellKey(band.lane, def.key)) ?? []).forEach((c, i) => { c.x = band.x + ROW_PAD; c.y = y + ROW_HEAD + i * (CARD_H + GAP); });
    y += h + GAP;
  }
  return { columns, rows_: rowsKind, cards: [...cells.values()].flat(), rows, lanes, width: lanes.length * laneW + (lanes.length - 1) * LANE_GAP, height: Math.max(0, y - GAP), cells };
}

export interface DropTarget { lane: string; nodeId: string; /** position inside the cell (0 = first) */ index: number; before?: CanvasCard; after?: CanvasCard }

/** which cell and slot a point (in canvas coordinates) falls on; undefined outside every row/lane. `ignore` = the card being dragged. */
export function dropTarget(model: CanvasModel, px: number, py: number, ignore?: string): DropTarget | undefined {
  const band = model.lanes.find((b) => px >= b.x - LANE_GAP / 2 && px <= b.x + b.w + LANE_GAP / 2);
  const row = model.rows.find((r) => py >= r.y - GAP / 2 && py <= r.y + r.h + GAP / 2);
  if (!band || !row) return undefined;
  const list = (model.cells.get(cellKey(band.lane, row.nodeId)) ?? []).filter((c) => c.objectId !== ignore);
  const index = list.filter((c) => c.y + c.h / 2 < py).length;
  return { lane: band.lane, nodeId: row.nodeId, index, before: list[index - 1], after: list[index] };
}

/** the neighbours of a card in its own cell (what an undo needs to put it back) */
export function neighboursOf(model: CanvasModel, objectId: string): { lane: string; nodeId: string; beforeId?: string; afterId?: string } | undefined {
  const card = model.cards.find((c) => c.objectId === objectId);
  if (!card) return undefined;
  const cell = [...model.cells.entries()].find(([, list]) => list.includes(card));
  if (!cell) return undefined;
  const list = cell[1];
  const i = list.indexOf(card);
  return { lane: card.col, nodeId: card.nodeId, beforeId: list[i - 1]?.objectId, afterId: list[i + 1]?.objectId };
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
export function moveEffect(o: Pick<ContextObject, 'status' | 'nodeId' | 'id'>, _reviewIds: Set<string>, toLane: Lane, toNode: string): MoveEffect {
  const from = laneOf(o);
  const nodeChanged = o.nodeId !== toNode;
  if (from === toLane) return { kind: nodeChanged ? 'node' : 'rank', needsConfirm: false, nodeChanged };
  if (toLane === 'confirmed') return { kind: o.status === 'Proposed' ? 'accept' : 'status', status: 'Confirmed', needsConfirm: false, nodeChanged };
  return { kind: 'status', status: 'Proposed', needsConfirm: o.status === 'Confirmed', nodeChanged };
}

/** only cards that intersect the viewport are drawn */
export function visibleCards(model: CanvasModel, view: { x: number; y: number; w: number; h: number }, margin = 200): CanvasCard[] {
  const x0 = view.x - margin, y0 = view.y - margin, x1 = view.x + view.w + margin, y1 = view.y + view.h + margin;
  return model.cards.filter((c) => c.x + c.w >= x0 && c.x <= x1 && c.y + c.h >= y0 && c.y <= y1);
}
