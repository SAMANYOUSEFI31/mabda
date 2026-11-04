/**
 * The canvas scene: ONE shape for the three layouts of the unified «بوم», built from the models that already exist
 * (mapModel for «رابطه‌ها», canvasModel for «تابلو», stored positions for «آزاد»). Pure — the view only draws a scene.
 *
 *  · items  — cards (object, node summary, asset, asset cluster, free note) with a fixed anatomy: type icon, title,
 *             status chip, small badges (review, assumption, expired, global reach)
 *  · boxes  — what the grouping looks like: domain boxes, board columns/rows (they carry no order unless the layout says so)
 *  · edges  — typed, always drawn from the INFLUENCER to the influenced
 * Nothing is stored here: a layout and its options are a changeable view.
 */

import { redundantLinks } from './dependencyReduction';
import type { ContextObject, ContextRelationship, GeneratedDeliverable, Note, TreeNode } from '../types';
import type { CanvasItem } from '../types/state';
import { buildCanvasModel, CARD_H as BOARD_CARD_H, CARD_W as BOARD_CARD_W } from './canvasModel';
import type { BoardColumns, BoardRows } from './canvasModel';
import { isExpired, reachOf } from './effectiveContext';
import { thinkingOf, convertedTo } from './thinkingMarkers';
import { buildMapModel, EDGE_LABEL } from './mapModel';
import type { MapEdgeKind } from './mapModel';

export type CanvasLayout = 'relations' | 'board' | 'free';
export const LAYOUT_FA: Record<CanvasLayout, string> = { relations: 'رابطه‌ها', board: 'تابلو', free: 'آزاد' };
/** the one-sentence answer each layout gives (shown as «این چیست؟») */
export const LAYOUT_ABOUT: Record<CanvasLayout, { question: string; what: string }> = {
  relations: { question: 'چه چیزی روی چه چیزی اثر می‌گذارد؟', what: 'کارت‌ها خودکار از وابستگی، تبار و جایگزینی چیده می‌شوند؛ پیکان از اثرگذار به اثرپذیر می‌رود. جعبه‌ها گره‌های درخت‌اند و ترتیب ندارند.' },
  board: { question: 'هر چیز در چه حالی است و در کدام دسته؟', what: 'ستون‌ها و ردیف‌ها را خودت انتخاب می‌کنی. با ستون «وضعیت» می‌شود کارت را کشید تا وضعیتش عوض شود؛ بقیهٔ ستون‌ها فقط نمایش‌اند.' },
  free: { question: 'می‌خواهم قبل از ساختار دادن فکر کنم.', what: 'یادداشت و کارت را هر جا خواستی بگذار. یادداشت‌ها هرگز دانش نیستند و به AI داده نمی‌شوند؛ هر وقت آماده شدی به دانش پیشنهادی تبدیلشان کن.' },
};
export const EDGE_ABOUT: Record<MapEdgeKind, string> = {
  dependency: 'تصمیمی که پیکان به آن می‌رسد روی تصمیم مبدأ سوار است؛ اگر مبدأ عوض شود مقصد نیاز به بازبینی پیدا می‌کند.',
  lineage: 'خروجی (دارایی) از Context مبدأ ساخته شده؛ با تغییر مبدأ، خروجی «قدیمی» می‌شود.',
  supersedes: 'مبدأ جای مقصد را گرفته؛ مقصد حذف نمی‌شود و در تاریخچه می‌ماند.',
};

export const NOTE_W = 220;
export const NOTE_H = 120;
export const HEAD = 44; // board column headers sit above the rows

export type SceneItemKind = 'object' | 'node' | 'asset' | 'assets' | 'note';
export interface SceneItem {
  id: string;
  kind: SceneItemKind;
  label: string;
  /** a short extract (shown at the near zoom level) */
  summary?: string;
  x: number; y: number; w: number; h: number;
  objectId?: string; nodeId?: string; assetId?: string; noteId?: string;
  type?: ContextObject['type'];
  status?: ContextObject['status'];
  /** badges */
  review?: boolean; assumption?: boolean; expired?: boolean; global?: boolean; sample?: boolean;
  /** not approved yet (a suggestion or a «needs review»): only drawn when «نشان بده چه در راه است» is on */
  pending?: boolean;
  /** thinking canvas: not placed yet — shown in the «تازه‌ها» tray until she drags it somewhere */
  unplaced?: boolean;
  facet?: string;
  count?: number;
  expanded?: boolean;
  /** board: the status column (for the move rules) */
  lane?: 'thinking' | 'confirmed';
}
export interface SceneBox { id: string; kind: 'group' | 'column' | 'row' | 'zone'; label: string; depth: number; x: number; y: number; w: number; h: number; nodeId?: string; count?: number; expanded?: boolean; hint?: string }
export interface SceneEdge { id: string; kind: MapEdgeKind; label: string; /** one end is not approved yet: a suggested relation — it becomes real by itself when that end is approved */ pending?: boolean; /** the one that acts */ influencer: string; /** the one that is acted on */ influenced: string; count: number; /** a direct link that adds nothing: the same reach goes through another card — drawn quieter, never hidden */ redundant?: boolean }
export interface Scene { /** board: the ordered object ids of every cell (`column|row`) — what an undo of a move restores */ cells?: Record<string, string[]>; layout: CanvasLayout; items: SceneItem[]; boxes: SceneBox[]; edges: SceneEdge[]; width: number; height: number; summary: { objects: number; assets: number; notes: number }; /** the board's column / row kinds (display only unless columns = status) */ board?: { columns: BoardColumns; rows: BoardRows } }

export interface SceneInput {
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  notes: Note[];
  /** stored positions: decision-board ranks and free-zone x/y */
  canvas: { decisions: CanvasItem[]; free: CanvasItem[] };
  reviewIds: Set<string>;
  staleAssetIds: Set<string>;
  now?: Date;
}
export interface SceneOptions {
  /** relations: show assets / replaced objects / the domain boxes; expanded nodes (default: automatic) */
  showAssets?: boolean; includeHistory?: boolean; boxes?: boolean; expanded?: Set<string>;
  /** board */
  columns?: BoardColumns; rows?: BoardRows;
  /** keep only what needs a review (a filter, not a column) */
  onlyReview?: boolean;
  /** relations («بوم حقیقت»): the map shows only what is approved; with this on, suggestions and what needs a look appear too — drawn faint, so their effect is seen BEFORE a yes */
  showPending?: boolean;
  /** free («بوم فکر»): also show what has no place yet — open thoughts and suggestions — in a «تازه‌ها» tray */
  tray?: boolean;
}

/** a relation with an end that is not approved yet (a suggestion, a thing that needs a look): a suggested relation, not truth */
export const isPendingRelation = (r: { sourceId: string; targetId: string }, byId: Map<string, Pick<ContextObject, 'status'>>): boolean => {
  const bad = (id: string) => { const o = byId.get(id); return !!o && (o.status === 'Proposed' || o.status === 'Needs Review'); };
  return bad(r.sourceId) || bad(r.targetId);
};

const extract = (s: string, n = 140) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const badges = (o: ContextObject, review: boolean, now: Date) => ({
  ...(review ? { review: true } : {}), ...(o.assumption ? { assumption: true } : {}), ...(isExpired(o, now) ? { expired: true } : {}), ...(reachOf(o) === 'global' && o.reach === 'global' ? { global: true } : {}), ...(o.sample ? { sample: true } : {}),
});

export function buildScene(layout: CanvasLayout, input: SceneInput, opts: SceneOptions = {}): Scene {
  const now = input.now ?? new Date();
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const filterObjects = (list: ContextObject[]) => (opts.onlyReview ? list.filter((o) => input.reviewIds.has(o.id) || o.status === 'Needs Review') : list);

  if (layout === 'relations') {
    const isPending = (o: ContextObject) => o.status === 'Proposed' || o.status === 'Needs Review';
    const objects = filterObjects(opts.showPending ? input.objects : input.objects.filter((o) => !isPending(o)));
    const m = buildMapModel({ nodes: input.nodes, objects, relationships: input.relationships, deliverables: input.deliverables, reviewObjectIds: input.reviewIds, staleAssetIds: input.staleAssetIds }, { showAssets: opts.showAssets ?? true, includeHistory: opts.includeHistory, groupBy: opts.boxes === false ? 'dependency' : 'domain', expanded: opts.expanded });
    const items: SceneItem[] = m.vertices.map((v) => {
      const o = v.objectId ? byId.get(v.objectId) : undefined;
      return {
        id: v.id, kind: v.kind, label: v.label, x: v.x, y: v.y, w: v.w, h: v.h, ...(v.objectId ? { objectId: v.objectId } : {}), ...(v.nodeId ? { nodeId: v.nodeId } : {}), ...(v.assetId ? { assetId: v.assetId } : {}),
        ...(v.type ? { type: v.type } : {}), ...(v.status ? { status: v.status } : {}), ...(v.facet ? { facet: v.facet } : {}), ...(v.count !== undefined ? { count: v.count } : {}), ...(v.expanded !== undefined ? { expanded: v.expanded } : {}),
        ...(o ? { summary: extract(o.content), ...badges(o, !!v.review, now), ...(isPending(o) ? { pending: true } : {}) } : v.review ? { review: true } : {}),
      };
    });
    const boxes: SceneBox[] = m.groups.map((g) => ({ id: g.id, kind: 'group', label: g.label, depth: g.depth, x: g.x, y: g.y, w: g.w, h: g.h, nodeId: g.nodeId, count: g.count, expanded: g.expanded, hint: 'گرهٔ درخت (دامنه)؛ ترتیب ندارد.' }));
    const idOf = (v: string) => (v.startsWith('o:') ? v.slice(2) : v);
    // dependency links that another path already implies (A→B→C and A→C): the direct one is quieter on the canvas
    const redundant = new Set(redundantLinks(input.objects, input.relationships).map((l) => `${l.to}>${l.from}`)); // influencer (the depended-on) > influenced
    const edges: SceneEdge[] = m.edges.map((e) => ({ id: e.id, kind: e.kind, label: e.label, influencer: e.influencer, influenced: e.influenced, count: e.count, ...(e.kind === 'dependency' && redundant.has(`${idOf(e.influencer)}>${idOf(e.influenced)}`) ? { redundant: true } : {}), ...(isPendingRelation({ sourceId: idOf(e.influencer), targetId: idOf(e.influenced) }, byId) ? { pending: true } : {}) }));
    return { layout, items, boxes, edges, width: m.width, height: m.height, summary: { objects: m.summary.objects, assets: m.summary.assets, notes: 0 } };
  }

  if (layout === 'board') {
    const ranks = new Map(input.canvas.decisions.filter((i) => i.rank !== undefined).map((i) => [i.itemRef.slice(4), i.rank!]));
    const model = buildCanvasModel({ nodes: input.nodes, objects: input.objects, reviewIds: input.reviewIds, ranks, columns: opts.columns, rows: opts.rows, relationships: input.relationships, onlyReview: opts.onlyReview });
    const items: SceneItem[] = model.cards.map((c) => {
      const o = byId.get(c.objectId)!;
      return { id: c.id, kind: 'object', label: o.title, summary: extract(o.content), x: c.x, y: c.y + HEAD, w: c.w, h: c.h, objectId: o.id, nodeId: o.nodeId, type: o.type, status: o.status, lane: c.lane, ...(o.facets?.[0] ? { facet: o.facets[0] } : {}), ...badges(o, c.review, now) };
    });
    const boxes: SceneBox[] = [
      ...model.lanes.map((b): SceneBox => ({ id: `col:${b.lane}`, kind: 'column', label: b.label, depth: 0, x: b.x, y: 0, w: b.w, h: HEAD - 6, hint: model.columns === 'status' ? 'ستون وضعیت: کشیدن کارت به ستون دیگر وضعیتش را عوض می‌کند.' : 'ستون فقط نمایش است؛ کشیدن کارت چیزی را عوض نمی‌کند.' })),
      ...model.rows.map((r): SceneBox => ({ id: `row:${r.nodeId}`, kind: 'row', label: r.label, depth: r.depth, x: 0, y: r.y + HEAD, w: model.width, h: r.h, nodeId: model.rows_ === 'domain' ? r.nodeId : undefined, hint: model.rows_ === 'domain' ? 'گرهٔ درخت: کشیدن کارت به ردیف دیگر گره‌اش را عوض می‌کند.' : 'ردیف فقط نمایش است.' })),
    ];
    const present = new Set(items.map((i) => i.objectId));
    const edges: SceneEdge[] = [];
    for (const r of input.relationships) {
      if (r.type !== 'depends_on' || !present.has(r.sourceId) || !present.has(r.targetId)) continue;
      edges.push({ id: `dependency|o:${r.sourceId}|o:${r.targetId}`, kind: 'dependency', label: EDGE_LABEL.dependency, influencer: `o:${r.targetId}`, influenced: `o:${r.sourceId}`, count: 1 });
    }
    return { layout, items, boxes, edges, width: model.width, height: model.height + HEAD, summary: { objects: items.length, assets: 0, notes: 0 }, board: { columns: model.columns, rows: model.rows_ }, cells: Object.fromEntries([...model.cells.entries()].map(([k, list]) => [k, list.map((c) => c.objectId)])) };
  }

  // free: notes and cards placed by the user, at the positions she stored (display only; nothing reads x / y)
  const items: SceneItem[] = [];
  for (const i of input.canvas.free) {
    if (i.itemRef.startsWith('note:')) {
      const note = input.notes.find((n) => `note:${n.id}` === i.itemRef);
      if (note) items.push({ id: i.itemRef, kind: 'note', label: note.content.split('\n')[0].slice(0, 80), summary: extract(note.content, 400), x: i.x ?? 0, y: i.y ?? 0, w: NOTE_W, h: NOTE_H, noteId: note.id, nodeId: note.nodeId });
    } else if (i.itemRef.startsWith('obj:')) {
      const o = byId.get(i.itemRef.slice(4));
      if (o && (!opts.onlyReview || input.reviewIds.has(o.id) || o.status === 'Needs Review')) items.push({ id: `o:${o.id}`, kind: 'object', label: o.title, summary: extract(o.content), x: i.x ?? 0, y: i.y ?? 0, w: BOARD_CARD_W, h: BOARD_CARD_H, objectId: o.id, nodeId: o.nodeId, type: o.type, status: o.status, ...badges(o, input.reviewIds.has(o.id), now) });
    }
  }
  for (const it of items) if (it.objectId) { const o = byId.get(it.objectId); if (o && (o.status === 'Proposed' || o.status === 'Needs Review')) it.pending = true; }
  const boxes: SceneBox[] = [];
  if (opts.tray) {
    // what has no place yet: suggestions, things that need a look, and notes holding an open thought — in one column after everything placed
    const placedObj = new Set(items.map((i) => i.objectId).filter(Boolean));
    const placedNote = new Set(items.map((i) => i.noteId).filter(Boolean));
    const loose: SceneItem[] = [];
    const bad = new Set(['Proposed', 'Needs Review']);
    for (const o of input.objects) {
      if (!bad.has(o.status) || o.sample || placedObj.has(o.id)) continue;
      if (opts.onlyReview && !input.reviewIds.has(o.id) && o.status !== 'Needs Review') continue;
      loose.push({ id: `o:${o.id}`, kind: 'object', label: o.title, summary: extract(o.content), x: 0, y: 0, w: BOARD_CARD_W, h: BOARD_CARD_H, objectId: o.id, nodeId: o.nodeId, type: o.type, status: o.status, pending: true, unplaced: true, ...badges(o, input.reviewIds.has(o.id), now) });
    }
    const placedNoteIds = new Set(input.canvas.free.filter((i) => i.itemRef.startsWith('note:')).map((i) => i.itemRef.slice(5)));
    for (const n of input.notes) {
      if (placedNote.has(n.id) || placedNoteIds.has(n.id)) continue;
      const open = thinkingOf([n]).filter((t) => !convertedTo(t, input.objects));
      if (open.length === 0) continue;
      loose.push({ id: `note:${n.id}`, kind: 'note', label: n.content.split('\n')[0].slice(0, 80), summary: extract(n.content, 400), x: 0, y: 0, w: NOTE_W, h: NOTE_H, noteId: n.id, nodeId: n.nodeId, unplaced: true });
    }
    if (loose.length) {
      const x0 = items.length ? Math.max(...items.map((i) => i.x + i.w)) + 80 : 40;
      let y = 60;
      for (const it of loose) { it.x = x0; it.y = y; y += it.h + 24; items.push(it); }
      boxes.push({ id: 'zone:tray', kind: 'zone', label: 'تازه‌ها — هنوز جایی نگذاشته‌ای', depth: 0, x: x0 - 20, y: 10, w: Math.max(...loose.map((i) => i.w)) + 40, h: y - 10, hint: 'فکرهای باز و پیشنهادها. هر کدام را بکش و جایی بگذار؛ تا نگذاری فقط اینجا دیده می‌شود.' });
    }
  }
  const present = new Set(items.map((i) => i.objectId));
  const edges: SceneEdge[] = [];
  for (const r of input.relationships) {
    if (r.type !== 'depends_on' || !present.has(r.sourceId) || !present.has(r.targetId)) continue;
    edges.push({ id: `dependency|o:${r.sourceId}|o:${r.targetId}`, kind: 'dependency', label: EDGE_LABEL.dependency, influencer: `o:${r.targetId}`, influenced: `o:${r.sourceId}`, count: 1, ...(isPendingRelation(r, byId) ? { pending: true } : {}) });
  }
  const width = Math.max(960, ...items.map((i) => i.x + i.w + 60));
  const height = Math.max(520, ...items.map((i) => i.y + i.h + 60));
  return { layout, items, boxes, edges, width, height, summary: { objects: items.filter((i) => i.kind === 'object').length, assets: 0, notes: items.filter((i) => i.kind === 'note').length } };
}

/** objects that can be placed in the free space: live, not placed yet */
export const placeable = (objects: ContextObject[], free: CanvasItem[]): ContextObject[] => {
  const placed = new Set(free.filter((i) => i.itemRef.startsWith('obj:')).map((i) => i.itemRef.slice(4)));
  return objects.filter((o) => o.status !== 'Superseded' && o.status !== 'Archived' && !placed.has(o.id));
};

/** where a board card sits in its own cell: the column, the row, and the cards just before and after it */
export function sceneNeighbours(scene: Scene, objectId: string): { lane: 'thinking' | 'confirmed'; nodeId: string; beforeId?: string; afterId?: string } | undefined {
  const item = scene.items.find((i) => i.objectId === objectId);
  if (!item?.lane || !scene.cells) return undefined;
  const list = Object.values(scene.cells).find((l) => l.includes(objectId));
  if (!list) return undefined;
  const i = list.indexOf(objectId);
  return { lane: item.lane, nodeId: item.nodeId ?? '', beforeId: list[i - 1], afterId: list[i + 1] };
}

/**
 * Keyboard navigation between cards: the nearest card in a direction (up / down / toward the start side / toward the end side).
 * Coordinates are stage coordinates; for RTL the caller maps «start» to the larger x.
 */
export function neighbourInDirection(items: Array<Pick<SceneItem, 'id' | 'x' | 'y' | 'w' | 'h'>>, fromId: string, dir: 'up' | 'down' | 'left' | 'right'): string | undefined {
  const from = items.find((i) => i.id === fromId);
  if (!from) return undefined;
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  let best: { id: string; score: number } | undefined;
  for (const it of items) {
    if (it.id === fromId) continue;
    const dx = it.x + it.w / 2 - cx, dy = it.y + it.h / 2 - cy;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    if (along <= 1) continue;
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = along + across * 2; // prefer the card that is mostly in line
    if (!best || score < best.score || (score === best.score && it.id < best.id)) best = { id: it.id, score };
  }
  return best?.id;
}

export interface SceneDrop { /** column key (`thinking` | `confirmed` for the status view) */ col: string; /** row key (a tree node id when rows = domain) */ row: string; index: number; beforeId?: string; afterId?: string }
/** which board cell and slot a stage point falls on; `ignore` = the card being dragged. Undefined outside every column / row. */
export function sceneDrop(scene: Scene, px: number, py: number, ignore?: string): SceneDrop | undefined {
  const col = scene.boxes.find((b) => b.kind === 'column' && px >= b.x - 14 && px <= b.x + b.w + 14);
  const row = scene.boxes.find((b) => b.kind === 'row' && py >= b.y - 6 && py <= b.y + b.h + 6);
  if (!col || !row || !scene.cells) return undefined;
  const byId = new Map(scene.items.map((i) => [i.objectId, i]));
  const list = (scene.cells[`${col.id.slice(4)}|${row.id.slice(4)}`] ?? []).filter((id) => id !== ignore);
  const index = list.filter((id) => { const it = byId.get(id)!; return it.y + it.h / 2 < py; }).length;
  return { col: col.id.slice(4), row: row.id.slice(4), index, beforeId: list[index - 1], afterId: list[index] };
}
