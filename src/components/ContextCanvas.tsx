/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextObject, ContextRelationship, GeneratedDeliverable, Note, TreeNode } from '../types';
import type { CanvasItem } from '../types/state';
import { BOARD_COLUMNS_FA, BOARD_ROWS_FA, LANE_FA, LANES, moveEffect } from '../core/canvasModel';
import type { BoardColumns, BoardRows, Lane } from '../core/canvasModel';
import { buildScene, HEAD, LAYOUT_ABOUT, LAYOUT_FA, neighbourInDirection, NOTE_H, NOTE_W, placeable, sceneDrop, sceneNeighbours } from '../core/canvasScene';
import type { CanvasLayout, Scene, SceneItem } from '../core/canvasScene';
import { canRedo, canUndo, createHistory, record, redo, undo } from '../core/canvasHistory';
import type { CanvasAction, HistoryEntry } from '../core/canvasHistory';
import { clusterItems, edgeBudget, lodOf } from '../core/canvasLod';
import { fromJsonCanvas, toJsonCanvas } from '../core/jsonCanvas';
import { Alert, Badge, Button, Dialog, EmptyState, IconButton, Menu, Popover, RadioGroup, SegmentedControl, Select, Switch, TextField, Textarea, formatNumber, useToast } from '../ui';
import { CanvasEdges, routeSceneEdges } from './CanvasEdges';
import { CanvasInspector } from './CanvasInspector';
import { CanvasItemCard, CanvasNoteCard, FACET_TINT } from './CanvasItemCard';
import { CanvasMinimap } from './CanvasMinimap';
import { usePanZoom } from './usePanZoom';

export interface MovePayload { objectId: string; lane: Lane; nodeId?: string; beforeId?: string; afterId?: string; reason?: string; confirmBackward?: boolean }
export interface CanvasProps {
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  notes: Note[];
  canvas: { decisions: CanvasItem[]; free: CanvasItem[] };
  reviewIds: Set<string>;
  staleAssetIds: Set<string>;
  onMove: (m: MovePayload) => Promise<void>;
  onConnect: (c: { fromId: string; toId: string; type: 'depends_on' | 'supersedes'; reason?: string; confirmed?: boolean }) => Promise<void>;
  onSetDependencies: (objectId: string, dependsOn: string[]) => Promise<void>;
  onCreateNote: (n: { content: string; x: number; y: number; nodeId?: string }) => Promise<void>;
  onMoveNote: (id: string, x: number, y: number) => void;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onNoteToKnowledge: (id: string, type: 'Fact' | 'Decision' | 'Constraint') => Promise<void>;
  onPlaceObject: (id: string, x: number, y: number) => Promise<void>;
  onUnplaceObject: (id: string) => Promise<void>;
  onAutoLayout: () => Promise<void>;
  onAcceptReview: (id: string) => Promise<void>;
  onOpenObject: (o: ContextObject) => void;
  onOpenAssets: () => void;
  onAddKnowledge: () => void;
}

type Pending = { kind: 'accept'; payload: MovePayload; title: string } | { kind: 'backward'; payload: MovePayload; title: string } | null;
const PREF_KEY = 'mabda.canvas.prefs';
const TIPS_KEY = 'mabda.canvas.tips';
const TIPS = [
  'یک کارت را انتخاب کن تا هرچه روی آن اثر دارد روشن شود؛ روی فضای خالی دابل‌کلیک کن تا یادداشت تازه بسازی. بقیهٔ امکان‌ها زیر «⋯» است.',
];
const SHORTCUTS: Array<[string, string]> = [['F', 'تمام‌صفحه (ESC خروج)'], ['I', 'باز و بسته کردن بازرس'], ['؟', 'این راهنما'], ['/  یا  Ctrl+K', 'جستجوی کارت'], ['Ctrl+Z / Ctrl+Shift+Z', 'برگرداندن / از نو'], ['پیکان‌ها', 'رفتن به کارت کناری (روی یک کارت) یا جابه‌جایی بوم'], ['Enter', 'انتخاب کارت'], ['+  /  −  /  0', 'بزرگ‌نمایی / کوچک‌نمایی / متناسب‌سازی'], ['Shift + کلیک', 'انتخاب چندتایی'], ['دابل‌کلیک روی فضای خالی', 'یادداشت تازه'], ['کلیک راست یا نگه‌داشتن', 'منوی کارت']];

const readPrefs = (): Partial<{ layout: CanvasLayout; boxes: boolean; columns: BoardColumns; rows: BoardRows }> => { try { return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}'); } catch { return {}; } };
const readTips = (): number[] => { try { return JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]'); } catch { return []; } };
function useMedia(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]);
  return m;
}

/** «بوم»: one view, three layouts (رابطه‌ها · تابلو · آزاد). See docs/canvas-design.md for the principles every choice below answers to. */
export const ContextCanvas: React.FC<CanvasProps> = (p) => {
  const toast = useToast();
  const prefs = useMemo(readPrefs, []);
  const isMobile = useMedia('(max-width: 767px)');
  const [layout, setLayout] = useState<CanvasLayout>(prefs.layout ?? 'relations');
  const [boxes, setBoxes] = useState(prefs.boxes ?? true);
  const [columns, setColumns] = useState<BoardColumns>(prefs.columns ?? 'status');
  const [rows, setRows] = useState<BoardRows>(prefs.rows ?? 'domain');
  const [showAssets, setShowAssets] = useState(true);
  const [history, setHistory] = useState(false);
  const [onlyReview, setOnlyReview] = useState(false);
  const [showAllEdges, setShowAllEdges] = useState(false);
  const [colorFacet, setColorFacet] = useState(false);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches));
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ctx, setCtx] = useState<{ item: SceneItem; x: number; y: number } | null>(null);
  const [tipsDone, setTipsDone] = useState<number[]>(readTips);
  const [hist, setHist] = useState(() => createHistory());
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ layout, boxes, columns, rows })); } catch { /* a per-viewer convenience only */ } }, [layout, boxes, columns, rows]);

  const root = useRef<HTMLDivElement>(null);
      const fileInput = useRef<HTMLInputElement>(null);
  const now = useMemo(() => new Date(), []);

  const scene: Scene = useMemo(
    () => buildScene(layout, { nodes: p.nodes, objects: p.objects, relationships: p.relationships, deliverables: p.deliverables, notes: p.notes, canvas: p.canvas, reviewIds: p.reviewIds, staleAssetIds: p.staleAssetIds, now }, { showAssets, includeHistory: history, boxes, expanded: expanded ?? undefined, columns, rows, onlyReview }),
    [layout, p.nodes, p.objects, p.relationships, p.deliverables, p.notes, p.canvas, p.reviewIds, p.staleAssetIds, now, showAssets, history, boxes, expanded, columns, rows, onlyReview],
  );
  const byId = useMemo(() => new Map(scene.items.map((i) => [i.id, i])), [scene]);
  const objectById = useMemo(() => new Map(p.objects.map((o) => [o.id, o])), [p.objects]);
  const facetNames = useMemo(() => [...new Set(p.objects.flatMap((o) => o.facets ?? []))].sort((a, b) => a.localeCompare(b)), [p.objects]);
  const placedIds = useMemo(() => new Set(p.canvas.free.filter((i) => i.itemRef.startsWith('obj:')).map((i) => i.itemRef.slice(4))), [p.canvas.free]);

  const shapeKey = `${layout}|${boxes}|${columns}|${rows}|${showAssets}|${history}|${onlyReview}|${scene.items.length}`;
  const { box, view, setView, size, fit, zoomAt, reveal, toStage, handlers } = usePanZoom({ width: scene.width, height: scene.height }, shapeKey, isMobile ? 0.68 : layout === 'board' ? 1 : 0.85, fullscreen);
  const lod = lodOf(view.k);

  // ── what is drawn: the viewport (snapped, so panning does not re-render the cards) ──
  const SNAP = 160;
  const gx = Math.floor(-view.x / view.k / SNAP), gy = Math.floor(-view.y / view.k / SNAP);
  const gw = Math.ceil(size.w / view.k / SNAP) + 1, gh = Math.ceil(size.h / view.k / SNAP) + 1;
  const shown = useMemo(() => {
    const x0 = gx * SNAP - SNAP, y0 = gy * SNAP - SNAP, x1 = (gx + gw) * SNAP + SNAP, y1 = (gy + gh) * SNAP + SNAP;
    return scene.items.filter((v) => (v.x + v.w >= x0 && v.x <= x1 && v.y + v.h >= y0 && v.y <= y1) || selection.includes(v.id));
  }, [scene.items, gx, gy, gw, gh, selection]);
  const shownIds = useMemo(() => new Set(shown.map((i) => i.id)), [shown]);
  const shownBoxes = useMemo(() => scene.boxes.filter((b) => b.x + b.w >= gx * SNAP - SNAP && b.x <= (gx + gw) * SNAP + SNAP && b.y + b.h >= gy * SNAP - SNAP && b.y <= (gy + gh) * SNAP + SNAP), [scene.boxes, gx, gy, gw, gh]);
  const clusters = useMemo(() => (lod === 'far' && shown.length > 900 ? clusterItems(shown, view.k) : null), [lod, shown, view.k]);

  // ── lines: focus mode — the selection's lines are strong, the rest dim (never hidden) ──
  const selSet = useMemo(() => new Set(selection), [selection]);
  const emphasized = useMemo(() => new Set(scene.edges.filter((e) => selSet.has(e.influencer) || selSet.has(e.influenced)).map((e) => e.id)), [scene.edges, selSet]);
  const neighbours = useMemo(() => { const n = new Set<string>(); for (const e of scene.edges) { if (selSet.has(e.influencer)) n.add(e.influenced); if (selSet.has(e.influenced)) n.add(e.influencer); } return n; }, [scene.edges, selSet]);
  const obstacles = useMemo(() => scene.items.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h })), [scene.items]);
  const routed = useMemo(() => {
    const budget = edgeBudget(lod);
    const list = scene.edges.filter((e) => emphasized.has(e.id) || (shownIds.has(e.influencer) && shownIds.has(e.influenced)) || (budget > 0 && (shownIds.has(e.influencer) || shownIds.has(e.influenced))));
    const strongFirst = [...list.filter((e) => emphasized.has(e.id)), ...list.filter((e) => !emphasized.has(e.id))].slice(0, Math.max(budget, emphasized.size));
    return routeSceneEdges(strongFirst, scene.items, obstacles);
  }, [scene.edges, scene.items, obstacles, emphasized, shownIds, lod]);
  const edge = (id: string | null) => (id ? scene.edges.find((e) => e.id === id) ?? null : null);
  const chipEdges = useMemo(() => routed.filter((r) => emphasized.has(r.edge.id) || r.edge.id === hoverEdge || r.edge.id === selectedEdge).slice(0, 24), [routed, emphasized, hoverEdge, selectedEdge]);

  // ── selection, search, reveal ──
  const select = useCallback((id: string, additive = false) => {
    setSelectedEdge(null);
    setSelection((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
    if (isMobile) setInspectorOpen(true);
  }, [isMobile]);
  const clearSelection = useCallback(() => { setSelection([]); setSelectedEdge(null); }, []);
  const goTo = useCallback((id: string) => {
    const it = byId.get(id);
    if (!it) return;
    setSelection([id]); setSelectedEdge(null);
    if (isMobile) setInspectorOpen(true); // like a tap: the sentence about the card shows
    setView((cur) => { const k = Math.max(cur.k, 0.9); return { k, x: size.w / 2 - (it.x + it.w / 2) * k, y: size.h / 2 - (it.y + it.h / 2) * k }; });
    setTimeout(() => (box.current?.querySelector(`[data-item-id="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }), 80);
  }, [byId, setView, size.w, size.h, box, isMobile]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return scene.items.filter((i) => i.label.toLowerCase().includes(q) || (i.summary ?? '').toLowerCase().includes(q)).slice(0, 8);
  }, [query, scene.items]);

  // ── history ──
  const [busy, setBusy] = useState(false);
  const exec = useCallback(async (actions: CanvasAction[]) => {
    for (const a of actions) {
      if (a.type === 'move') await p.onMove({ objectId: a.objectId, lane: a.lane, nodeId: a.nodeId, beforeId: a.beforeId, afterId: a.afterId, confirmBackward: true });
      else if (a.type === 'setDependencies') await p.onSetDependencies(a.objectId, a.targetIds);
      else if (a.type === 'moveNote') p.onMoveNote(a.noteId, a.x, a.y);
      else if (a.type === 'placeObject') await p.onPlaceObject(a.objectId, a.x, a.y);
      else await p.onUnplaceObject(a.objectId);
    }
  }, [p]);
  const push = useCallback((e: HistoryEntry) => setHist((h) => record(h, e)), []);
  const doUndo = useCallback(async () => { const r = undo(hist); if (!r.entry) return; setHist(r.history); setBusy(true); try { await exec(r.entry.undo); toast.show({ intent: 'success', message: `برگشت: ${r.entry.label}` }); } finally { setBusy(false); } }, [hist, exec, toast]);
  const doRedo = useCallback(async () => { const r = redo(hist); if (!r.entry) return; setHist(r.history); setBusy(true); try { await exec(r.entry.redo); } finally { setBusy(false); } }, [hist, exec]);

  // ── moving a card on the board (status columns only) ──
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target?: ReturnType<typeof sceneDrop> } | null>(null);
  const [linkDrag, setLinkDrag] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [actions, setActions] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [connect, setConnect] = useState<{ fromId: string; toId: string; type: 'depends_on' | 'supersedes'; reason: string } | null>(null);
  const [newNote, setNewNote] = useState<{ content: string; nodeId: string; x: number; y: number } | null>(null);
  const [toKnowledge, setToKnowledge] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [noteDrag, setNoteDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  const boardStatus = layout === 'board' && scene.board?.columns === 'status';
  const dragEnabled = boardStatus || layout === 'free';

  const request = useCallback(async (payload: MovePayload) => {
    const o = objectById.get(payload.objectId);
    if (!o) return;
    const eff = moveEffect(o, p.reviewIds, payload.lane, payload.nodeId ?? o.nodeId);
    if (eff.needsConfirm) { setReason(''); setPending({ kind: 'backward', payload, title: o.title }); return; }
    if (eff.kind === 'accept') { setReason(''); setPending({ kind: 'accept', payload, title: o.title }); return; }
    await run(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectById, p.reviewIds, scene]);
  const run = async (payload: MovePayload) => {
    const prev = sceneNeighbours(scene, payload.objectId);
    setBusy(true);
    try {
      await p.onMove(payload);
      if (prev) push({ label: `انتقال «${objectById.get(payload.objectId)?.title ?? ''}»`, undo: [{ type: 'move', objectId: payload.objectId, lane: prev.lane, nodeId: scene.board?.rows === 'domain' ? prev.nodeId : undefined, beforeId: prev.beforeId, afterId: prev.afterId }], redo: [{ type: 'move', objectId: payload.objectId, lane: payload.lane, nodeId: payload.nodeId, beforeId: payload.beforeId, afterId: payload.afterId }] });
    } finally { setBusy(false); }
  };
  const confirmPending = async () => {
    if (!pending) return;
    await run({ ...pending.payload, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(pending.kind === 'backward' ? { confirmBackward: true } : {}) });
    setPending(null);
  };

  const startDrag = (e: React.PointerEvent, item: SceneItem) => {
    if (e.pointerType === 'touch' || e.button !== 0 || !dragEnabled) return;
    if ((e.target as HTMLElement).closest('button, textarea')) return;
    e.stopPropagation();
    const origin = toStage(e.clientX, e.clientY);
    const grab = { x: origin.x - item.x, y: origin.y - item.y };
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const isNote = item.kind === 'note';
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      moved = true;
      const s = toStage(ev.clientX, ev.clientY);
      if (isNote || layout === 'free') setNoteDrag({ id: item.id, x: s.x - grab.x, y: s.y - grab.y });
      else setDrag({ id: item.id, x: s.x - grab.x, y: s.y - grab.y, target: sceneDrop(scene, s.x, s.y, item.objectId) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setDrag(null); setNoteDrag(null);
      if (!moved) return;
      const s = toStage(ev.clientX, ev.clientY);
      const nx = Math.max(0, Math.round(s.x - grab.x)), ny = Math.max(0, Math.round(s.y - grab.y));
      if (layout === 'free') {
        if (isNote && item.noteId) { const was = { x: item.x, y: item.y }; p.onMoveNote(item.noteId, nx, ny); push({ label: 'جابه‌جایی یادداشت', undo: [{ type: 'moveNote', noteId: item.noteId, ...was }], redo: [{ type: 'moveNote', noteId: item.noteId, x: nx, y: ny }] }); }
        else if (item.objectId) { const was = { x: item.x, y: item.y }; void p.onPlaceObject(item.objectId, nx, ny); push({ label: 'جابه‌جایی کارت', undo: [{ type: 'placeObject', objectId: item.objectId, ...was }], redo: [{ type: 'placeObject', objectId: item.objectId, x: nx, y: ny }] }); }
        return;
      }
      const t = sceneDrop(scene, s.x, s.y, item.objectId);
      if (t && item.objectId && (t.col === 'thinking' || t.col === 'confirmed')) void request({ objectId: item.objectId, lane: t.col, nodeId: scene.board?.rows === 'domain' ? t.row : undefined, beforeId: t.beforeId, afterId: t.afterId });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const startLink = (e: React.PointerEvent, item: SceneItem) => {
    if (e.pointerType === 'touch' || !item.objectId) return;
    e.stopPropagation();
    const move = (ev: PointerEvent) => { const s = toStage(ev.clientX, ev.clientY); setLinkDrag({ fromId: item.id, x: s.x, y: s.y }); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setLinkDrag(null);
      const to = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-object-id]')?.dataset.objectId;
      if (to && to !== item.objectId) setConnect({ fromId: item.objectId!, toId: to, type: 'depends_on', reason: '' });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const doConnect = async () => {
    if (!connect) return;
    setBusy(true);
    try {
      const prev = p.relationships.filter((r) => r.type === 'depends_on' && r.sourceId === connect.fromId).map((r) => r.targetId);
      await p.onConnect({ fromId: connect.fromId, toId: connect.toId, type: connect.type, ...(connect.reason.trim() ? { reason: connect.reason.trim() } : {}), ...(connect.type === 'supersedes' ? { confirmed: true } : {}) });
      if (connect.type === 'depends_on') push({ label: 'خط تازه', undo: [{ type: 'setDependencies', objectId: connect.fromId, targetIds: prev }], redo: [{ type: 'setDependencies', objectId: connect.fromId, targetIds: [...new Set([...prev, connect.toId])] }] });
      setConnect(null);
    } finally { setBusy(false); }
  };

  // ── keyboard ──
  const onCardKey = (e: React.KeyboardEvent, item: SceneItem) => {
    if ((e.target as HTMLElement).closest('textarea, input')) return;
    const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }; // check:design-ignore (key names)
    if (dirs[e.key]) {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey && layout === 'free' && (item.noteId || item.objectId)) { // Shift + arrow moves a free card by a step
        const step = 24; const dir = dirs[e.key]; const d = dir === 'up' ? [0, -step] : dir === 'down' ? [0, step] : dir === 'left' ? [-step, 0] : [step, 0];
        const nx = Math.max(0, item.x + d[0]), ny = Math.max(0, item.y + d[1]);
        if (item.noteId) p.onMoveNote(item.noteId, nx, ny); else void p.onPlaceObject(item.objectId!, nx, ny);
        return;
      }
      const to = neighbourInDirection(scene.items, item.id, dirs[e.key]);
      if (to) goTo(to);
    } else if (e.key === 'Enter' || e.key === ' ') { if (e.target === e.currentTarget) { e.preventDefault(); select(item.id, e.shiftKey); } }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setCtx({ item, x: r.left + 8, y: r.top + 8 }); }
  };
  const onRootKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      if (ctx) setCtx(null); else if (helpOpen) setHelpOpen(false); else if (query) setQuery(''); else if (fullscreen) setFullscreen(false); else clearSelection();
      e.stopPropagation(); return;
    }
    if (fullscreen && e.key === 'Tab') { // focus trap: Tab stays inside the layer
      const els = [...(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]') ?? [])].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) void doRedo(); else void doUndo(); }
    else if (mod && e.code === 'KeyY') { e.preventDefault(); void doRedo(); }
    else if (mod && e.code === 'KeyK') { e.preventDefault(); document.getElementById('canvas-search')?.focus(); }
    else if (!mod && e.code === 'KeyF') { e.preventDefault(); setFullscreen((v) => !v); }
    else if (!mod && e.code === 'KeyI') { e.preventDefault(); setInspectorOpen((v) => !v); }
    else if (!mod && (e.key === '?' || e.key === '؟')) { e.preventDefault(); setHelpOpen((v) => !v); }
    else if (!mod && e.key === '/') { e.preventDefault(); document.getElementById('canvas-search')?.focus(); }
  };

  // ── fullscreen: an in-app layer (position fixed) — scroll locked, focus trapped, ESC leaves, nothing is rebuilt ──
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    box.current?.focus({ preventScroll: true });
    return () => { document.documentElement.style.overflow = prev; document.getElementById('canvas-fs')?.focus({ preventScroll: true }); };
  }, [fullscreen, box]);
  const browserFullscreen = () => { try { if (document.fullscreenElement) void document.exitFullscreen(); else void root.current?.requestFullscreen(); } catch { /* optional */ } };

  // ── double-click on the empty stage = a new note; long press (touch) = the card menu ──
  const onStageDouble = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-item-id], button, [data-no-pan]')) return;
    const s = toStage(e.clientX, e.clientY);
    setNewNote({ content: '', nodeId: '', x: Math.max(0, Math.round(s.x)), y: Math.max(0, Math.round(s.y)) });
  };
  const press = useRef<number | undefined>(undefined);
  const onCardDown = (e: React.PointerEvent, item: SceneItem) => {
    if (e.pointerType === 'touch') { const { clientX, clientY } = e; window.clearTimeout(press.current); press.current = window.setTimeout(() => setCtx({ item, x: clientX, y: clientY }), 520); return; }
    startDrag(e, item);
  };
  useEffect(() => { const clear = () => window.clearTimeout(press.current); window.addEventListener('pointerup', clear); window.addEventListener('pointermove', clear, { passive: true }); return () => { window.removeEventListener('pointerup', clear); window.removeEventListener('pointermove', clear); }; }, []);

  const toggleNode = useCallback((nodeId: string) => setExpanded((cur) => { const base = cur ?? new Set(scene.boxes.filter((b) => b.kind === 'group' && b.expanded).map((b) => b.nodeId!)); const s = new Set(base); if (s.has(nodeId)) s.delete(nodeId); else s.add(nodeId); return s; }), [scene.boxes]);

  const exportCanvas = () => {
    const cards = scene.items.filter((i) => i.kind === 'object' || i.kind === 'note').map((i) => ({ id: i.id, text: `${i.label}\n${i.summary ?? ''}`, x: i.x, y: i.y, w: i.w, h: i.h }));
    const ids = new Set(cards.map((c) => c.id));
    const links = scene.edges.filter((e) => ids.has(e.influencer) && ids.has(e.influenced)).map((e) => ({ id: e.id, from: e.influenced, to: e.influencer, label: e.label }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(toJsonCanvas(cards, links), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mabda.canvas'; a.click(); URL.revokeObjectURL(url);
  };
  const importCanvas = async (file?: File) => {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = '';
    try {
      const r = fromJsonCanvas(await file.text());
      for (const c of r.cards) await p.onCreateNote({ content: c.text, x: Math.max(0, Math.round(c.x)), y: Math.max(0, Math.round(c.y)) });
      toast.show({ intent: 'success', message: `${formatNumber(r.cards.length)} یادداشت در فضای آزاد گذاشته شد${r.skipped ? ` (${formatNumber(r.skipped)} مورد از نوع دیگر کنار ماند)` : ''}.` });
      setLayout('free');
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof Error ? e.message : 'ورود فایل ناموفق بود.' }); }
  };

  const tip = tipsDone.length >= TIPS.length ? undefined : TIPS.findIndex((_, i) => !tipsDone.includes(i));
  const dismissTip = (i: number) => { const next = [...tipsDone, i]; setTipsDone(next); try { localStorage.setItem(TIPS_KEY, JSON.stringify(next)); } catch { /* optional */ } };

  const itemObj = (id: string) => byId.get(id)?.objectId;
  const activeObj = actions ? objectById.get(actions) : undefined;
  const activeItem = actions ? scene.items.find((i) => i.objectId === actions) : undefined;
  const hasContent = p.objects.length > 0 || p.deliverables.length > 0 || p.notes.length > 0;
  const sel1 = selection.length === 1 ? byId.get(selection[0]) : undefined;
  const sheet = isMobile && fullscreen;

  const aboutText = LAYOUT_ABOUT[layout];
  const optionsCount = (onlyReview ? 1 : 0) + (showAllEdges ? 1 : 0) + (colorFacet ? 1 : 0) + (layout === 'relations' ? (boxes ? 0 : 1) + (showAssets ? 0 : 1) + (history ? 1 : 0) : layout === 'board' ? (columns !== 'status' ? 1 : 0) + (rows !== 'domain' ? 1 : 0) : 0);
  const options = (
    <div className="flex min-w-overlay-xs flex-col gap-stack-sm p-inset-sm" role="group" aria-label="گزینه‌های نما">
      <p className="body-sm text-text-subtle">فقط نمایش را عوض می‌کنند؛ چیزی ذخیره نمی‌شود.</p>
      {layout === 'relations' && (<>
        <Switch label="جعبهٔ دامنه (گره‌های درخت)" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} />
        <Switch label="خروجی‌ها (دارایی‌ها)" checked={showAssets} onChange={(e) => setShowAssets(e.target.checked)} />
        <Switch label="جایگزین‌شده‌ها (تاریخچه)" checked={history} onChange={(e) => setHistory(e.target.checked)} />
      </>)}
      {layout === 'board' && (<>
        <Select label="ستون‌ها" hint="فقط «وضعیت» با کشیدن چیزی را عوض می‌کند." value={columns} onChange={(e) => setColumns(e.target.value as BoardColumns)} options={(Object.keys(BOARD_COLUMNS_FA) as BoardColumns[]).map((k) => ({ value: k, label: BOARD_COLUMNS_FA[k] }))} />
        <Select label="ردیف‌ها" hint="«دامنه»: ردیف = گرهٔ درخت." value={rows} onChange={(e) => setRows(e.target.value as BoardRows)} options={(Object.keys(BOARD_ROWS_FA) as BoardRows[]).map((k) => ({ value: k, label: BOARD_ROWS_FA[k] }))} />
      </>)}
      <Switch label="فقط نیاز به بازبینی" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
      {scene.edges.length > 0 && <Switch label="نمایش همهٔ خط‌ها" checked={showAllEdges} onChange={(e) => setShowAllEdges(e.target.checked)} />}
      {facetNames.length > 0 && layout !== 'free' && <Switch label="رنگ بر اساس بُعد" checked={colorFacet} onChange={(e) => setColorFacet(e.target.checked)} />}
    </div>
  );
  // the toolbar shows FIVE controls at most (docs/canvas-design.md): layout · card search · «گزینه‌ها» · zoom group · full screen.
  // Everything else (undo / redo, auto layout, inspector, JSON Canvas, shortcuts, «this layout?») lives under «⋯» and in the shortcuts.
  const toolbar = (
    <div className={`flex flex-wrap items-center gap-inline-sm ${sheet ? 'order-last border-t border-border-default pt-inset-sm' : ''}`} role="toolbar" aria-label="نوار ابزار بوم" data-testid="canvas-toolbar">
      <SegmentedControl label="چیدمان بوم" value={layout} onChange={(id) => { setLayout(id as CanvasLayout); clearSelection(); }} items={(['relations', 'board', 'free'] as CanvasLayout[]).map((k) => ({ id: k, label: LAYOUT_FA[k] }))} />
      <span className="relative">
      <TextField id="canvas-search" size="md" iconStart="Search" aria-label="جستجوی کارت" placeholder="جستجوی کارت" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { goTo(results[0].id); setQuery(''); } }} className="w-space-40" />
      {results.length > 0 && (
        <ul role="listbox" aria-label="نتیجهٔ جستجو" className="absolute top-full z-dropdown mt-stack-xs flex min-w-overlay-xs flex-col rounded-control border border-border-default bg-surface-overlay p-inset-xs shadow-raised">
          {results.map((r) => <li key={r.id} role="presentation"><button type="button" role="option" aria-selected="false" className="body-sm w-full rounded-control-sm px-inset-sm py-inset-xs text-start text-text-default hover:bg-bg-neutral-subtle" onClick={() => { goTo(r.id); setQuery(''); }}>{r.label}</button></li>)}
        </ul>
      )}
      </span>
      <Popover label="گزینه‌های نما" trigger={<Button size="sm" variant="secondary" iconStart="Filter">گزینه‌ها{optionsCount ? ` (${formatNumber(optionsCount)})` : ''}</Button>}>{options}</Popover>
      <span className="flex items-center gap-inline-xs" role="group" aria-label="بزرگ‌نمایی">
        <IconButton icon="ZoomOut" label="کوچک‌نمایی" onClick={() => zoomAt(1 / 1.25)} />
        <IconButton icon="Maximize" label="متناسب‌سازی" onClick={fit} />
        <IconButton icon="ZoomIn" label="بزرگ‌نمایی" onClick={() => zoomAt(1.25)} />
      </span>
      <IconButton id="canvas-fs" icon={fullscreen ? 'Minimize2' : 'Fullscreen'} label={fullscreen ? 'خروج از تمام‌صفحه (ESC)' : 'تمام‌صفحه (F)'} aria-pressed={fullscreen} onClick={() => setFullscreen((v) => !v)} />
      <span className="ms-auto" data-toolbar-overflow="">
        <Menu label="بیشتر" align="end" trigger={<IconButton icon="Ellipsis" label="بیشتر" />} items={[
          { label: 'برگرداندن (Ctrl+Z)', icon: 'Undo2', disabled: !canUndo(hist) || busy, onSelect: () => void doUndo() },
          { label: 'از نو (Ctrl+Shift+Z)', icon: 'Redo2', disabled: !canRedo(hist) || busy, onSelect: () => void doRedo() },
          { divider: true },
          { label: 'یادداشت تازه', icon: 'Plus', onSelect: () => setNewNote({ content: '', nodeId: '', x: 0, y: 0 }) },
          { label: 'چیدمان خودکار (پاک کردن ترتیب دستی)', icon: 'Wand2', onSelect: () => { void (async () => { setBusy(true); try { await p.onAutoLayout(); } finally { setBusy(false); } })(); } },
          { label: inspectorOpen ? 'بستن بازرس' : 'باز کردن بازرس', icon: 'PanelRight', onSelect: () => setInspectorOpen((v) => !v) },
          { label: aboutOpen ? 'بستن توضیح این چیدمان' : 'این چیدمان چیست؟', icon: 'CircleHelp', onSelect: () => setAboutOpen((v) => !v) },
          { divider: true },
          { label: 'خروجی JSON Canvas', icon: 'Download', onSelect: exportCanvas },
          { label: 'ورود JSON Canvas', icon: 'Upload', onSelect: () => fileInput.current?.click() },
          { label: 'میان‌برها (؟)', icon: 'Keyboard', onSelect: () => setHelpOpen(true) },
          ...(fullscreen ? [{ divider: true } as const, { label: 'تمام‌صفحهٔ مرورگر (اختیاری)', icon: 'Maximize' as const, onSelect: browserFullscreen }] : []),
        ]} />
      </span>
    </div>
  );

  if (!hasContent) {
    return <EmptyState icon="Workflow" title="بوم هنوز خالی است" description="با ثبت اولین دانش، کارت‌ها و خط‌ها اینجا ساخته می‌شوند." action={<Button variant="secondary" iconStart="Plus" onClick={p.onAddKnowledge}>ثبت دانش</Button>} />;
  }

  const stageEmpty = scene.items.length === 0;
  const inspector = (
    <aside data-testid="canvas-inspector" className={`flex flex-col gap-stack-sm overflow-auto rounded-control border border-border-default bg-surface-raised p-inset-lg ${sheet ? 'order-last' : fullscreen ? 'w-overlay-xs shrink-0' : 'lg:w-overlay-xs lg:shrink-0'}`} style={sheet ? { maxBlockSize: '42vh' } : undefined} aria-label="بازرس: جزئیات مورد انتخاب‌شده" aria-live="polite">
      <CanvasInspector
        scene={scene} selection={selection} selectedEdge={edge(selectedEdge)} objects={p.objects} nodes={p.nodes} relationships={p.relationships} deliverables={p.deliverables} lod={lod} now={now}
        canMoveStatus={boardStatus} onOpenObject={p.onOpenObject} onOpenAssets={p.onOpenAssets} onActions={setActions} onAcceptReview={p.onAcceptReview}
        onPlace={(id) => { void p.onPlaceObject(id, 40 + (placedIds.size % 4) * 260, 40 + Math.floor(placedIds.size / 4) * 150); setLayout('free'); }}
        onUnplace={(id) => void p.onUnplaceObject(id)} placed={!!sel1?.objectId && placedIds.has(sel1.objectId)} onClear={clearSelection} onSelect={(id) => select(id)}
      />
    </aside>
  );

  const rootClass = fullscreen ? 'fixed top-space-0 bottom-space-0 start-space-0 end-space-0 z-dialog flex flex-col gap-stack-sm bg-surface-page p-inset-md' : 'flex flex-col gap-stack-md rounded-container border border-border-default bg-surface-raised p-inset-lg';
  const body = (
    <div ref={root} onKeyDown={onRootKey} className={rootClass} role={fullscreen ? 'dialog' : 'region'} aria-modal={fullscreen || undefined} aria-label="بوم" data-fullscreen={fullscreen ? 'true' : 'false'} data-testid="canvas-root">
      {!sheet && toolbar}
      {aboutOpen && <Alert intent="info" title={`چیدمان «${LAYOUT_FA[layout]}»: ${aboutText.question}`} onClose={() => setAboutOpen(false)}>{aboutText.what}</Alert>}
      {!aboutOpen && <p className="body-sm text-text-subtle" data-testid="layout-about">{aboutText.question}</p>}
      {tip !== undefined && !stageEmpty && (
        <div role="note" data-testid="canvas-tip" className="flex items-center justify-between gap-inline-sm rounded-control border border-border-info-subtle bg-bg-info-subtle px-inset-md py-inset-xs">
          <p className="body-sm text-text-default"><b>نکته:</b> {TIPS[tip]}</p>
          <Button size="sm" variant="ghost" onClick={() => dismissTip(tip)}>فهمیدم</Button>
        </div>
      )}

      <div className={`flex min-h-space-0 flex-1 gap-stack-md ${fullscreen && !sheet ? 'flex-row' : 'flex-col lg:flex-row'}`}>
        <div className="relative flex min-w-space-0 flex-1 flex-col">
          <div
            ref={box}
            dir="ltr"
            tabIndex={0}
            role="application"
            aria-label={`بوم، چیدمان ${LAYOUT_FA[layout]}. با کلیدهای جهت‌دار جابه‌جا شو؛ با Tab به کارت‌ها برو و با پیکان‌ها بین کارت‌ها حرکت کن. نمای «ساختار» همین اطلاعات را به‌صورت درخت می‌دهد.`}
            {...handlers}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-item-id], button, [data-no-pan]')) { clearSelection(); setCtx(null); } }}
            onDoubleClick={onStageDouble}
            className="relative min-w-space-0 flex-1 touch-none select-none overflow-hidden rounded-control border border-border-default bg-surface-sunken"
            style={{ blockSize: fullscreen ? undefined : '66vh', minBlockSize: 340 }}
            data-testid="canvas-stage"
            data-lod={lod}
          >
            <div className="absolute top-space-0 start-space-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0', willChange: 'transform', inlineSize: scene.width, blockSize: scene.height }}>
              {shownBoxes.map((b) => (
                <div key={b.id} title={b.hint} className={`absolute top-space-0 start-space-0 rounded-control-sm border ${b.kind === 'group' ? `border-dashed ${b.depth === 0 ? 'border-border-bold' : 'border-border-default'}` : b.kind === 'column' ? 'border-border-default bg-surface-raised' : 'border-border-subtle bg-surface-raised/40'} ${selection.length && b.kind === 'group' ? 'opacity-70' : ''}`} style={{ transform: `translate(${b.x}px, ${b.y}px)`, inlineSize: b.w, blockSize: b.h, pointerEvents: b.kind === 'group' ? 'none' : undefined }}>
                  <div dir="rtl" className={`flex items-center justify-between gap-inline-sm px-inset-sm ${b.kind === 'column' ? 'h-full justify-center' : ''}`} style={b.kind === 'group' ? { blockSize: 56, pointerEvents: 'auto' } : undefined}>
                    <span className="flex min-w-space-0 items-center gap-inline-xs"><span className={`${b.kind === 'column' ? 'label-md text-text-default' : 'label-md truncate text-text-subtle'}`} style={b.kind === 'row' ? { paddingInlineEnd: b.depth * 12 } : undefined}>{b.label}</span>{b.kind === 'group' && (b.count ?? 0) > 0 && <Badge intent="neutral" icon={false}>{formatNumber(b.count!)} مورد</Badge>}</span>
                    {b.kind === 'group' && (b.count ?? 0) > 0 && b.nodeId && (
                      <button type="button" aria-expanded={b.expanded} aria-label={`${b.expanded ? 'جمع کردن' : 'باز کردن'} موردهای ${b.label}`} onClick={() => toggleNode(b.nodeId!)} className="flex min-h-touch-comfortable min-w-touch-comfortable items-center justify-center rounded-control-sm text-icon-default">{b.expanded ? '−' : '+'}</button>
                    )}
                  </div>
                  {drag?.target && b.kind === 'column' && drag.target.col === b.id.slice(4) && <div aria-hidden="true" className="absolute top-space-0 bottom-space-0 start-space-0 end-space-0 rounded-control-sm border-2 border-dashed border-border-selected" />}
                </div>
              ))}
              <CanvasEdges width={scene.width} height={scene.height} routed={routed} emphasized={emphasized} hasFocus={selection.length > 0 || !!selectedEdge} showAll={showAllEdges} hovered={hoverEdge} selectedEdge={selectedEdge} onHover={setHoverEdge} onSelect={(id) => { setSelectedEdge(id); setSelection([]); if (isMobile) setInspectorOpen(true); }} />
              {chipEdges.map(({ edge: e, route }) => (
                <span key={`chip-${e.id}`} data-edge-chip={e.id} className="body-sm pointer-events-none absolute top-space-0 start-space-0 whitespace-nowrap rounded-pill border border-border-bold bg-mabda-edge-chip-bg px-inset-sm text-text-default" style={{ transform: `translate(${route.mid.x}px, ${route.mid.y}px) translate(-50%, -50%)` }}>{e.label}{e.count > 1 ? ` (${formatNumber(e.count)})` : ''}</span>
              ))}
              {linkDrag && (() => { const f = byId.get(linkDrag.fromId); return f ? <svg className="pointer-events-none absolute top-space-0 start-space-0 overflow-visible" width={scene.width} height={scene.height} aria-hidden="true"><line x1={f.x + f.w / 2} y1={f.y + f.h / 2} x2={linkDrag.x} y2={linkDrag.y} className="stroke-border-selected" strokeWidth={2} strokeDasharray="6 4" /></svg> : null; })()}
              {clusters
                ? clusters.map((c) => <button key={c.id} type="button" data-no-pan="" aria-label={`${formatNumber(c.count)} مورد؛ بزرگ‌نمایی کن`} onClick={() => { setView((cur) => { const k = 0.6; return { k, x: size.w / 2 - c.x * k, y: size.h / 2 - c.y * k }; }); }} className="absolute top-space-0 start-space-0 flex items-center justify-center rounded-pill border border-border-bold bg-surface-raised label-md text-text-default" style={{ transform: `translate(${c.x - 40}px, ${c.y - 40}px)`, inlineSize: 80, blockSize: 80 }}>{formatNumber(c.count)}</button>)
                : shown.map((i) => {
                  const at = i.kind === 'note' && noteDrag?.id === i.id ? { ...i, x: noteDrag.x, y: noteDrag.y } : layout === 'free' && noteDrag?.id === i.id ? { ...i, x: noteDrag.x, y: noteDrag.y } : i;
                  const common = { lod, selected: selSet.has(i.id), dimmed: false, draggable: dragEnabled, onSelect: select, onFocus: (it: SceneItem) => reveal(it.x, it.y, it.w, it.h), onKey: onCardKey };
                  if (i.kind === 'note') {
                    return <CanvasNoteCard key={i.id} item={at} {...common} editing={editing?.id === i.id ? { text: editing.text } : undefined} onPointerDown={startDrag}
                      onEdit={(it) => setEditing({ id: it.id, text: it.summary ?? '' })} onEditText={(text) => setEditing((cur) => (cur ? { ...cur, text } : cur))}
                      onSave={async () => { if (editing && i.noteId) { await p.onUpdateNote(i.noteId, editing.text); setEditing(null); } }} onCancel={() => setEditing(null)} onConvert={(it) => setToKnowledge(it.noteId ?? null)} onDelete={(it) => it.noteId && void p.onDeleteNote(it.noteId)} />;
                  }
                  return <CanvasItemCard key={i.id} item={at} {...common} neighbour={neighbours.has(i.id)} dragging={drag?.id === i.id || noteDrag?.id === i.id} tint={colorFacet && i.facet ? FACET_TINT[facetNames.indexOf(i.facet) % FACET_TINT.length] : undefined}
                    dimmed={selection.length > 0 && !showAllEdges && !selSet.has(i.id) && !neighbours.has(i.id)} onOpen={(it) => { const o = it.objectId ? objectById.get(it.objectId) : undefined; if (o) p.onOpenObject(o); else if (it.kind === 'asset' || it.kind === 'assets') p.onOpenAssets(); }}
                    onContext={(it, x, y) => setCtx({ item: it, x, y })} onPointerDown={onCardDown} onLink={i.kind === 'object' ? startLink : undefined} onToggleNode={toggleNode} onActions={(it) => it.objectId && setActions(it.objectId)} />;
                })}
              {drag && (() => { const it = byId.get(drag.id); return it ? <div className="pointer-events-none absolute top-space-0 start-space-0 opacity-90" style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}><div className="canvas-card is-ghost rounded-control border border-border-selected bg-surface-raised p-inset-sm" style={{ inlineSize: it.w, blockSize: it.h }}><span dir="rtl" className="body-sm line-clamp-2 text-text-default">{it.label}</span></div></div> : null; })()}
            </div>
            {stageEmpty && (
              <div className="pointer-events-none absolute top-space-0 bottom-space-0 start-space-0 end-space-0 flex items-center justify-center p-inset-lg">
                <div className="pointer-events-auto flex max-w-overlay-xs flex-col items-center gap-stack-sm text-center" data-no-pan="">
                  <p className="body-md text-text-default">{layout === 'free' ? 'فضای فکر آزاد خالی است؛ روی فضای خالی دابل‌کلیک کن تا یادداشت بسازی.' : onlyReview ? 'چیزی نیاز به بازبینی ندارد.' : layout === 'board' ? 'هیچ کارتی روی تابلو نیست؛ دانشی ثبت کن تا اینجا بنشیند.' : 'هنوز چیزی برای نمایش در این چیدمان نیست.'}</p>
                  <Button size="sm" variant="secondary" iconStart="Plus" onClick={layout === 'free' ? () => setNewNote({ content: '', nodeId: '', x: 0, y: 0 }) : onlyReview ? () => setOnlyReview(false) : p.onAddKnowledge}>{layout === 'free' ? 'یادداشت تازه' : onlyReview ? 'نمایش همه' : 'ثبت دانش'}</Button>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-space-2 end-space-2 flex flex-col items-end gap-stack-xs">
              {!isMobile && fullscreen && <CanvasMinimap items={scene.items} width={scene.width} height={scene.height} view={view} size={size} selected={selSet} onJump={(x, y) => setView((cur) => ({ ...cur, x: size.w / 2 - x * cur.k, y: size.h / 2 - y * cur.k }))} />}
            </div>
            <div className="pointer-events-none absolute start-space-2 top-space-2" data-no-pan=""><span className="label-sm rounded-pill border border-border-default bg-surface-raised px-inset-sm text-text-subtle">{lod === 'far' ? 'نمای دور' : lod === 'mid' ? 'نمای متوسط' : 'نمای نزدیک'} · {formatNumber(Math.round(view.k * 100))}٪</span></div>
          </div>
          {ctx && (
            <div role="menu" aria-label="منوی کارت" className="fixed z-dialog flex min-w-overlay-xs flex-col rounded-control border border-border-default bg-surface-overlay p-inset-xs shadow-raised" style={{ insetBlockStart: ctx.y, insetInlineStart: ctx.x }} onKeyDown={(e) => { if (e.key === 'Escape') setCtx(null); }}>
              {([
                ['انتخاب و روشن کردن اثرگذارها', () => select(ctx.item.id)],
                ...(ctx.item.objectId ? [['باز کردن', () => { const o = objectById.get(ctx.item.objectId!); if (o) p.onOpenObject(o); }], ['انتقال و اتصال', () => setActions(ctx.item.objectId!)], [placedIds.has(ctx.item.objectId) ? 'از فضای آزاد بردار' : 'بگذار در فضای آزاد', () => { const id = ctx.item.objectId!; if (placedIds.has(id)) void p.onUnplaceObject(id); else { void p.onPlaceObject(id, 40, 40); setLayout('free'); } }]] as Array<[string, () => void]> : []),
                ...(ctx.item.kind === 'note' && ctx.item.noteId ? [['تبدیل به قلم دانش', () => setToKnowledge(ctx.item.noteId!)]] as Array<[string, () => void]> : []),
              ] as Array<[string, () => void]>).map(([label, fn]) => <button key={label} type="button" role="menuitem" autoFocus={label.startsWith('انتخاب')} className="body-sm rounded-control-sm px-inset-sm py-inset-sm text-start text-text-default hover:bg-bg-neutral-subtle" onClick={() => { setCtx(null); fn(); }}>{label}</button>)}
            </div>
          )}
        </div>
        {inspectorOpen && !sheet && inspector}
      </div>
      {sheet && inspectorOpen && inspector}
      {sheet && toolbar}

      <input ref={fileInput} type="file" accept=".canvas,application/json" className="sr-only" aria-label="انتخاب فایل بوم" tabIndex={-1} onChange={(e) => void importCanvas(e.target.files?.[0])} />

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} size="sm" title="میان‌برهای بوم">
        <dl className="flex flex-col gap-stack-sm">{SHORTCUTS.map(([k, v]) => <div key={k} className="flex items-start justify-between gap-inline-md"><dt className="label-md text-text-default"><kbd>{k}</kbd></dt><dd className="body-sm text-text-subtle">{v}</dd></div>)}</dl>
      </Dialog>

      <Dialog open={!!activeObj && !!activeItem} onClose={() => setActions(null)} size="sm" title={`انتقال و اتصال: ${activeObj?.title ?? ''}`}>
        {activeObj && (
          <div className="flex flex-col gap-stack-md">
            {(activeItem?.lane || layout !== 'board') && (
              <div className="flex flex-col gap-stack-xs">
                <span className="label-md text-text-default">وضعیت</span>
                <div className="flex flex-wrap gap-inline-xs">{LANES.map((l) => <Button key={l} size="sm" variant="secondary" disabled={(activeItem?.lane ?? (activeObj.status === 'Confirmed' ? 'confirmed' : 'thinking')) === l} onClick={() => { setActions(null); void request({ objectId: activeObj.id, lane: l }); }}>{LANE_FA[l]}</Button>)}</div>
              </div>
            )}
            <Select label="انتقال به گره" value={activeObj.nodeId} onChange={(e) => { setActions(null); void request({ objectId: activeObj.id, lane: activeItem?.lane ?? (activeObj.status === 'Confirmed' ? 'confirmed' : 'thinking'), nodeId: e.target.value }); }} options={p.nodes.map((n) => ({ value: n.id, label: n.label }))} />
            <div className="flex flex-wrap gap-inline-xs">
              <Button size="sm" variant="secondary" iconStart="Link2" onClick={() => { setActions(null); setConnect({ fromId: activeObj.id, toId: p.objects.find((o) => o.id !== activeObj.id && o.status !== 'Archived' && o.status !== 'Superseded')?.id ?? '', type: 'depends_on', reason: '' }); }}>ساخت اتصال</Button>
              <Button size="sm" variant="ghost" onClick={() => { setActions(null); p.onOpenObject(activeObj); }}>باز کردن</Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!pending} onClose={() => setPending(null)} size="sm" title={pending?.kind === 'accept' ? 'تأیید این مورد؟' : 'برگرداندن مورد تأییدشده'}
        footer={<><Button variant="ghost" onClick={() => setPending(null)}>انصراف</Button><Button variant="primary" loading={busy} onClick={confirmPending}>{pending?.kind === 'accept' ? 'تأیید' : 'برگردان'}</Button></>}
      >
        {pending && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">{pending.kind === 'accept' ? `«${pending.title}» واقعیت می‌شود و در بستهٔ دانش و خروجی‌های بعدی استفاده می‌شود.` : `«${pending.title}» دیگر واقعیت نیست و از خروجی‌های بعدی بیرون می‌رود.`}</p>
            <TextField label="دلیل (اختیاری)" hint="در تاریخچهٔ تغییرها ثبت می‌شود، نه در متن." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </Dialog>

      <Dialog open={!!connect} onClose={() => setConnect(null)} size="sm" title="ساخت اتصال"
        footer={<><Button variant="ghost" onClick={() => setConnect(null)}>انصراف</Button><Button variant="primary" disabled={!connect?.toId} loading={busy} onClick={doConnect}>ساخت</Button></>}>
        {connect && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">«{objectById.get(connect.fromId)?.title}»</p>
            <RadioGroup legend="این مورد…" value={connect.type} onChange={(v) => setConnect({ ...connect, type: v as 'depends_on' | 'supersedes' })} options={[{ value: 'depends_on', label: 'وابسته است به' }, { value: 'supersedes', label: 'جای این مورد را می‌گیرد' }]} />
            <Select label="این مورد" value={connect.toId} onChange={(e) => setConnect({ ...connect, toId: e.target.value })} options={[{ value: '', label: 'انتخاب کن…' }, ...p.objects.filter((o) => o.id !== connect.fromId && o.status !== 'Archived' && o.status !== 'Superseded').map((o) => ({ value: o.id, label: o.title }))]} />
            {connect.type === 'depends_on' && <p className="body-sm text-text-subtle">پیکان از «{objectById.get(connect.toId)?.title ?? 'مورد دوم'}» (اثرگذار) به «{objectById.get(connect.fromId)?.title}» (اثرپذیر) می‌رود. این خط با Ctrl+Z برمی‌گردد.</p>}
            {connect.type === 'supersedes' && <Alert intent="warning">مورد دوم «جایگزین‌شده» می‌شود (حذف نمی‌شود و در تاریخچه می‌ماند) و خروجی‌های ساخته‌شده از آن «قدیمی» می‌شوند. این کار با Ctrl+Z برنمی‌گردد.</Alert>}
            <TextField label="دلیل (اختیاری)" value={connect.reason} onChange={(e) => setConnect({ ...connect, reason: e.target.value })} />
          </div>
        )}
      </Dialog>

      <Dialog open={!!newNote} onClose={() => setNewNote(null)} size="sm" title="یادداشت تازه در فضای آزاد"
        footer={<><Button variant="ghost" onClick={() => setNewNote(null)}>انصراف</Button><Button variant="primary" disabled={!newNote?.content.trim()} loading={busy} onClick={async () => { if (!newNote) return; setBusy(true); try { await p.onCreateNote({ content: newNote.content.trim(), x: newNote.x, y: newNote.y, nodeId: newNote.nodeId }); setNewNote(null); setLayout('free'); } finally { setBusy(false); } }}>ذخیره</Button></>}>
        {newNote && (
          <div className="flex flex-col gap-stack-md">
            <Textarea label="فکر خام" rows={4} value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })} hint="این فقط یادداشت است؛ تا تبدیلش نکنی دانش نیست و به هوش مصنوعی داده نمی‌شود." />
            <Select label="به کدام گره مربوط است؟" value={newNote.nodeId} onChange={(e) => setNewNote({ ...newNote, nodeId: e.target.value })} options={p.nodes.map((n) => ({ value: n.id, label: n.label }))} />
          </div>
        )}
      </Dialog>

      <Dialog open={!!toKnowledge} onClose={() => setToKnowledge(null)} size="sm" title="تبدیل به قلم دانش">
        {toKnowledge && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">یک قلم «پیشنهادی» ساخته می‌شود؛ تا تأیید نکنی واقعیت نیست. یادداشت سر جایش می‌ماند.</p>
            <div className="flex flex-wrap gap-inline-xs">{([['Fact', 'واقعیت'], ['Decision', 'تصمیم'], ['Constraint', 'محدودیت']] as const).map(([t, label]) => <Button key={t} size="sm" variant="secondary" onClick={async () => { const id = toKnowledge; setToKnowledge(null); await p.onNoteToKnowledge(id, t); }}>{label}</Button>)}</div>
          </div>
        )}
      </Dialog>
    </div>
  );
  // full screen is an in-app layer rendered at the end of <body>: no ancestor can clip it or change what «fixed» means
  return fullscreen ? createPortal(body, document.body) : body;
};
