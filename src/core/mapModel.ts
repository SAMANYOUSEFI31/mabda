/**
 * Map model («نقشه»): turns nodes, objects, assets and relations into a layered diagram. Pure — the view only draws it.
 *
 *  • vertices: tree nodes, context objects, assets; a COLLAPSED node stands for all its objects (and edges between
 *    collapsed groups are merged with a count), so thousands of objects stay readable and fast
 *  • edges are typed: structural (belongs to a node / sub-node), dependency (depends_on), lineage (asset built from an
 *    object, derived_from) and supersedes (replaced by) — each with a Persian label
 *  • layout: longest-path layers (cycles share a layer), rows ordered by tree position then by neighbours; for RTL the
 *    first layer is the rightmost, so reading flows right → left. Coordinates are plain numbers (drawn with transform).
 */

import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../types';
import { isContentChange } from './changeLog';
import { dependentsOf } from './decisionGraph';
import { layersOf } from './graphAlgo';

export type MapVertexKind = 'node' | 'object' | 'asset' | 'assets';
export type MapEdgeKind = 'structural' | 'dependency' | 'lineage' | 'supersedes';

export const EDGE_LABEL: Record<MapEdgeKind, string> = { structural: 'تعلق به', dependency: 'وابسته به', lineage: 'ساخته‌شده از', supersedes: 'جایگزین کرد' };

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
  layer: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface MapEdge { id: string; from: string; to: string; kind: MapEdgeKind; label: string; count: number }

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
}
export interface MapModel {
  vertices: MapVertex[];
  edges: MapEdge[];
  width: number;
  height: number;
  /** entity key ('o:<objectId>', 'a:<assetId>', 'n:<nodeId>') → the vertex that represents it right now */
  rep: Record<string, string>;
  summary: { objects: number; assets: number; collapsedNodes: number };
}

export const CARD_W = 220;
export const CARD_H = 64;
export const GAP_X = 96;
export const GAP_Y = 20;

const isActive = (o: ContextObject) => o.status !== 'Superseded' && o.status !== 'Archived';

export function buildMapModel(input: MapInput, opts: MapOptions = {}): MapModel {
  const showAssets = opts.showAssets ?? true;
  const objects = input.objects.filter((o) => opts.includeHistory || isActive(o));
  const nodeIds = new Set(input.nodes.map((n) => n.id));
  const countBy = new Map<string, number>();
  for (const o of objects) countBy.set(o.nodeId, (countBy.get(o.nodeId) ?? 0) + 1);
  const small = objects.length <= (opts.autoExpandBelow ?? 150);
  const isExpanded = (nodeId: string) => (opts.expanded ? opts.expanded.has(nodeId) : small);
  const assetsIndividually = showAssets && input.deliverables.length <= (opts.assetClusterAbove ?? 150);

  // tree order → stable grouping of rows
  const children = new Map<string, TreeNode[]>();
  for (const n of input.nodes) if (n.parentId && nodeIds.has(n.parentId)) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  for (const list of children.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const roots = input.nodes.filter((n) => !n.parentId || !nodeIds.has(n.parentId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const nodeIdx = new Map<string, number>();
  const stack = [...roots].reverse();
  while (stack.length) { const n = stack.pop()!; nodeIdx.set(n.id, nodeIdx.size); stack.push(...[...(children.get(n.id) ?? [])].reverse()); }

  const vertices = new Map<string, MapVertex>();
  const add = (v: Omit<MapVertex, 'layer' | 'row' | 'x' | 'y' | 'w' | 'h'>) => vertices.set(v.id, { ...v, layer: 0, row: 0, x: 0, y: 0, w: CARD_W, h: CARD_H });
  const rep: Record<string, string> = {};
  const order = new Map<string, number>(); // grouping key for rows

  for (const n of input.nodes) {
    const id = `n:${n.id}`;
    add({ id, kind: 'node', label: n.label, nodeId: n.id, count: countBy.get(n.id) ?? 0, expanded: isExpanded(n.id) });
    rep[id] = id; order.set(id, nodeIdx.get(n.id) ?? 0);
  }
  for (const o of objects) {
    const nodeV = `n:${o.nodeId}`;
    if (!vertices.has(nodeV)) { rep[`o:${o.id}`] = ''; continue; }
    if (isExpanded(o.nodeId)) {
      const id = `o:${o.id}`;
      add({ id, kind: 'object', label: o.title, objectId: o.id, nodeId: o.nodeId, type: o.type, status: o.status, review: input.reviewObjectIds?.has(o.id) });
      rep[id] = id; order.set(id, (nodeIdx.get(o.nodeId) ?? 0) + 0.5);
    } else rep[`o:${o.id}`] = nodeV;
  }
  const lastGroup = input.nodes.length + 1;
  if (showAssets) {
    if (assetsIndividually) {
      for (const d of input.deliverables) {
        const id = `a:${d.id}`;
        add({ id, kind: 'asset', label: d.title, assetId: d.id, review: input.staleAssetIds?.has(d.id) });
        rep[id] = id; order.set(id, lastGroup);
      }
    } else if (input.deliverables.length) {
      add({ id: 'assets', kind: 'assets', label: 'دارایی‌ها', count: input.deliverables.length });
      for (const d of input.deliverables) rep[`a:${d.id}`] = 'assets';
      order.set('assets', lastGroup);
    }
  }

  // raw relations → representative vertices, merged with a count; `flow` = direction used for layering
  const edgeMap = new Map<string, MapEdge & { flowFrom: string; flowTo: string }>();
  const link = (kind: MapEdgeKind, fromKey: string, toKey: string, flowIsReverse: boolean) => {
    const a = rep[fromKey], b = rep[toKey];
    if (!a || !b || a === b) return;
    const key = `${kind}|${a}|${b}`;
    const cur = edgeMap.get(key);
    if (cur) cur.count++;
    else edgeMap.set(key, { id: key, from: a, to: b, kind, label: EDGE_LABEL[kind], count: 1, flowFrom: flowIsReverse ? b : a, flowTo: flowIsReverse ? a : b });
  };
  for (const n of input.nodes) if (n.parentId && nodeIds.has(n.parentId)) link('structural', `n:${n.id}`, `n:${n.parentId}`, true);
  for (const o of objects) if (isExpanded(o.nodeId)) link('structural', `o:${o.id}`, `n:${o.nodeId}`, true);
  for (const r of input.relationships) {
    if (r.type === 'depends_on') link('dependency', `o:${r.sourceId}`, `o:${r.targetId}`, true);
    else if (r.type === 'supersedes') link('supersedes', `o:${r.sourceId}`, `o:${r.targetId}`, true);
  }
  if (showAssets) for (const d of input.deliverables) for (const u of d.usedContext ?? []) link('lineage', `a:${d.id}`, `o:${u.id}`, true);
  const edges = [...edgeMap.values()];

  // layers, rows
  const ids = [...vertices.keys()];
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.flowFrom, [...(out.get(e.flowFrom) ?? []), e.flowTo]);
  const layer = layersOf(ids, out);
  const maxLayer = Math.max(0, ...layer.values());
  const byLayer: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of ids) byLayer[layer.get(id)!].push(id);
  const row = new Map<string, number>();
  const sortKey = (id: string) => order.get(id) ?? 0;
  byLayer.forEach((l) => { l.sort((a, b) => sortKey(a) - sortKey(b) || a.localeCompare(b)); l.forEach((id, i) => row.set(id, i)); });
  const incoming = new Map<string, string[]>();
  for (const e of edges) incoming.set(e.flowTo, [...(incoming.get(e.flowTo) ?? []), e.flowFrom]);
  for (let pass = 0; pass < 2; pass++) {
    for (let li = 1; li < byLayer.length; li++) {
      const bary = (id: string) => { const ns = (incoming.get(id) ?? []).filter((n) => layer.get(n)! < li); return ns.length ? ns.reduce((s, n) => s + row.get(n)!, 0) / ns.length : row.get(id)!; };
      const key = new Map(byLayer[li].map((id) => [id, bary(id)]));
      byLayer[li].sort((a, b) => sortKey(a) - sortKey(b) || key.get(a)! - key.get(b)! || a.localeCompare(b));
      byLayer[li].forEach((id, i) => row.set(id, i));
    }
  }
  const rows = Math.max(1, ...byLayer.map((l) => l.length));
  for (const v of vertices.values()) {
    v.layer = layer.get(v.id)!; v.row = row.get(v.id)!;
    v.x = (maxLayer - v.layer) * (CARD_W + GAP_X); // RTL: the first layer is the rightmost
    v.y = v.row * (CARD_H + GAP_Y);
  }
  return {
    vertices: [...vertices.values()],
    edges: edges.map(({ flowFrom: _f, flowTo: _t, ...e }) => e),
    width: (maxLayer + 1) * CARD_W + maxLayer * GAP_X,
    height: rows * CARD_H + (rows - 1) * GAP_Y,
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
  const edgeIds = new Set(model.edges.filter((e) => e.kind !== 'structural' && vertexIds.has(e.from) && vertexIds.has(e.to)).map((e) => e.id));
  return { vertexIds, edgeIds };
}

/** the object of the newest change that altered what an object says (for the «اثر تغییر» mode) */
export function latestChangedObject(changes: ContextChange[]): string | undefined {
  let best: ContextChange | undefined;
  for (const c of changes) if (isContentChange(c) && (!best || c.at > best.at)) best = c;
  return best?.objectId;
}

export interface Rect { x: number; y: number; w: number; h: number }
/** only what intersects the viewport (plus a margin) is drawn — keeps a very large map smooth */
export function visibleVertices(model: MapModel, view: Rect, margin = 200): MapVertex[] {
  const x0 = view.x - margin, y0 = view.y - margin, x1 = view.x + view.w + margin, y1 = view.y + view.h + margin;
  return model.vertices.filter((v) => v.x + v.w >= x0 && v.x <= x1 && v.y + v.h >= y0 && v.y <= y1);
}
