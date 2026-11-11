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
import type { NoteThinkingItem } from './thinkingMarkers';
import { openThoughts } from './thinkingSpace';
import { buildMapModel, EDGE_LABEL } from './mapModel';
import type { MapEdgeKind } from './mapModel';

export type CanvasLayout = 'free' | 'overview' | 'lineage';
export const LAYOUT_FA: Record<CanvasLayout, string> = { free: 'آزاد', overview: 'نمای کلی', lineage: 'دور یک مورد' };
/** the one-sentence answer each layout gives (shown as «این چیست؟») */
export const LAYOUT_ABOUT: Record<CanvasLayout, { question: string; what: string }> = {
  overview: { question: 'کل سیستمم چطور به هم وصل است؟', what: 'ردیف‌ها بخش‌های ساختارند؛ خط‌ها فقط وابستگی‌های ثبت‌شده را نشان می‌دهند. جایگاه ستون‌ها از همین وابستگی‌ها می‌آید، نه از عمق بخش‌ها. نبودن خط یعنی در این نما رابطه‌ای نشان داده نمی‌شود، نه این‌که ترتیب یا وابستگی‌ای وجود دارد. دور که بروی هر ردیف خلاصه می‌شود؛ نزدیک که بیایی کارت‌ها و خط‌ها پیدا می‌شوند.' },
  lineage: { question: 'این مورد بر چه چیزی تکیه دارد و اگر تغییر کند چه چیزهایی را باید ببینم؟', what: 'مورد انتخاب‌شده وسط است؛ آنچه بر آن تکیه دارد سمت شروع و آنچه رویش اثر دارد سمت پایان. فقط چند قدم دورتر را نشان می‌دهد؛ عمق را خودت عوض کن.' },
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
  /** a tray card for an open thought whose note is gone (display only: there is no note to place) */
  thoughtId?: string;
  type?: ContextObject['type'];
  status?: ContextObject['status'];
  /** badges */
  review?: boolean; assumption?: boolean; expired?: boolean; global?: boolean; sample?: boolean;
  /** not approved yet (a suggestion or a «needs review»): only drawn when «نشان بده چه در راه است» is on */
  pending?: boolean;
  /** a cycle of dependencies: these are decided together (the same id for every member) */
  together?: string;
  /** the overview row (a tree node id) the card sits in */
  rowId?: string;
  /** lineage: what the pending center would put in need of a review if it were approved (a what-if, not a state) */
  ifApproved?: boolean;
  /** lineage: how far from the center (0 = the center; negative = it rests on; positive = it affects) */
  depthFrom?: number;
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
export interface Scene { /** lineage: the levels around the center and the what-if list */ lineage?: import('./lineage').Lineage; /** overview: the rows with their counters, the lines between rows and the layer count */ overview?: import('./swimlane').OverviewData; /** board: the ordered object ids of every cell (`column|row`) — what an undo of a move restores */ cells?: Record<string, string[]>; layout: CanvasLayout; items: SceneItem[]; boxes: SceneBox[]; edges: SceneEdge[]; width: number; height: number; summary: { objects: number; assets: number; notes: number }; /** the board's column / row kinds (display only unless columns = status) */ board?: { columns: BoardColumns; rows: BoardRows } }

export interface SceneInput {
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  notes: Note[];
  /** the stored Thoughts (what the thinking space lists); the tray and the overview rows read them, not the note lines */
  thoughts?: NoteThinkingItem[];
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
  /** lineage: the card in the middle and how many steps */
  centerId?: string; depth?: number;
  /** overview: keep one kind only; sections opened beyond the first two levels; the user's row order; «inside a section» */
  only?: 'constraint' | 'pending'; rowsBy?: 'domain' | 'facet'; opened?: Set<string>; rowOrder?: string[]; scopeNodeId?: string;
  /** free («بوم فکر»): also show what has no place yet — open thoughts and suggestions — in a «تازه‌ها» tray */
  tray?: boolean;
}

/** a relation with an end that is not approved yet (a suggestion, a thing that needs a look): a suggested relation, not truth */
export const isPendingRelation = (r: { sourceId: string; targetId: string }, byId: Map<string, Pick<ContextObject, 'status'>>): boolean => {
  const bad = (id: string) => { const o = byId.get(id); return !!o && (o.status === 'Proposed' || o.status === 'Needs Review'); };
  return bad(r.sourceId) || bad(r.targetId);
};

import { badges, extract } from './sceneParts';
import { buildOverviewScene } from './swimlane';
import { buildLineageScene } from './lineage';

export function buildScene(layout: CanvasLayout, input: SceneInput, opts: SceneOptions = {}): Scene {
  const now = input.now ?? new Date();
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const filterObjects = (list: ContextObject[]) => (opts.onlyReview ? list.filter((o) => input.reviewIds.has(o.id) || o.status === 'Needs Review') : list);

  if (layout === 'lineage') return buildLineageScene({ objects: input.objects, relationships: input.relationships, reviewIds: input.reviewIds, now }, { centerId: opts.centerId ?? '', depth: opts.depth, showPending: opts.showPending });
  if (layout === 'overview') return buildOverviewScene(input, { showPending: opts.showPending, onlyReview: opts.onlyReview, only: opts.only, opened: opts.opened, rowOrder: opts.rowOrder, scopeNodeId: opts.scopeNodeId, rowsBy: opts.rowsBy });

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
    // the open Thoughts decide what is here (the same list as the thinking space): a note shows up while it holds one; a thought
    // whose note was deleted has no note to place, so it gets a card of its own (display only)
    const open = openThoughts({ thoughts: input.thoughts, notes: input.notes, objects: input.objects });
    const noteIdsWithOpen = new Set(open.map((t) => t.noteId).filter(Boolean));
    const liveNotes = new Set(input.notes.map((n) => n.id));
    for (const n of input.notes) {
      if (placedNote.has(n.id) || placedNoteIds.has(n.id) || !noteIdsWithOpen.has(n.id)) continue;
      loose.push({ id: `note:${n.id}`, kind: 'note', label: n.content.split('\n')[0].slice(0, 80), summary: extract(n.content, 400), x: 0, y: 0, w: NOTE_W, h: NOTE_H, noteId: n.id, nodeId: n.nodeId, unplaced: true });
    }
    for (const t of open) {
      if (t.noteId && liveNotes.has(t.noteId)) continue;
      loose.push({ id: `thought:${t.id ?? t.key}`, kind: 'note', label: t.text.split('\n')[0].slice(0, 80), summary: extract(t.text, 400), x: 0, y: 0, w: NOTE_W, h: NOTE_H, thoughtId: t.id ?? t.key, nodeId: t.nodeId, unplaced: true });
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
