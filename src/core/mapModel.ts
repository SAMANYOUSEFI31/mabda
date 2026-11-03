/**
 * Map model («نقشه»): turns nodes, objects, assets and relations into a layered diagram. Pure — the view only draws it.
 *
 *  • vertices: context objects, assets, and a summary card for a COLLAPSED node (it stands for all its objects; edges
 *    between collapsed groups are merged with a count), so thousands of objects stay readable and fast
 *  • edges are typed and are ONLY flow: dependency (depends_on), lineage (asset built from an object, derived_from) and
 *    supersedes (replaced by) — each with a Persian label. The tree is NOT an edge.
 *  • the tree is DOMAIN, not order: a node with content is drawn as a GROUPING BOX that contains its objects and its
 *    sub-nodes' boxes. Sibling nodes are stacked in the same layers and show no precedence.
 *  • layout: longest-path layers computed from the flow edges alone (cycles share a layer; unrelated things share layer 0);
 *    for RTL the first layer is the rightmost, so reading flows right → left. Rows come from the boxes (tree order only
 *    decides which box is above which — it carries no meaning). Coordinates are plain numbers (drawn with transform).
 */

import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../types';
import { isContentChange } from './changeLog';
import { dependentsOf } from './decisionGraph';
import { layersOf } from './graphAlgo';

export type MapVertexKind = 'node' | 'object' | 'asset' | 'assets';
export type MapEdgeKind = 'dependency' | 'lineage' | 'supersedes';

export const EDGE_LABEL: Record<MapEdgeKind, string> = { dependency: 'وابسته به', lineage: 'ساخته‌شده از', supersedes: 'جایگزین کرد' };

export interface MapVertex {
  id: string;
  kind: MapVertexKind;
  label: string;
  /** node: how many objects it holds; assets cluster: how many assets */
  count?: number;
  /** node: its objects are listed individually */
  expanded?: boolean;
  nodeId?: string;
  objectId?: string;
  assetId?: string;
  type?: ContextObject['type'];
  status?: ContextObject['status'];
  /** derived «needs review» (object) / stale (asset) */
  review?: boolean;
  /** the object's first facet (colouring by facet) */
  facet?: string;
  layer: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
/** the box of a node that contains objects and/or sub-nodes (depth 0 = a root node). Not a vertex: it has no edges. */
export interface MapGroup { id: string; nodeId: string; label: string; depth: number; /** objects directly in this node */ count: number; /** its objects are listed inside the box */ expanded: boolean; x: number; y: number; w: number; h: number }
/**
 * `from` / `to` are the relation as stored (A depends on B: from = A, to = B). `influencer` / `influenced` are the DRAWING direction:
 * an arrow always points from what acts to what is acted on — a dependency B → A, an asset built from an object: object → asset,
 * a replacement: the new one → the old one.
 */
export interface MapEdge { id: string; from: string; to: string; kind: MapEdgeKind; label: string; count: number; influencer: string; influenced: string }

export interface MapInput {
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  /** objects that need a review / assets that are stale (derived elsewhere) */
  reviewObjectIds?: Set<string>;
  staleAssetIds?: Set<string>;
}
export interface MapOptions {
  /** nodes whose objects are listed one by one; default: all when the workspace is small, none when it is big */
  expanded?: Set<string>;
  showAssets?: boolean;
  /** also draw superseded / archived objects */
  includeHistory?: boolean;
  autoExpandBelow?: number;
  assetClusterAbove?: number;
  /**
   * what the drawing is GROUPED by (a changeable view, never stored):
   *  · domain     — boxes are the tree's nodes (default of the model)
   *  · dependency — no boxes: columns come from depends_on alone
   *  · facet      — one swimlane per facet name (an object sits in its first facet; none = «بدون بُعد»)
   *  · status     — one swimlane per status
   * Columns are ALWAYS the dependency layers; lanes (boxes) only say what the rows are.
   */
  groupBy?: MapGroupBy;
}
export type MapGroupBy = 'domain' | 'dependency' | 'facet' | 'status';
export const GROUP_BY_FA: Record<MapGroupBy, string> = { domain: 'دامنه', dependency: 'وابستگی', facet: 'بُعد', status: 'وضعیت' };
export const NO_FACET = 'بدون بُعد';
const STATUS_ORDER: ContextObject['status'][] = ['Confirmed', 'Needs Review', 'Proposed', 'Superseded', 'Archived'];
const STATUS_FA: Record<string, string> = { Confirmed: 'تأییدشده', 'Needs Review': 'نیازمند بررسی', Proposed: 'پیشنهادی', Superseded: 'جایگزین‌شده', Archived: 'بایگانی‌شده' };

/** swimlanes as synthetic root nodes + the objects re-homed into them (originals untouched) */
function lanesFor(groupBy: Exclude<MapGroupBy, 'domain'>, nodes: TreeNode[], objects: ContextObject[]): { nodes: TreeNode[]; objects: ContextObject[] } {
  const key = (o: ContextObject) => (groupBy === 'dependency' ? 'all' : groupBy === 'facet' ? o.facets?.[0] ?? NO_FACET : o.status);
  const used = [...new Set(objects.map(key))];
  const sorted = groupBy === 'status' ? STATUS_ORDER.filter((s) => used.includes(s)) : [...used].sort((a, b) => (a === NO_FACET ? 1 : b === NO_FACET ? -1 : a.localeCompare(b)));
  const label = (k: string) => (groupBy === 'status' ? STATUS_FA[k] ?? k : groupBy === 'dependency' ? 'همه' : k);
  void nodes;
  return {
    nodes: sorted.map((k, i) => ({ id: `lane:${k}`, label: label(k), description: '', order: i })),
    objects: objects.map((o) => ({ ...o, nodeId: `lane:${key(o)}` })),
  };
}
export interface MapModel {
  vertices: MapVertex[];
  groups: MapGroup[];
  /** nodes whose objects are listed one by one right now */
  expandedNodes: string[];
  groupBy: MapGroupBy;
  edges: MapEdge[];
  width: number;
  height: number;
  /** entity key ('o:<objectId>', 'a:<assetId>', 'n:<nodeId>') → the vertex that represents it right now */
  rep: Record<string, string>;
  summary: { objects: number; assets: number; collapsedNodes: number };
}

export const CARD_W = 220;
export const CARD_H = 120;
export const GAP_X = 96;
export const GAP_Y = 20;
export const GROUP_PAD = 14;
export const GROUP_HEAD = 56;
const GROUP_GAP = 18;

const isActive = (o: ContextObject) => o.status !== 'Superseded' && o.status !== 'Archived';

export function buildMapModel(rawInput: MapInput, rawOpts: MapOptions = {}): MapModel {
  // grouping other than «domain»: re-home the objects into synthetic swimlanes and list every object individually
  const groupBy = rawOpts.groupBy ?? 'domain';
  let input = rawInput;
  let opts = rawOpts;
  if (groupBy !== 'domain') {
    const live = rawInput.objects.filter((o) => rawOpts.includeHistory || isActive(o));
    const lanes = lanesFor(groupBy, rawInput.nodes, live);
    input = { ...rawInput, nodes: lanes.nodes, objects: lanes.objects };
    opts = { ...rawOpts, expanded: new Set(lanes.nodes.map((n) => n.id)) };
  }
  const showAssets = opts.showAssets ?? true;
  const objects = input.objects.filter((o) => opts.includeHistory || isActive(o));
  const nodeIds = new Set(input.nodes.map((n) => n.id));
  const countBy = new Map<string, number>();
  for (const o of objects) countBy.set(o.nodeId, (countBy.get(o.nodeId) ?? 0) + 1);
  const small = objects.length <= (opts.autoExpandBelow ?? 150);
  const isExpanded = (nodeId: string) => (opts.expanded ? opts.expanded.has(nodeId) : small);
  const assetsIndividually = showAssets && input.deliverables.length <= (opts.assetClusterAbove ?? 150);

  // the tree decides only which box sits above which (no meaning) and which objects share a box
  const children = new Map<string, TreeNode[]>();
  for (const n of input.nodes) if (n.parentId && nodeIds.has(n.parentId)) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  for (const list of children.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const roots = input.nodes.filter((n) => !n.parentId || !nodeIds.has(n.parentId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));

  const vertices = new Map<string, MapVertex>();
  const owner = new Map<string, string | null>(); // vertex id → node id whose box holds it (null = outside every box)
  const seq = new Map<string, number>(); // stable order inside a layer
  const add = (v: Omit<MapVertex, 'layer' | 'row' | 'x' | 'y' | 'w' | 'h'>, node: string | null) => { seq.set(v.id, seq.size); owner.set(v.id, node); vertices.set(v.id, { ...v, layer: 0, row: 0, x: 0, y: 0, w: CARD_W, h: CARD_H }); };
  const rep: Record<string, string> = {};

  // a node is drawn as a BOX when it has sub-nodes or lists its objects; a collapsed node keeps one summary card standing for its objects
  const hasBox = (n: TreeNode) => groupBy !== 'dependency' && ((children.get(n.id)?.length ?? 0) > 0 || (isExpanded(n.id) && (countBy.get(n.id) ?? 0) > 0));
  const hasCard = (n: TreeNode) => { const c = countBy.get(n.id) ?? 0; return (!isExpanded(n.id) && c > 0) || (c === 0 && !(children.get(n.id)?.length)); };
  for (const n of input.nodes) {
    if (!hasCard(n)) continue;
    const id = `n:${n.id}`;
    add({ id, kind: 'node', label: n.label, nodeId: n.id, count: countBy.get(n.id) ?? 0, expanded: isExpanded(n.id) }, n.id);
    rep[id] = id;
  }
  for (const o of objects) {
    const nodeV = `n:${o.nodeId}`;
    if (isExpanded(o.nodeId) && nodeIds.has(o.nodeId)) {
      const id = `o:${o.id}`;
      add({ id, kind: 'object', label: o.title, objectId: o.id, nodeId: o.nodeId, type: o.type, status: o.status, review: input.reviewObjectIds?.has(o.id), ...(o.facets?.[0] ? { facet: o.facets[0] } : {}) }, o.nodeId);
      rep[id] = id;
    } else rep[`o:${o.id}`] = vertices.has(nodeV) ? nodeV : '';
  }
  if (showAssets) {
    if (assetsIndividually) {
      for (const d of input.deliverables) {
        const id = `a:${d.id}`;
        add({ id, kind: 'asset', label: d.title, assetId: d.id, review: input.staleAssetIds?.has(d.id) }, null);
        rep[id] = id;
      }
    } else if (input.deliverables.length) {
      add({ id: 'assets', kind: 'assets', label: 'دارایی‌ها', count: input.deliverables.length }, null);
      for (const d of input.deliverables) rep[`a:${d.id}`] = 'assets';
    }
  }

  // raw relations → representative vertices, merged with a count; `flow` = direction used for layering (from the depended-on thing to what rests on it)
  const edgeMap = new Map<string, MapEdge & { flowFrom: string; flowTo: string }>();
  const link = (kind: MapEdgeKind, fromKey: string, toKey: string) => {
    const a = rep[fromKey], b = rep[toKey];
    if (!a || !b || a === b) return;
    const key = `${kind}|${a}|${b}`;
    const cur = edgeMap.get(key);
    if (cur) cur.count++;
    else edgeMap.set(key, { id: key, from: a, to: b, kind, label: EDGE_LABEL[kind], count: 1, influencer: kind === 'supersedes' ? a : b, influenced: kind === 'supersedes' ? b : a, flowFrom: b, flowTo: a });
  };
  for (const r of input.relationships) {
    if (r.type === 'depends_on') link('dependency', `o:${r.sourceId}`, `o:${r.targetId}`);
    else if (r.type === 'supersedes') link('supersedes', `o:${r.sourceId}`, `o:${r.targetId}`);
  }
  if (showAssets) for (const d of input.deliverables) for (const u of d.usedContext ?? []) link('lineage', `a:${d.id}`, `o:${u.id}`);
  const edges = [...edgeMap.values()];

  // layers from the flow edges ALONE: two unrelated things (e.g. sibling nodes) always share a layer
  const ids = [...vertices.keys()];
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.flowFrom, [...(out.get(e.flowFrom) ?? []), e.flowTo]);
  const layer = layersOf(ids, out);
  const maxLayer = Math.max(0, ...layer.values());
  const xOf = (l: number) => (maxLayer - l) * (CARD_W + GAP_X); // RTL: the first layer is the rightmost

  const ownedBy = new Map<string | null, string[]>();
  for (const id of ids) ownedBy.set(owner.get(id) ?? null, [...(ownedBy.get(owner.get(id) ?? null) ?? []), id]);

  // rows: boxes stack top to bottom (tree order, no meaning); inside a box its own cards share rows across layers, then its sub-boxes
  const groups: MapGroup[] = [];
  const place = (node: TreeNode | null, depth: number, yStart: number): { y: number; x0: number; x1: number } => {
    const box = !!node && hasBox(node);
    let cursor = yStart + (box ? GROUP_HEAD : 0);
    let x0 = Infinity, x1 = -Infinity;
    const own = (ownedBy.get(node ? node.id : null) ?? []).slice().sort((a, b) => seq.get(a)! - seq.get(b)!);
    const perLayer = new Map<number, string[]>();
    for (const id of own) perLayer.set(layer.get(id)!, [...(perLayer.get(layer.get(id)!) ?? []), id]);
    const ownRows = Math.max(0, ...[...perLayer.values()].map((l) => l.length));
    for (const [l, list] of perLayer) list.forEach((id, i) => {
      const v = vertices.get(id)!;
      v.layer = l; v.row = i; v.x = xOf(l); v.y = cursor + i * (CARD_H + GAP_Y);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x + v.w);
    });
    if (ownRows) cursor += ownRows * CARD_H + (ownRows - 1) * GAP_Y;
    const sub = node ? children.get(node.id) ?? [] : []; // (the loose pass, node = null, has no sub-boxes)
    let placedAny = ownRows > 0;
    for (const c of sub) {
      const r = place(c, depth + 1, cursor + (placedAny ? GROUP_GAP : 0));
      if (r.y === cursor + (placedAny ? GROUP_GAP : 0)) continue; // empty: nothing was drawn
      cursor = r.y; placedAny = true;
      x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1);
    }
    if (!box || !node) return { y: placedAny ? cursor : yStart, x0, x1 };
    const w = Math.max(CARD_W, x1 - x0) + 2 * GROUP_PAD;
    const cx = Number.isFinite(x0) ? x0 - GROUP_PAD : 0;
    groups.push({ id: `g:${node.id}`, nodeId: node.id, label: node.label, depth, count: countBy.get(node.id) ?? 0, expanded: isExpanded(node.id), x: cx, y: yStart, w, h: cursor + GROUP_PAD - yStart });
    return { y: cursor + GROUP_PAD, x0: cx, x1: cx + w };
  };
  let cursor = 0;
  let any = false;
  let gx0 = Infinity, gx1 = -Infinity;
  for (const r of roots) {
    const start = cursor + (any ? GROUP_GAP : 0);
    const res = place(r, 0, start);
    if (res.y === start) continue;
    cursor = res.y; any = true;
    gx0 = Math.min(gx0, res.x0); gx1 = Math.max(gx1, res.x1);
  }
  const looseStart = cursor + (any ? GROUP_GAP : 0);
  const loose = place(null, 0, looseStart); // assets: outside every box, after the tree
  if (loose.y !== looseStart) { cursor = loose.y; any = true; gx0 = Math.min(gx0, loose.x0); gx1 = Math.max(gx1, loose.x1); }

  // shift everything so the top-left of the drawing is (0, 0)
  const minX = Math.min(gx0, ...[...vertices.values()].map((v) => v.x), ...groups.map((g) => g.x));
  const shiftX = Number.isFinite(minX) ? -minX : 0;
  for (const v of vertices.values()) v.x += shiftX;
  for (const g of groups) g.x += shiftX;
  const maxX = Math.max(0, ...[...vertices.values()].map((v) => v.x + v.w), ...groups.map((g) => g.x + g.w));
  groups.sort((a, b) => a.depth - b.depth || a.y - b.y); // parents are drawn before their children
  return {
    vertices: [...vertices.values()],
    groups,
    expandedNodes: groupBy === 'domain' ? input.nodes.filter((n) => isExpanded(n.id)).map((n) => n.id) : [],
    groupBy,
    edges: edges.map(({ flowFrom: _f, flowTo: _t, ...e }) => e),
    width: maxX,
    height: Math.max(0, cursor),
    rep,
    summary: { objects: objects.length, assets: input.deliverables.length, collapsedNodes: input.nodes.filter((n) => !isExpanded(n.id) && (countBy.get(n.id) ?? 0) > 0).length },
  };
}

export interface Impact { objectIds: Set<string>; assetIds: Set<string> }

/** the path of effect of changing one object: it, everything that (transitively) depends on it, and the assets built from any of them */
export function impactOf(input: Pick<MapInput, 'objects' | 'relationships' | 'deliverables'>, objectId: string): Impact {
  const objectIds = new Set([objectId, ...dependentsOf(objectId, input.relationships, input.objects)]);
  const assetIds = new Set(input.deliverables.filter((d) => (d.usedContext ?? []).some((u) => objectIds.has(u.id))).map((d) => d.id));
  return { objectIds, assetIds };
}

/** vertices and edges to light up for an impact (via the current representatives, so collapsed groups light up too) */
export function highlightOf(model: MapModel, impact: Impact): { vertexIds: Set<string>; edgeIds: Set<string> } {
  const vertexIds = new Set<string>();
  for (const id of impact.objectIds) { const v = model.rep[`o:${id}`]; if (v) vertexIds.add(v); }
  for (const id of impact.assetIds) { const v = model.rep[`a:${id}`]; if (v) vertexIds.add(v); }
  const edgeIds = new Set(model.edges.filter((e) => vertexIds.has(e.from) && vertexIds.has(e.to)).map((e) => e.id));
  return { vertexIds, edgeIds };
}

/** the object of the newest change that altered what an object says (for the «اثر تغییر» mode) */
export function latestChangedObject(changes: ContextChange[]): string | undefined {
  let best: ContextChange | undefined;
  for (const c of changes) if (isContentChange(c) && (!best || c.at > best.at)) best = c;
  return best?.objectId;
}

export interface Rect { x: number; y: number; w: number; h: number }
/** the grouping boxes that intersect the viewport */
export function visibleGroups(model: MapModel, view: Rect, margin = 200): MapGroup[] {
  const x0 = view.x - margin, y0 = view.y - margin, x1 = view.x + view.w + margin, y1 = view.y + view.h + margin;
  return model.groups.filter((g) => g.x + g.w >= x0 && g.x <= x1 && g.y + g.h >= y0 && g.y <= y1);
}

/** only what intersects the viewport (plus a margin) is drawn — keeps a very large map smooth */
export function visibleVertices(model: MapModel, view: Rect, margin = 200): MapVertex[] {
  const x0 = view.x - margin, y0 = view.y - margin, x1 = view.x + view.w + margin, y1 = view.y + view.h + margin;
  return model.vertices.filter((v) => v.x + v.w >= x0 && v.x <= x1 && v.y + v.h >= y0 && v.y <= y1);
}
