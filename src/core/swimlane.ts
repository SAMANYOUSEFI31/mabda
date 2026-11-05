/**
 * «نمای کلی» of the truth canvas: a SWIMLANE layout (docs/canvas-design.md).
 *
 *  · a row  = a section of the tree (one or two levels deep; deeper sections roll into their parent row until it is opened),
 *             in tree order, a fixed horizontal band with a label at the START edge;
 *  · a column = a dependency layer, the same in every row (`decisionGraph` logic): the base is at the start side, what rests
 *             on it follows; a cycle sits in one layer and its members are marked «با هم تصمیم بگیرید»;
 *  · stable: the place of a card depends only on (its row, its layer, its age) and a row grows in steps of `QUANTUM` slots,
 *             so adding one item moves almost nothing (tested);
 *  · semantic zoom data: every row carries counters (knowledge, red lines, stale, open thoughts) and the dependencies between
 *             rows are also given as ONE counted line per pair of rows — what the view draws when zoomed out.
 *
 * Pure; the view only draws the scene. Position means nothing to any engine (the tree is DOMAIN, the layer comes from
 * `depends_on` alone — docs/spine.md).
 */

import type { ContextObject, ContextRelationship, GeneratedDeliverable, Note, TreeNode } from '../types';
import type { Scene, SceneBox, SceneEdge, SceneInput, SceneItem } from './canvasScene';
import { dependencyEdges } from './decisionGraph';
import { redundantLinks } from './dependencyReduction';
import { stronglyConnected, layersOf } from './graphAlgo';
import { isExpired } from './effectiveContext';
import { EDGE_LABEL } from './mapModel';
import { badges, extract } from './sceneParts';
import { childrenOf } from './nodeTree';
import { convertedTo, thinkingOf } from './thinkingMarkers';

export const CARD_W = 220;
export const CARD_H = 120;
export const GAP_X = 96;
export const GAP_Y = 16;
export const ROW_HEAD = 34;
export const ROW_PAD = 20;
export const ROW_GAP = 18;
/** a row's height grows in steps of this many card slots, so one more card rarely moves the rows below */
export const QUANTUM = 2;
export const PAD = 40;
/** room at the START edge (the right in RTL) for the sticky row labels, so they never sit on top of the base column */
export const GUTTER = 190;
/** a crowded cell wraps into more columns after this many cards, so a row never grows into a tower */
export const MAX_STACK = 6;
export const SUBGAP = 24;
/** rows for the first two levels of the tree; deeper sections stay inside their parent until it is opened */
export const MAX_ROW_DEPTH = 2;

export interface OverviewOptions {
  /** suggestions and things that need a look are drawn too (faint) */
  showPending?: boolean;
  /** keep only what is stale (needs a review or expired) */
  onlyReview?: boolean;
  /** keep only one kind: red lines, suggestions */
  only?: 'constraint' | 'pending';
  /** sections whose children get their own rows (beyond the first two levels) */
  opened?: Set<string>;
  /** the user's order of rows (display only); sections not listed follow in tree order */
  rowOrder?: string[];
  /** a section the view is «inside»: only it and its sub-sections */
  scopeNodeId?: string;
}

export interface OverviewRow {
  /** the section this row stands for (objects of its deeper sections are rolled into it) */
  nodeId: string;
  label: string;
  depth: number;
  /** it has deeper sections rolled into it (can be opened) */
  rolledUp: number;
  counts: { knowledge: number; redLines: number; stale: number; openThoughts: number };
  y: number; h: number;
}
export interface RowEdge { id: string; /** the row of the influencer */ from: string; /** the row of the influenced */ to: string; count: number; edgeIds: string[] }
export interface OverviewData {
  rows: OverviewRow[];
  rowEdges: RowEdge[];
  /** how many rows were left out because nothing is in them */
  hiddenEmptyRows: number;
  layers: number;
}

const isPendingObject = (o: ContextObject) => o.status === 'Proposed' || o.status === 'Needs Review';
const isLive = (o: ContextObject) => o.status !== 'Superseded' && o.status !== 'Archived';

/** which row (a node id) an object of `nodeId` belongs to */
export function rowOfNode(nodes: TreeNode[], nodeId: string, opened: Set<string> = new Set()): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  for (let cur = byId.get(nodeId); cur && !path.includes(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) path.unshift(cur.id);
  if (!path.length) return nodeId;
  let row = path[0];
  for (let i = 1; i < path.length; i++) { if (i < MAX_ROW_DEPTH || opened.has(path[i - 1])) row = path[i]; else break; }
  return row;
}

export function buildOverviewScene(input: SceneInput, opts: OverviewOptions = {}): Scene {
  const now = input.now ?? new Date();
  const opened = opts.opened ?? new Set<string>();
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const inScope = (nid: string) => {
    if (!opts.scopeNodeId) return true;
    for (let cur = nodeById.get(nid), n = 0; cur && n < 50; cur = cur.parentId ? nodeById.get(cur.parentId) : undefined, n++) if (cur.id === opts.scopeNodeId) return true;
    return false;
  };
  const stale = (o: ContextObject) => input.reviewIds.has(o.id) || o.status === 'Needs Review' || isExpired(o, now);

  let objects = input.objects.filter((o) => isLive(o) && !o.sample && nodeById.has(o.nodeId) && inScope(o.nodeId) && (opts.showPending || !isPendingObject(o)));
  if (opts.onlyReview) objects = objects.filter(stale);
  if (opts.only === 'constraint') objects = objects.filter((o) => o.type === 'Constraint');
  if (opts.only === 'pending') objects = objects.filter(isPendingObject);
  const shown = new Set(objects.map((o) => o.id));

  // columns: the dependency layer (the depended-on thing first), cycles in one layer
  const edges = dependencyEdges(input.objects.filter(isLive), input.relationships).filter((e) => shown.has(e.from) && shown.has(e.to));
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.to, [...(out.get(e.to) ?? []), e.from]);
  const ids = objects.map((o) => o.id).sort();
  const layer = layersOf(ids, out);
  const comps = stronglyConnected(ids, out);
  const together = new Map<string, string>();
  const selfLoop = new Set(edges.filter((e) => e.from === e.to).map((e) => e.from));
  for (const c of comps) if (c.length > 1 || selfLoop.has(c[0])) for (const id of c) together.set(id, `together:${c[0]}`);
  const layerCount = Math.max(1, ...ids.map((id) => (layer.get(id) ?? 0) + 1));

  // rows: tree order (or the user's), only first-level sections + opened ones; empty rows are left out
  const rowKeyOf = (nid: string) => rowOfNode(input.nodes, nid, opened);
  const rowObjects = new Map<string, ContextObject[]>();
  for (const o of objects) rowObjects.set(rowKeyOf(o.nodeId), [...(rowObjects.get(rowKeyOf(o.nodeId)) ?? []), o]);
  const rowThoughts = new Map<string, number>();
  for (const t of thinkingOf(input.notes)) if (nodeById.has(t.nodeId) && inScope(t.nodeId) && !convertedTo(t, input.objects)) rowThoughts.set(rowKeyOf(t.nodeId), (rowThoughts.get(rowKeyOf(t.nodeId)) ?? 0) + 1);
  for (const o of input.objects) if (isPendingObject(o) && !o.sample && nodeById.has(o.nodeId) && inScope(o.nodeId) && !shown.has(o.id)) rowThoughts.set(rowKeyOf(o.nodeId), (rowThoughts.get(rowKeyOf(o.nodeId)) ?? 0) + 1);

  const order: Array<{ node: TreeNode; depth: number }> = [];
  const walk = (n: TreeNode, depth: number) => {
    if (depth < MAX_ROW_DEPTH || (n.parentId && opened.has(n.parentId))) order.push({ node: n, depth });
    for (const c of childrenOf(input.nodes, n.id)) walk(c, depth + 1);
  };
  for (const r of input.nodes.filter((n) => !n.parentId || !nodeById.has(n.parentId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))) walk(r, 0);
  const wanted = new Map((opts.rowOrder ?? []).map((id, i) => [id, i]));
  const ordered = [...order].sort((a, b) => (wanted.get(a.node.id) ?? 1e6) - (wanted.get(b.node.id) ?? 1e6) || order.indexOf(a) - order.indexOf(b));

  // how many columns each layer needs: the most crowded cell of any row decides (a cell of up to MAX_STACK cards is one column)
  const subcols = Array.from({ length: layerCount }, () => 1);
  for (const list of rowObjects.values()) {
    const per = new Map<number, number>();
    for (const o of list) per.set(layer.get(o.id) ?? 0, (per.get(layer.get(o.id) ?? 0) ?? 0) + 1);
    for (const [l, n] of per) subcols[l] = Math.max(subcols[l], Math.ceil(n / MAX_STACK));
  }
  const layerW = (l: number) => subcols[l] * CARD_W + (subcols[l] - 1) * SUBGAP;
  // RTL: the base layer is the rightmost; every later layer lies to its left (the gutter lies beyond the base)
  const colX = (l: number) => { let x = PAD; for (let m = layerCount - 1; m > l; m--) x += layerW(m) + GAP_X; return x; };
  const width = Math.max(960, PAD * 2 + GUTTER + Array.from({ length: layerCount }, (_, l) => layerW(l)).reduce((a, b) => a + b, 0) + (layerCount - 1) * GAP_X);
  const items: SceneItem[] = [];
  const boxes: SceneBox[] = [];
  const rows: OverviewRow[] = [];
  const rowOfObject = new Map<string, string>();
  let hiddenEmptyRows = 0;
  let y = PAD;
  for (const { node, depth } of ordered) {
    const list = rowObjects.get(node.id) ?? [];
    const thoughts = rowThoughts.get(node.id) ?? 0;
    if (list.length === 0 && thoughts === 0) { hiddenEmptyRows++; continue; }
    const cells = new Map<number, ContextObject[]>();
    for (const o of list) cells.set(layer.get(o.id) ?? 0, [...(cells.get(layer.get(o.id) ?? 0) ?? []), o]);
    for (const c of cells.values()) c.sort((a, b) => (together.get(a.id) ?? '').localeCompare(together.get(b.id) ?? '') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const most = Math.min(MAX_STACK, Math.max(1, ...[...cells.values()].map((c) => c.length)));
    const slots = Math.ceil(most / QUANTUM) * QUANTUM;
    const h = ROW_HEAD + slots * (CARD_H + GAP_Y) + ROW_PAD;
    for (const [l, c] of cells) c.forEach((o, j) => {
      const it: SceneItem = {
        id: `o:${o.id}`, kind: 'object', label: o.title, summary: extract(o.content), x: colX(l) + (subcols[l] - 1 - Math.floor(j / MAX_STACK)) * (CARD_W + SUBGAP), y: y + ROW_HEAD + (j % MAX_STACK) * (CARD_H + GAP_Y), w: CARD_W, h: CARD_H,
        objectId: o.id, nodeId: o.nodeId, type: o.type, status: o.status, ...badges(o, input.reviewIds.has(o.id), now),
        ...(isPendingObject(o) ? { pending: true } : {}), ...(together.has(o.id) ? { together: together.get(o.id) } : {}), rowId: node.id,
      };
      items.push(it);
      rowOfObject.set(o.id, node.id);
    });
    const below = input.nodes.filter((n) => n.id !== node.id && rowKeyOf(n.id) === node.id).length;
    rows.push({
      nodeId: node.id, label: node.label, depth, rolledUp: below,
      counts: { knowledge: list.filter((o) => !isPendingObject(o)).length, redLines: list.filter((o) => o.type === 'Constraint').length, stale: list.filter(stale).length, openThoughts: thoughts },
      y, h,
    });
    boxes.push({ id: `row:${node.id}`, kind: 'row', label: node.label, depth, x: 0, y, w: width, h, nodeId: node.id, count: list.length, hint: 'بخش درخت؛ ستون‌ها لایهٔ وابستگی‌اند. ترتیب ردیف‌ها فقط نمایش است.' });
    y += h + ROW_GAP;
  }
  for (let l = 0; l < layerCount; l++) boxes.push({ id: `col:${l}`, kind: 'column', label: l === 0 ? 'پایه' : `لایهٔ ${l}`, depth: 0, x: colX(l) - 8, y: 4, w: layerW(l) + 16, h: PAD - 8, hint: 'لایهٔ وابستگی: هرچه در ستون‌های سمت پایان است روی ستون‌های سمت شروع سوار است.' });

  // lines: INFLUENCER → influenced; direct links another path already implies are quieter
  const redundant = new Set(redundantLinks(input.objects, input.relationships).map((l) => `${l.to}>${l.from}`));
  const sceneEdges: SceneEdge[] = edges.filter((e) => e.from !== e.to).map((e) => ({
    id: `dependency|o:${e.from}|o:${e.to}`, kind: 'dependency' as const, label: EDGE_LABEL.dependency, influencer: `o:${e.to}`, influenced: `o:${e.from}`, count: 1,
    ...(redundant.has(`${e.to}>${e.from}`) ? { redundant: true } : {}),
    ...(isPendingObject(byId.get(e.from)!) || isPendingObject(byId.get(e.to)!) ? { pending: true } : {}),
  }));
  // …and ONE counted line per pair of rows (what the zoomed-out view draws)
  const pair = new Map<string, RowEdge>();
  for (const e of sceneEdges) {
    const a = rowOfObject.get(e.influencer.slice(2)), b = rowOfObject.get(e.influenced.slice(2));
    if (!a || !b || a === b) continue;
    const k = `${a}>${b}`;
    const cur = pair.get(k) ?? { id: `rowedge|${a}|${b}`, from: a, to: b, count: 0, edgeIds: [] };
    cur.count++; cur.edgeIds.push(e.id);
    pair.set(k, cur);
  }
  const height = Math.max(520, y - ROW_GAP + PAD);
  return {
    layout: 'overview', items, boxes, edges: sceneEdges, width, height,
    summary: { objects: items.length, assets: 0, notes: 0 },
    overview: { rows, rowEdges: [...pair.values()].sort((a, b) => a.id.localeCompare(b.id)), hiddenEmptyRows, layers: layerCount },
  };
}

/** every row's «how many depend on X» for one row: the rows that rest on it, most first (the answer to «کدام بخش‌ها به ارسال وابسته‌اند؟») */
export function rowsDependingOn(scene: Scene, rowId: string): Array<{ rowId: string; count: number }> {
  return (scene.overview?.rowEdges ?? []).filter((e) => e.from === rowId).map((e) => ({ rowId: e.to, count: e.count })).sort((a, b) => b.count - a.count || a.rowId.localeCompare(b.rowId));
}

export type { ContextRelationship, GeneratedDeliverable, Note };
