/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextObject, ContextRelationship, GeneratedDeliverable, Note, TreeNode } from '../../types';
import type { CanvasItem } from '../../types/state';
import { LANE_FA, LANES, moveEffect } from '../../core/canvasModel';
import type { Lane } from '../../core/canvasModel';
import { buildScene, HEAD, LAYOUT_ABOUT, LAYOUT_FA, neighbourInDirection, NOTE_H, NOTE_W, placeable } from '../../core/canvasScene';
import type { CanvasLayout, Scene, SceneItem } from '../../core/canvasScene';
import { canRedo, canUndo, createHistory, record, redo, undo } from '../../core/canvasHistory';
import type { CanvasAction, HistoryEntry } from '../../core/canvasHistory';
import { clusterItems, edgeBudget, lodOf } from '../../core/canvasLod';
import { fromJsonCanvas, toJsonCanvas } from '../../core/jsonCanvas';
import { Alert, Badge, Button, Dialog, EmptyState, IconButton, Menu, Popover, RadioGroup, SegmentedControl, Select, Switch, TextField, Textarea, formatNumber, useToast } from '../../ui';
import { CanvasEdges, routeSceneEdges } from './CanvasEdges';
import { CanvasInspector } from './CanvasInspector';
import { CanvasItemCard, CanvasNoteCard, FACET_TINT } from './CanvasItemCard';
import { CanvasMinimap } from './CanvasMinimap';
import { OverviewFar, RowRail } from './CanvasOverviewLayer';
import { ConnectDialog } from './ConnectDialog';
import { connectOptions, connectionUndo } from '../../core/connectRules';
import type { ConnectOption } from '../../core/connectRules';
import { lineageText } from '../../core/lineage';
import { beside, frameAt, freeFrames, shiftFrame } from '../../core/canvasFrames';
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
  /** «استثنای آن است»: the first card sets the second aside in its own section (and below) */
  onOverride?: (byId: string, targetId: string, reason?: string) => Promise<void>;
  onRemoveOverride?: (byId: string, targetId: string) => Promise<void>;
  /** a provenance link to a thought: go to it */
  onOpenNote?: (noteId: string, nodeId: string) => void;
  /** a thought dropped into another section's frame changes its section */
  onMoveNoteNode?: (noteId: string, nodeId: string) => Promise<void>;
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
  /** «نمای کلی حقیقت» shows approved relations; the thinking space uses its free canvas for open Thoughts and suggestions. */
  mode?: 'truth' | 'thinking';
  /** a new value turns «نشان بده چه در راه است» on (the thinking space asks «اگر همه را تأیید کنم؟») */
  previewNonce?: number;
  /** thinking canvas: go to the truth map with the suggestions shown */
  onPreviewTruth?: () => void;
  /** Ctrl/⌘K picked an item while the truth canvas is open: show it here (a new `n` = a new request) */
  revealObject?: { id: string; n: number };
  /** «دور یک مورد» looks beyond the section we are inside: everything in the workspace */
  lineageObjects?: ContextObject[];
  /** a free note can become a SECTION of the tree: the person picks the name and the parent */
  onNoteToSection?: (noteId: string) => void;
}

type Pending = { kind: 'accept'; payload: MovePayload; title: string } | { kind: 'backward'; payload: MovePayload; title: string } | null;
const PREF_KEY = 'mabda.canvas.prefs';
const TIPS_KEY = 'mabda.canvas.tips';
const TIPS = [
  'یک کارت را انتخاب کن تا هرچه روی آن اثر دارد روشن شود. بقیهٔ امکان‌ها زیر «⋯» است.',
];
const TIPS_THINKING = [
  'فکرها و پیشنهادها در «تازه‌ها» کنار بوم‌اند؛ بکش و هرجا خواستی بگذار. روی فضای خالی دابل‌کلیک کن تا یادداشت آزاد بنویسی؛ برای ایده یا سؤال باز از «فکر تازه» در فهرست فکرها استفاده کن. کارت حقیقت را با «بگذار در بوم فکر» کنارشان بیاور.',
];
const SHORTCUTS: Array<[string, string]> = [['F', 'تمام‌صفحه (ESC خروج)'], ['C', 'وصل کن (مبدأ، بعد مقصد)'], ['L', 'دور کارت انتخاب‌شده (نمای کلی حقیقت)'], ['I', 'باز و بسته کردن بازرس'], ['؟', 'این راهنما'], ['/  یا  Ctrl+K', 'جستجوی کارت'], ['Ctrl+Z / Ctrl+Shift+Z', 'برگرداندن / از نو'], ['پیکان‌ها', 'رفتن به کارت کناری (روی یک کارت) یا جابه‌جایی بوم'], ['Enter', 'انتخاب کارت'], ['+  /  −  /  0', 'بزرگ‌نمایی / کوچک‌نمایی / متناسب‌سازی'], ['Shift + کلیک', 'انتخاب چندتایی'], ['دابل‌کلیک روی فضای خالی', 'یادداشت آزاد تازه'], ['کلیک راست یا نگه‌داشتن', 'منوی کارت']];

// three looks, one engine: the overview and «دور یک مورد» (the truth canvas), the free canvas (thinking). «تابلو» is gone: see docs/canvas-design.md
const MODE_LAYOUTS: Record<'truth' | 'thinking', CanvasLayout[]> = { truth: ['overview'], thinking: ['free'] };
const readPrefs = (): Partial<{ layouts: Partial<Record<'truth' | 'thinking', CanvasLayout>>; rowOrder: string[] }> => { try { return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}'); } catch { return {}; } };
const readTips = (): number[] => { try { return JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]'); } catch { return []; } };
function useMedia(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]);
  return m;
}

/** One scene engine serves the truth overview and the free thinking canvas. See docs/canvas-design.md for their distinct jobs. */
export const ContextCanvas: React.FC<CanvasProps> = (p) => {
  const toast = useToast();
  const prefs = useMemo(readPrefs, []);
  const isMobile = useMedia('(max-width: 767px)');
  const mode = p.mode ?? 'truth';
  const layouts = MODE_LAYOUTS[mode];
  const [layout, setLayoutRaw] = useState<CanvasLayout>(() => { const l = prefs.layouts?.[mode]; return l && layouts.includes(l) ? l : layouts[0]; });
  const setLayout = (l: CanvasLayout) => setLayoutRaw(layouts.includes(l) ? l : layouts[0]);
  const [onlyReview, setOnlyReview] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [showAllEdges, setShowAllEdges] = useState(false);
  const [colorFacet, setColorFacet] = useState(false);
  // the overview: deeper sections opened into their own rows, one kind only, the user's row order (display only, remembered on this device)
  const [openedRows, setOpenedRows] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState<'' | 'constraint' | 'pending'>('');
  const [rowsBy, setRowsBy] = useState<'domain' | 'facet'>('domain');
  const [rowOrder, setRowOrder] = useState<string[]>(() => prefs.rowOrder ?? []);
  // «دور یک مورد»: the card in the middle and how many steps
  const [lineage, setLineage] = useState<{ id: string; depth: number } | null>(null);
  // «وصل کن»: tap a card, tap another (no dragging needed; works with a keyboard)
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  // the free canvas: a section's frame moves all its cards together (live offset while dragging)
  const [groupDrag, setGroupDrag] = useState<{ nodeId: string; dx: number; dy: number } | null>(null);
  const [frameDlg, setFrameDlg] = useState<string | null>(null);
  const [frameMenuAt, setFrameMenuAt] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [moveTo, setMoveTo] = useState<{ noteId?: string; objectId?: string; itemId: string; nodeId: string } | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // «docked» takes its own column; «floating» hovers over the canvas so the canvas does not resize; «closed» hides it
  const [inspectorMode, setInspectorMode] = useState<'docked' | 'floating' | 'closed'>(() => (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches ? 'closed' : 'docked'));
  const inspectorOpen = inspectorMode !== 'closed';
  const setInspectorOpen = (v: boolean | ((cur: boolean) => boolean)) => setInspectorMode((cur) => {
    const open = typeof v === 'function' ? v(cur !== 'closed') : v;
    return open ? (cur === 'closed' ? 'docked' : cur) : 'closed';
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ctx, setCtx] = useState<{ item: SceneItem; x: number; y: number } | null>(null);
  const [tipsDone, setTipsDone] = useState<number[]>(readTips);
  const [hist, setHist] = useState(() => createHistory());
  useEffect(() => { try { const old = readPrefs(); localStorage.setItem(PREF_KEY, JSON.stringify({ layouts: { ...old.layouts, [mode]: layout }, rowOrder })); } catch { /* a per-viewer convenience only */ } }, [layout, mode, rowOrder]);
  useEffect(() => { if (p.previewNonce) setShowPending(true); }, [p.previewNonce]);

  const root = useRef<HTMLDivElement>(null);
      const fileInput = useRef<HTMLInputElement>(null);
  const now = useMemo(() => new Date(), []);

  const layoutEff: CanvasLayout = lineage ? 'lineage' : layout;
  const scene: Scene = useMemo(
    () => buildScene(layoutEff, { nodes: p.nodes, objects: lineage ? p.lineageObjects ?? p.objects : p.objects, relationships: p.relationships, deliverables: p.deliverables, notes: p.notes, canvas: p.canvas, reviewIds: p.reviewIds, staleAssetIds: p.staleAssetIds, now }, { onlyReview, showPending, tray: mode === 'thinking', only: only || undefined, rowsBy, opened: openedRows, rowOrder, centerId: lineage?.id, depth: lineage?.depth }),
    [layoutEff, lineage, p.lineageObjects, only, rowsBy, openedRows, rowOrder, p.nodes, p.objects, p.relationships, p.deliverables, p.notes, p.canvas, p.reviewIds, p.staleAssetIds, now, onlyReview, showPending, mode],
  );
  const byId = useMemo(() => new Map(scene.items.map((i) => [i.id, i])), [scene]);
  const frames = useMemo(() => (layoutEff === 'free' ? freeFrames(scene.items, p.nodes) : []), [layoutEff, scene.items, p.nodes]);
  const objectById = useMemo(() => new Map((p.lineageObjects ?? p.objects).map((o) => [o.id, o])), [p.lineageObjects, p.objects]);
  const facetNames = useMemo(() => [...new Set(p.objects.flatMap((o) => o.facets ?? []))].sort((a, b) => a.localeCompare(b)), [p.objects]);
  const placedIds = useMemo(() => new Set(p.canvas.free.filter((i) => i.itemRef.startsWith('obj:')).map((i) => i.itemRef.slice(4))), [p.canvas.free]);

  const shapeKey = `${layoutEff}|${lineage?.id ?? ''}|${lineage?.depth ?? 0}|${only}|${rowsBy}|${openedRows.size}|${rowOrder.join(',')}|${onlyReview}|${showPending}|${scene.items.length}`;
  const { box, view, setView, size, fit, zoomAt, reveal, toStage, handlers } = usePanZoom({ width: scene.width, height: scene.height }, shapeKey, isMobile ? (layoutEff === 'lineage' ? 0.55 : layoutEff === 'overview' ? 0.5 : 0.68) : layoutEff === 'lineage' ? 0.5 : layoutEff === 'overview' ? 0.55 : 0.85, fullscreen);
  const lod = lodOf(view.k);
  const overviewFar = layoutEff === 'overview' && lod === 'far';

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
  const clusters = useMemo(() => (lod === 'far' && layoutEff !== 'overview' && shown.length > 900 ? clusterItems(shown, view.k) : null), [lod, shown, view.k]);

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
    if (connectMode) { pickForConnect(id); return; }
    setSelectedEdge(null);
    setSelection((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
    if (isMobile) setInspectorOpen(true);
  }, [isMobile, connectMode, connectFrom, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearSelection = useCallback(() => { setSelection([]); setSelectedEdge(null); }, []);
  const goTo = useCallback((id: string) => {
    const it = byId.get(id);
    if (!it) return;
    setSelection([id]); setSelectedEdge(null);
    if (isMobile) setInspectorOpen(true); // like a tap: the sentence about the card shows
    setView((cur) => { const k = Math.max(cur.k, 0.9); return { k, x: size.w / 2 - (it.x + it.w / 2) * k, y: size.h / 2 - (it.y + it.h / 2) * k }; });
    setTimeout(() => (box.current?.querySelector(`[data-item-id="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }), 80);
  }, [byId, setView, size.w, size.h, box, isMobile]);

  // ── the overview: open / close deeper rows, move a row (display only), zoom to rows ──
  const toggleRow = useCallback((nodeId: string) => setOpenedRows((cur) => { const n = new Set(cur); if (n.has(nodeId)) n.delete(nodeId); else n.add(nodeId); return n; }), []);
  const moveRow = useCallback((nodeId: string, dir: -1 | 1) => {
    const ids = (scene.overview?.rows ?? []).map((r) => r.nodeId);
    const i = ids.indexOf(nodeId), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setRowOrder(ids);
  }, [scene.overview]);
  const zoomToRect = useCallback((x: number, y: number, w: number, h: number) => setView(() => { const k = Math.min(1, Math.max(0.5, Math.min(size.w / (w + 80), size.h / (h + 80)))); return { k, x: size.w / 2 - (x + w / 2) * k, y: size.h / 2 - (y + h / 2) * k }; }), [setView, size.w, size.h]);
  const zoomRow = useCallback((nodeId: string) => { const r = scene.overview?.rows.find((x) => x.nodeId === nodeId); if (r) zoomToRect(0, r.y, scene.width, r.h); }, [scene.overview, scene.width, zoomToRect]);
  const zoomRows = useCallback((a: string, b: string) => {
    const rs = (scene.overview?.rows ?? []).filter((x) => x.nodeId === a || x.nodeId === b);
    if (!rs.length) return;
    const top = Math.min(...rs.map((r) => r.y)), bottom = Math.max(...rs.map((r) => r.y + r.h));
    zoomToRect(0, top, scene.width, bottom - top);
  }, [scene.overview, scene.width, zoomToRect]);

  // Ctrl/⌘K → «show it here»: leave «دور یک مورد», clear filters that would hide it, then go to the card
  const revealSeen = useRef(0);
  useEffect(() => {
    const r = p.revealObject;
    if (!r || r.n === revealSeen.current) return;
    revealSeen.current = r.n;
    setLineage(null); setOnly(''); setOnlyReview(false);
    setTimeout(() => goTo(`o:${r.id}`), 150);
  }, [p.revealObject]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── «دور یک مورد»: in and out. Going back puts the card in the middle of the overview again, so she sees where it sits in the whole ──
  const enterLineage = useCallback((objectId: string) => { setConnectMode(false); setConnectFrom(null); setLineage({ id: objectId, depth: 2 }); setSelection([`o:${objectId}`]); setSelectedEdge(null); }, []);
  const exitLineage = useCallback(() => {
    const id = lineage?.id;
    setLineage(null);
    if (id) setTimeout(() => { setSelection([`o:${id}`]); goTo(`o:${id}`); }, 120);
  }, [lineage, goTo]);

  // ── «وصل کن»: pick a source, then a target (a tap each); the dialog says what each sentence would do ──
  const toggleConnect = useCallback(() => { setConnectMode((v) => !v); setConnectFrom(null); }, []);
  // ── the free canvas: section frames ──
  const labelOfNode = (id: string) => p.nodes.find((n) => n.id === id)?.label ?? '';
  const placeMany = (list: Array<{ id: string; x: number; y: number }>) => {
    for (const m of list) { const it = byId.get(m.id); if (!it) continue; if (it.noteId) p.onMoveNote(it.noteId, m.x, m.y); else if (it.objectId) void p.onPlaceObject(it.objectId, m.x, m.y); }
  };
  const toAction = (m: { id: string; x: number; y: number }): CanvasAction | undefined => { const it = byId.get(m.id); return it?.noteId ? { type: 'moveNote', noteId: it.noteId, x: m.x, y: m.y } : it?.objectId ? { type: 'placeObject', objectId: it.objectId, x: m.x, y: m.y } : undefined; };
  const moveFrame = (f: ReturnType<typeof freeFrames>[number], dx: number, dy: number) => {
    const next = shiftFrame(f, scene.items, dx, dy);
    const was = next.map((m) => ({ id: m.id, x: byId.get(m.id)!.x, y: byId.get(m.id)!.y }));
    if (next.every((m, i) => m.x === was[i].x && m.y === was[i].y)) return;
    placeMany(next);
    push({ label: `جابه‌جایی بخش «${f.label}»`, undo: was.map(toAction).filter(Boolean) as CanvasAction[], redo: next.map(toAction).filter(Boolean) as CanvasAction[] });
  };
  const startFrameDrag = (e: React.PointerEvent, f: ReturnType<typeof freeFrames>[number]) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return; // a finger or a mouse drags the header; the menu / dialog is the no-drag way
    e.stopPropagation();
    const origin = toStage(e.clientX, e.clientY);
    let moved = false;
    const move = (ev: PointerEvent) => { const s2 = toStage(ev.clientX, ev.clientY); if (!moved && Math.hypot(s2.x - origin.x, s2.y - origin.y) < 6) return; moved = true; setGroupDrag({ nodeId: f.nodeId, dx: s2.x - origin.x, dy: s2.y - origin.y }); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setGroupDrag(null);
      if (!moved) return;
      const s2 = toStage(ev.clientX, ev.clientY);
      moveFrame(f, s2.x - origin.x, s2.y - origin.y);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const frameMenu = (f: ReturnType<typeof freeFrames>[number]) => [
    { label: 'ببر سمت راست', icon: 'ChevronUp' as const, onSelect: () => moveFrame(f, 160, 0) },
    { label: 'ببر سمت چپ', icon: 'ChevronUp' as const, onSelect: () => moveFrame(f, -160, 0) },
    { label: 'ببر بالاتر', icon: 'ChevronUp' as const, onSelect: () => moveFrame(f, 0, -120) },
    { label: 'ببر پایین‌تر', icon: 'ChevronDown' as const, onSelect: () => moveFrame(f, 0, 120) },
    ...(frames.length > 1 ? [{ divider: true } as const, ...frames.filter((o) => o.nodeId !== f.nodeId).slice(0, 8).map((o) => ({ label: `کنار «${o.label}» بگذار`, icon: 'ChevronDown' as const, onSelect: () => { const d = beside(f, o); moveFrame(f, d.dx, d.dy); } }))] : []),
  ];
  /** a card or thought dropped into another section's frame (or moved by the menu) changes ITS section; clear message, Undo */
  const changeSection = async (item: SceneItem, nodeId: string, at?: { x: number; y: number }) => {
    const from = item.nodeId ?? '';
    if (!nodeId || nodeId === from) return;
    setBusy(true);
    try {
      if (item.noteId && p.onMoveNoteNode) {
        await p.onMoveNoteNode(item.noteId, nodeId);
        if (at) p.onMoveNote(item.noteId, at.x, at.y);
        push({ label: 'بخشِ یادداشت', undo: [{ type: 'moveNoteNode', noteId: item.noteId, nodeId: from }, ...(at ? [{ type: 'moveNote', noteId: item.noteId, x: item.x, y: item.y } as CanvasAction] : [])], redo: [{ type: 'moveNoteNode', noteId: item.noteId, nodeId }, ...(at ? [{ type: 'moveNote', noteId: item.noteId, x: at.x, y: at.y } as CanvasAction] : [])] });
        toast.show({ intent: 'success', message: `این فکر حالا در بخش «${labelOfNode(nodeId)}» است. با «برگرداندن» برمی‌گردد.` });
      } else if (item.objectId) {
        const o = objectById.get(item.objectId);
        if (!o) return;
        if (at) void p.onPlaceObject(item.objectId, at.x, at.y);
        await request({ objectId: o.id, lane: o.status === 'Confirmed' ? 'confirmed' : 'thinking', nodeId });
      }
    } finally { setBusy(false); }
  };
  function pickForConnect(itemId: string) {
    const it = byId.get(itemId);
    if (!it?.objectId) return;
    if (!connectFrom) { setConnectFrom(it.objectId); setSelection([itemId]); return; }
    if (connectFrom === it.objectId) { setConnectFrom(null); setSelection([]); return; }
    setConnect({ fromId: connectFrom, toId: it.objectId });
  }
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
      else if (a.type === 'moveNoteNode') await p.onMoveNoteNode?.(a.noteId, a.nodeId);
      else if (a.type === 'removeOverride') await p.onRemoveOverride?.(a.objectId, a.targetId);
      else if (a.type === 'addOverride') await p.onOverride?.(a.objectId, a.targetId);
      else if (a.type === 'moveNote') p.onMoveNote(a.noteId, a.x, a.y);
      else if (a.type === 'placeObject') await p.onPlaceObject(a.objectId, a.x, a.y);
      else await p.onUnplaceObject(a.objectId);
    }
  }, [p]);
  const push = useCallback((e: HistoryEntry) => setHist((h) => record(h, e)), []);
  const doUndo = useCallback(async () => { const r = undo(hist); if (!r.entry) return; setHist(r.history); setBusy(true); try { await exec(r.entry.undo); toast.show({ intent: 'success', message: `برگشت: ${r.entry.label}` }); } finally { setBusy(false); } }, [hist, exec, toast]);
  const doRedo = useCallback(async () => { const r = redo(hist); if (!r.entry) return; setHist(r.history); setBusy(true); try { await exec(r.entry.redo); } finally { setBusy(false); } }, [hist, exec]);

  const [linkDrag, setLinkDrag] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [actions, setActions] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [connect, setConnect] = useState<{ fromId: string; toId: string } | null>(null);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorId, setAnchorId] = useState('');
  const [newNote, setNewNote] = useState<{ content: string; nodeId: string; x: number; y: number } | null>(null);
  const [toKnowledge, setToKnowledge] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [noteDrag, setNoteDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  // the thinking canvas opens ON the tray («تازه‌ها»): what has no place yet is what she came to deal with
  const trayShape = useRef('');
  useEffect(() => {
    if (mode !== 'thinking' || layout !== 'free') { trayShape.current = ''; return; }
    const first = scene.items.find((i) => i.unplaced);
    if (first && trayShape.current !== shapeKey && size.w > 0) { trayShape.current = shapeKey; setTimeout(() => reveal(first.x, first.y, first.w, first.h), 0); }
  }, [mode, layout, scene.items, size.w, reveal, shapeKey]);
  const dragEnabled = layout === 'free';

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
    setBusy(true);
    try {
      await p.onMove(payload);
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
      setNoteDrag({ id: item.id, x: s.x - grab.x, y: s.y - grab.y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setNoteDrag(null);
      if (!moved) return;
      const s = toStage(ev.clientX, ev.clientY);
      const nx = Math.max(0, Math.round(s.x - grab.x)), ny = Math.max(0, Math.round(s.y - grab.y));
      if (layout === 'free') {
        const target = frameAt(frames, s.x, s.y, item.nodeId);
        if (target) { void changeSection(item, target.nodeId, { x: nx, y: ny }); return; }
        if (isNote && item.noteId) { const was = { x: item.x, y: item.y }; p.onMoveNote(item.noteId, nx, ny); push({ label: 'جابه‌جایی یادداشت', undo: [{ type: 'moveNote', noteId: item.noteId, ...was }], redo: [{ type: 'moveNote', noteId: item.noteId, x: nx, y: ny }] }); }
        else if (item.objectId) { const was = { x: item.x, y: item.y }; void p.onPlaceObject(item.objectId, nx, ny); push({ label: 'جابه‌جایی کارت', undo: [{ type: 'placeObject', objectId: item.objectId, ...was }], redo: [{ type: 'placeObject', objectId: item.objectId, x: nx, y: ny }] }); }
        return;
      }
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
      if (to && to !== item.objectId) setConnect({ fromId: item.objectId!, toId: to });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const connectOpts = useMemo(() => {
    const a = connect ? objectById.get(connect.fromId) : undefined, b = connect ? objectById.get(connect.toId) : undefined;
    return a && b ? connectOptions(a, b, p.nodes, p.relationships, p.objects) : [];
  }, [connect, objectById, p.nodes, p.relationships, p.objects]);
  const confirmConnect = async (opt: ConnectOption, why: string) => {
    setBusy(true);
    try {
      const reasonPart = why ? { reason: why } : {};
      const undo = connectionUndo(opt, p.relationships);
      if (opt.type === 'depends_on') {
        await p.onConnect({ fromId: opt.fromId, toId: opt.toId, type: 'depends_on', ...reasonPart });
        if (undo.type === 'setDependencies') push({ label: 'خط تازه', undo: [undo], redo: [{ type: 'setDependencies', objectId: opt.fromId, targetIds: [...new Set([...undo.targetIds, opt.toId])] }] });
      } else if (opt.type === 'supersedes') {
        await p.onConnect({ fromId: opt.fromId, toId: opt.toId, type: 'supersedes', ...reasonPart, confirmed: true });
      } else if (p.onOverride) {
        await p.onOverride(opt.fromId, opt.toId, why || undefined);
        push({ label: 'کنار گذاشتن', undo: [{ type: 'removeOverride', objectId: opt.fromId, targetId: opt.toId }], redo: [{ type: 'addOverride', objectId: opt.fromId, targetId: opt.toId }] });
      }
      toast.show({ intent: 'success', message: opt.type === 'supersedes' ? 'جایگزین شد؛ مورد قبلی در تاریخچه می‌ماند.' : 'وصل شد. با «برگرداندن» برمی‌گردد.' });
      setConnect(null); setConnectFrom(null); setConnectMode(false);
      setTimeout(() => box.current?.focus({ preventScroll: true }), 50); // so Ctrl+Z works right away
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
      if (frameMenuAt) setFrameMenuAt(null); else if (connect) setConnect(null); else if (connectMode) { setConnectMode(false); setConnectFrom(null); } else if (ctx) setCtx(null); else if (helpOpen) setHelpOpen(false); else if (query) setQuery(''); else if (fullscreen) setFullscreen(false); else clearSelection();
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
    else if (!mod && e.code === 'KeyC') { e.preventDefault(); toggleConnect(); }
    else if (!mod && e.code === 'KeyL' && mode === 'truth') { e.preventDefault(); const o = selection.length === 1 ? byId.get(selection[0])?.objectId : undefined; if (o) enterLineage(o); }
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
    if (mode !== 'thinking' || (e.target as HTMLElement).closest('[data-item-id], button, [data-no-pan]')) return;
    const s = toStage(e.clientX, e.clientY);
    setNewNote({ content: '', nodeId: '', x: Math.max(0, Math.round(s.x)), y: Math.max(0, Math.round(s.y)) });
  };
  const press = useRef<number | undefined>(undefined);
  const onCardDown = (e: React.PointerEvent, item: SceneItem) => {
    if (e.pointerType === 'touch') { const { clientX, clientY } = e; window.clearTimeout(press.current); press.current = window.setTimeout(() => setCtx({ item, x: clientX, y: clientY }), 520); return; }
    startDrag(e, item);
  };
  useEffect(() => { const clear = () => window.clearTimeout(press.current); window.addEventListener('pointerup', clear); window.addEventListener('pointermove', clear, { passive: true }); return () => { window.removeEventListener('pointerup', clear); window.removeEventListener('pointermove', clear); }; }, []);


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
      toast.show({ intent: 'success', message: `${formatNumber(r.cards.length)} یادداشت در بوم فکر گذاشته شد${r.skipped ? ` (${formatNumber(r.skipped)} مورد از نوع دیگر کنار ماند)` : ''}.` });
      setLayout('free');
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof Error ? e.message : 'ورود فایل ناموفق بود.' }); }
  };

  const tips = mode === 'thinking' ? TIPS_THINKING : TIPS;
  const tipBase = mode === 'thinking' ? 10 : 0; // thinking tips are remembered on their own
  const tip = tips.findIndex((_, i) => !tipsDone.includes(tipBase + i)) < 0 ? undefined : tips.findIndex((_, i) => !tipsDone.includes(tipBase + i));
  const dismissTip = (i: number) => { const next = [...tipsDone, tipBase + i]; setTipsDone(next); try { localStorage.setItem(TIPS_KEY, JSON.stringify(next)); } catch { /* optional */ } };

  const itemObj = (id: string) => byId.get(id)?.objectId;
  const activeObj = actions ? objectById.get(actions) : undefined;
  const activeItem = actions ? scene.items.find((i) => i.objectId === actions) : undefined;
  const hasContent = p.objects.length > 0 || p.deliverables.length > 0 || p.notes.length > 0;
  const sel1 = selection.length === 1 ? byId.get(selection[0]) : undefined;
  const sheet = isMobile && fullscreen;

  const aboutText = LAYOUT_ABOUT[layoutEff];
  const optionsCount = (onlyReview ? 1 : 0) + (showPending ? 1 : 0) + (showAllEdges ? 1 : 0) + (colorFacet ? 1 : 0) + (only ? 1 : 0) + (rowsBy !== 'domain' ? 1 : 0);
  const options = (
    <div className="flex min-w-overlay-xs flex-col gap-stack-sm p-inset-sm" role="group" aria-label="گزینه‌های نما">
      <p className="body-sm text-text-subtle">فقط نمایش را عوض می‌کنند؛ چیزی ذخیره نمی‌شود.</p>
      {(layoutEff === 'overview' || layoutEff === 'lineage') && <Switch label="نشان بده چه در راه است" checked={showPending} onChange={(e) => setShowPending(e.target.checked)} />}
      {layoutEff === 'overview' && facetNames.length > 0 && <RadioGroup legend="ردیف‌ها" value={rowsBy} onChange={(v) => setRowsBy(v as 'domain' | 'facet')} options={[{ value: 'domain', label: 'بخش‌ها' }, { value: 'facet', label: 'بُعد (مثل مخاطب یا کانال)' }]} />}
      {layoutEff === 'overview' && <RadioGroup legend="نوع" value={only} onChange={(v) => setOnly(v as '' | 'constraint' | 'pending')} options={[{ value: '', label: 'همه' }, { value: 'constraint', label: 'فقط خط قرمزها' }, { value: 'pending', label: 'فقط پیشنهادها (با «در راه»)' }]} />}
      <Switch label="فقط نیاز به بازبینی" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
      {scene.edges.length > 0 && <Switch label="نمایش همهٔ خط‌ها" checked={showAllEdges} onChange={(e) => setShowAllEdges(e.target.checked)} />}
      {facetNames.length > 0 && layout !== 'free' && <Switch label="رنگ بر اساس بُعد" checked={colorFacet} onChange={(e) => setColorFacet(e.target.checked)} />}
    </div>
  );
  // the toolbar is grouped, not long (Gestalt): view [layout · search · options] · history [undo / redo] · camera [zoom · fit · full screen] · [new note] · [details panel] · «⋯».
  // Only the rare things (auto layout, JSON Canvas, shortcuts, «this layout?») live under «⋯».
  const toolbar = (
    <div className={`flex flex-wrap items-center gap-inline-sm ${sheet ? 'order-last border-t border-border-default pt-inset-sm' : ''}`} role="toolbar" aria-label="نوار ابزار بوم" data-testid="canvas-toolbar">
      {layouts.length > 1 && <SegmentedControl label="چیدمان بوم" value={layout} onChange={(id) => { setLayout(id as CanvasLayout); clearSelection(); }} items={layouts.map((k) => ({ id: k, label: LAYOUT_FA[k] }))} />}
      <span className="relative">
      <TextField id="canvas-search" size="md" iconStart="Search" aria-label="جستجوی کارت" placeholder="جستجوی کارت" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { goTo(results[0].id); setQuery(''); } }} className="w-space-40" />
      {results.length > 0 && (
        <ul role="listbox" aria-label="نتیجهٔ جستجو" className="absolute top-full z-dropdown mt-stack-xs flex min-w-overlay-xs flex-col rounded-control border border-border-default bg-surface-overlay p-inset-xs shadow-raised">
          {results.map((r) => <li key={r.id} role="presentation"><button type="button" role="option" aria-selected="false" className="body-sm w-full rounded-control-sm px-inset-sm py-inset-xs text-start text-text-default hover:bg-bg-neutral-subtle" onClick={() => { goTo(r.id); setQuery(''); }}>{r.label}</button></li>)}
        </ul>
      )}
      </span>
      <Popover label="گزینه‌های نما" align={isMobile ? 'end' : 'start'} trigger={<Button size="sm" variant="secondary" iconStart="Filter">گزینه‌ها{optionsCount ? ` (${formatNumber(optionsCount)})` : ''}</Button>}>{options}</Popover>
      {!lineage && (isMobile
        ? <IconButton icon="Link2" label="وصل کن (دو کارت را پشت‌سرهم بزن)" aria-pressed={connectMode} onClick={toggleConnect} />
        : <Button size="sm" variant={connectMode ? 'secondary' : 'ghost'} iconStart="Link2" aria-pressed={connectMode} onClick={toggleConnect}>وصل کن</Button>)}
      <span className="flex items-center gap-inline-xs" role="group" aria-label="برگرداندن و از نو">
        <IconButton icon="Undo2" label="برگرداندن (Ctrl+Z)" disabled={!canUndo(hist) || busy} onClick={() => void doUndo()} />
        <IconButton icon="Redo2" label="از نو (Ctrl+Shift+Z)" disabled={!canRedo(hist) || busy} onClick={() => void doRedo()} />
      </span>
      <span className="flex items-center gap-inline-xs" role="group" aria-label="بزرگ‌نمایی">
        {!isMobile && <IconButton icon="ZoomOut" label="کوچک‌نمایی" onClick={() => zoomAt(1 / 1.25)} />}
        <IconButton icon="Fullscreen" label="متناسب‌سازی" onClick={fit} />
        {!isMobile && <IconButton icon="ZoomIn" label="بزرگ‌نمایی" onClick={() => zoomAt(1.25)} />}
      </span>
      <IconButton id="canvas-fs" icon={fullscreen ? 'Minimize2' : 'Maximize'} label={fullscreen ? 'خروج از تمام‌صفحه (ESC)' : 'تمام‌صفحه (F)'} aria-pressed={fullscreen} onClick={() => setFullscreen((v) => !v)} />
      {mode === 'thinking' && <Button size="sm" variant="secondary" iconStart="Plus" onClick={() => setNewNote({ content: '', nodeId: '', x: 0, y: 0 })}>یادداشت آزاد</Button>}
      <span className="ms-auto flex items-center gap-inline-xs" data-toolbar-overflow="">
        {!sheet && <IconButton icon="PanelRight" label={inspectorOpen ? 'بستن جزئیات (I)' : 'نمایش جزئیات (I)'} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((v) => !v)} />}
        <Menu label="بیشتر" align="end" trigger={<IconButton icon="Ellipsis" label="بیشتر" />} items={[
          ...(mode === 'thinking' && frames.length > 0 ? [{ label: 'جابه‌جا کردن یک بخش…', icon: 'FolderTree' as const, onSelect: () => setFrameDlg(frames[0].nodeId) }] : []),
          ...(mode === 'thinking' ? [{ label: 'کارت حقیقت را کنار فکرها بیاور…', icon: 'BookOpen' as const, onSelect: () => { setAnchorId(''); setAnchorOpen(true); } }] : []),
          ...(isMobile ? [{ label: 'بزرگ‌نمایی', icon: 'ZoomIn' as const, onSelect: () => zoomAt(1.25) }, { label: 'کوچک‌نمایی', icon: 'ZoomOut' as const, onSelect: () => zoomAt(1 / 1.25) }, { divider: true } as const] : []),
          { label: 'چیدمان خودکار (پاک کردن ترتیب دستی)', icon: 'Wand2', onSelect: () => { void (async () => { setBusy(true); try { await p.onAutoLayout(); } finally { setBusy(false); } })(); } },
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
  const floating = inspectorMode === 'floating' && !sheet;
  const inspector = (
    <aside data-testid="canvas-inspector" data-mode={sheet ? 'sheet' : inspectorMode} className={`flex flex-col gap-stack-sm overflow-auto rounded-control border border-border-default p-inset-lg ${floating ? 'absolute end-space-2 top-space-2 z-dropdown w-overlay-xs max-w-full bg-surface-overlay shadow-raised' : `bg-surface-raised ${sheet ? 'order-last' : fullscreen ? 'w-overlay-xs shrink-0' : 'lg:w-overlay-xs lg:shrink-0'}`}`} style={sheet ? { maxBlockSize: '42vh' } : floating ? { maxBlockSize: 'calc(100% - 16px)' } : undefined} aria-label="بازرس: جزئیات مورد انتخاب‌شده" aria-live="polite">
      <div className="flex items-center justify-between gap-inline-sm">
        <span className="label-sm text-text-subtle">جزئیات</span>
        <span className="flex items-center gap-inline-xs">
          {!sheet && <IconButton icon={floating ? 'PanelRight' : 'PictureInPicture2'} label={floating ? 'جا دادن کنار بوم' : 'شناور کردن روی بوم'} aria-pressed={floating} onClick={() => setInspectorMode(floating ? 'docked' : 'floating')} />}
          <IconButton icon="X" label="بستن جزئیات (I)" onClick={() => setInspectorMode('closed')} />
        </span>
      </div>
      <CanvasInspector
        scene={scene} selection={selection} selectedEdge={edge(selectedEdge)} objects={p.lineageObjects ?? p.objects} nodes={p.nodes} relationships={p.relationships} deliverables={p.deliverables} lod={lod} now={now}
        canMoveStatus={false} onOpenObject={p.onOpenObject} onOpenAssets={p.onOpenAssets} onActions={setActions} onAcceptReview={p.onAcceptReview}
        onPlace={mode === 'thinking' ? (id) => { void p.onPlaceObject(id, 40 + (placedIds.size % 4) * 260, 40 + Math.floor(placedIds.size / 4) * 150); setLayout('free'); } : undefined}
        notes={p.notes} onLineage={mode === 'truth' && !lineage ? enterLineage : undefined} onOpenNote={p.onOpenNote}
        onUnplace={mode === 'thinking' ? (id) => void p.onUnplaceObject(id) : undefined} placed={!!sel1?.objectId && placedIds.has(sel1.objectId)} onClear={clearSelection} onSelect={(id) => select(id)}
      />
    </aside>
  );

  const rootClass = fullscreen ? 'fixed top-space-0 bottom-space-0 start-space-0 end-space-0 z-dialog flex flex-col gap-stack-sm bg-surface-page p-inset-md' : 'flex flex-col gap-stack-md rounded-container border border-border-default bg-surface-raised p-inset-lg';
  const viewLabel = mode === 'truth' ? 'نمای کلی حقیقت' : 'بوم فکر';
  const body = (
    <div ref={root} onKeyDown={onRootKey} className={rootClass} role={fullscreen ? 'dialog' : 'region'} aria-modal={fullscreen || undefined} aria-label={viewLabel} data-fullscreen={fullscreen ? 'true' : 'false'} data-testid="canvas-root">
      {!sheet && toolbar}
      {lineage && (
        <div className="flex flex-wrap items-center gap-inline-sm rounded-control border border-border-selected bg-bg-selected px-inset-md py-inset-xs" data-testid="lineage-bar" role="status">
          <Button size="sm" variant="secondary" iconStart="ArrowRight" onClick={exitLineage}>برگشت به نمای کلی</Button>
          <span className="body-sm min-w-space-0 flex-1 text-text-default">دور «{objectById.get(lineage.id)?.title ?? ''}»{scene.lineage && (scene.lineage.hidden.upstream + scene.lineage.hidden.downstream) > 0 ? ` — ${formatNumber(scene.lineage.hidden.upstream + scene.lineage.hidden.downstream)} مورد دورتر هم هست` : ''}</span>
          <SegmentedControl label="چند قدم" value={String(lineage.depth)} onChange={(v) => setLineage({ ...lineage, depth: Number(v) })} items={[{ id: '1', label: '۱ قدم' }, { id: '2', label: '۲ قدم' }, { id: '3', label: '۳ قدم' }]} />
        </div>
      )}
      {connectMode && (
        <div className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control border border-border-selected bg-bg-selected px-inset-md py-inset-xs" data-testid="connect-bar" role="status">
          <span className="body-sm text-text-default">{connectFrom ? `«${objectById.get(connectFrom)?.title ?? ''}» انتخاب شد؛ حالا کارت دوم را بزن.` : 'وصل کن: اول کارتی را بزن که می‌خواهی وصلش کنی (بعد کارت دوم).'}</span>
          <Button size="sm" variant="ghost" onClick={toggleConnect}>انصراف</Button>
        </div>
      )}
      {aboutOpen && <Alert intent="info" title={`چیدمان «${LAYOUT_FA[layoutEff]}»: ${aboutText.question}`} onClose={() => setAboutOpen(false)}>{aboutText.what}</Alert>}
      {!aboutOpen && (
        <div className="flex flex-wrap items-center justify-between gap-inline-sm">
          <p className="body-sm text-text-subtle" data-testid="layout-about">{aboutText.question}</p>
          {(only || onlyReview || showPending || rowsBy === 'facet') && !lineage && <span role="status" data-testid="filter-active" className="body-sm rounded-pill border border-border-selected bg-bg-selected px-inset-sm text-text-default">نما فیلتر دارد: {[only === 'constraint' ? 'فقط خط قرمزها' : only === 'pending' ? 'فقط پیشنهادها' : '', onlyReview ? 'فقط نیاز به بازبینی' : '', showPending ? 'با آنچه در راه است' : '', rowsBy === 'facet' ? 'ردیف‌ها: بُعد' : ''].filter(Boolean).join(' · ')}</span>}
          {mode === 'thinking' && p.onPreviewTruth && <Button size="sm" variant="ghost" iconStart="Workflow" className="h-auto max-w-full whitespace-normal py-inset-xs text-start" onClick={p.onPreviewTruth}>اگر همه را تأیید کنم، نمای کلی حقیقت چه می‌شود؟</Button>}
        </div>
      )}
      {tip !== undefined && !stageEmpty && (
        <div role="note" data-testid="canvas-tip" className="flex items-center justify-between gap-inline-sm rounded-control border border-border-info-subtle bg-bg-info-subtle px-inset-md py-inset-xs">
          <p className="body-sm text-text-default"><b>نکته:</b> {tips[tip]}</p>
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
            aria-label={`${viewLabel}، چیدمان ${LAYOUT_FA[layoutEff]}. با کلیدهای جهت‌دار جابه‌جا شو؛ با Tab به کارت‌ها برو و با پیکان‌ها بین کارت‌ها حرکت کن. نمای «ساختار» جای بخش‌ها را نشان می‌دهد؛ اینجا رابطه‌های صریح دیده می‌شوند.`}
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
                    <span className="flex min-w-space-0 items-center gap-inline-xs"><span className={`${b.kind === 'column' ? 'label-md text-text-default' : 'label-md truncate text-text-subtle'}`} style={b.kind === 'row' ? { paddingInlineEnd: b.depth * 12 } : undefined}>{layoutEff === 'overview' && b.kind === 'row' ? '' : b.label}</span>{b.kind === 'group' && (b.count ?? 0) > 0 && <Badge intent="neutral" icon={false}>{formatNumber(b.count!)} مورد</Badge>}</span>
                  </div>
                </div>
              ))}
              {frames.map((f) => {
                const live = groupDrag?.nodeId === f.nodeId ? { dx: groupDrag.dx, dy: groupDrag.dy } : { dx: 0, dy: 0 };
                return (
                  <div key={`frame-${f.nodeId}`} data-testid="section-frame" data-frame={f.nodeId} className="pointer-events-none absolute top-space-0 start-space-0 rounded-container border border-dashed border-border-bold" style={{ transform: `translate(${f.x + live.dx}px, ${f.y + live.dy}px)`, inlineSize: f.w, blockSize: f.h }}>
                    <div dir="rtl" data-no-pan="" className="pointer-events-auto flex cursor-grab items-center justify-between gap-inline-sm px-inset-sm" style={{ blockSize: 44 }} onPointerDown={(e) => startFrameDrag(e, f)}>
                      <span className="label-md truncate text-text-subtle">{f.label} · {formatNumber(f.ids.length)}</span>
                      <IconButton icon="Ellipsis" label={`جابه‌جا کن: ${f.label}`} aria-haspopup="menu" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setFrameMenuAt({ nodeId: f.nodeId, x: r.left, y: r.bottom }); }} />
                    </div>
                  </div>
                );
              })}
              {overviewFar && <OverviewFar scene={scene} k={view.k} onZoomRow={zoomRow} onZoomRows={zoomRows} />}
              <CanvasEdges width={scene.width} height={scene.height} routed={routed} emphasized={emphasized} hasFocus={selection.length > 0 || !!selectedEdge} showAll={showAllEdges} hovered={hoverEdge} selectedEdge={selectedEdge} onHover={setHoverEdge} onSelect={(id) => { setSelectedEdge(id); setSelection([]); if (isMobile) setInspectorOpen(true); }} />
              {chipEdges.map(({ edge: e, route }) => (
                <span key={`chip-${e.id}`} data-edge-chip={e.id} className="body-sm pointer-events-none absolute top-space-0 start-space-0 whitespace-nowrap rounded-pill border border-border-bold bg-mabda-edge-chip-bg px-inset-sm text-text-default" style={{ transform: `translate(${route.mid.x}px, ${route.mid.y}px) translate(-50%, -50%)` }}>{e.label}{e.count > 1 ? ` (${formatNumber(e.count)})` : ''}</span>
              ))}
              {linkDrag && (() => { const f = byId.get(linkDrag.fromId); return f ? <svg className="pointer-events-none absolute top-space-0 start-space-0 overflow-visible" width={scene.width} height={scene.height} aria-hidden="true"><line x1={f.x + f.w / 2} y1={f.y + f.h / 2} x2={linkDrag.x} y2={linkDrag.y} className="stroke-border-selected" strokeWidth={2} strokeDasharray="6 4" /></svg> : null; })()}
              {clusters
                ? clusters.map((c) => <button key={c.id} type="button" data-no-pan="" aria-label={`${formatNumber(c.count)} مورد؛ بزرگ‌نمایی کن`} onClick={() => { setView((cur) => { const k = 0.6; return { k, x: size.w / 2 - c.x * k, y: size.h / 2 - c.y * k }; }); }} className="absolute top-space-0 start-space-0 flex items-center justify-center rounded-pill border border-border-bold bg-surface-raised label-md text-text-default" style={{ transform: `translate(${c.x - 40}px, ${c.y - 40}px)`, inlineSize: 80, blockSize: 80 }}>{formatNumber(c.count)}</button>)
                : overviewFar ? null : shown.map((i) => {
                  const inGroup = !!groupDrag && !!frames.find((f) => f.nodeId === groupDrag.nodeId)?.ids.includes(i.id);
                  const at0 = i.kind === 'note' && noteDrag?.id === i.id ? { ...i, x: noteDrag.x, y: noteDrag.y } : layout === 'free' && noteDrag?.id === i.id ? { ...i, x: noteDrag.x, y: noteDrag.y } : i;
                  const at = inGroup ? { ...at0, x: at0.x + groupDrag!.dx, y: at0.y + groupDrag!.dy } : at0;
                  const common = { lod, selected: selSet.has(i.id), dimmed: false, draggable: dragEnabled, onSelect: select, onFocus: (it: SceneItem) => reveal(it.x, it.y, it.w, it.h), onKey: onCardKey };
                  if (i.kind === 'note') {
                    return <CanvasNoteCard key={i.id} item={at} {...common} editing={editing?.id === i.id ? { text: editing.text } : undefined} onPointerDown={startDrag}
                      onEdit={(it) => setEditing({ id: it.id, text: it.summary ?? '' })} onEditText={(text) => setEditing((cur) => (cur ? { ...cur, text } : cur))}
                      onSave={async () => { if (editing && i.noteId) { await p.onUpdateNote(i.noteId, editing.text); setEditing(null); } }} onCancel={() => setEditing(null)} onConvert={(it) => setToKnowledge(it.noteId ?? null)} onDelete={(it) => it.noteId && void p.onDeleteNote(it.noteId)} />;
                  }
                  return <CanvasItemCard key={i.id} item={at} {...common} neighbour={neighbours.has(i.id)} dragging={noteDrag?.id === i.id} tint={colorFacet && i.facet ? FACET_TINT[facetNames.indexOf(i.facet) % FACET_TINT.length] : undefined}
                    dimmed={selection.length > 0 && !showAllEdges && !selSet.has(i.id) && !neighbours.has(i.id)} onOpen={(it) => { const o = it.objectId ? objectById.get(it.objectId) : undefined; if (o) p.onOpenObject(o); else if (it.kind === 'asset' || it.kind === 'assets') p.onOpenAssets(); }}
                    onContext={(it, x, y) => setCtx({ item: it, x, y })} onPointerDown={onCardDown} onLink={i.kind === 'object' ? startLink : undefined} onActions={(it) => it.objectId && setActions(it.objectId)} />;
                })}
            </div>
            {layoutEff === 'overview' && <RowRail scene={scene} view={view} size={size} opened={openedRows} onToggleRow={toggleRow} onMoveRow={moveRow} />}
            {stageEmpty && (
              <div className="pointer-events-none absolute top-space-0 bottom-space-0 start-space-0 end-space-0 flex items-center justify-center p-inset-lg">
                <div className="pointer-events-auto flex max-w-overlay-xs flex-col items-center gap-stack-sm text-center" data-no-pan="">
                  <p className="body-md text-text-default">{layout === 'free' ? 'بوم فکر خالی است؛ یادداشت‌های آزاد را اینجا بچین و از «فهرست فکرها» برای ایده‌ها و سؤال‌های باز استفاده کن.' : onlyReview ? 'چیزی نیاز به بازبینی ندارد.' : 'هنوز چیزی برای نمایش در این چیدمان نیست.'}</p>
                  <Button size="sm" variant="secondary" iconStart="Plus" onClick={layout === 'free' ? () => setNewNote({ content: '', nodeId: '', x: 0, y: 0 }) : onlyReview ? () => setOnlyReview(false) : p.onAddKnowledge}>{layout === 'free' ? 'یادداشت آزاد تازه' : onlyReview ? 'نمایش همه' : 'ثبت دانش'}</Button>
                </div>
              </div>
            )}
            {/* the minimap: whenever the canvas is larger than the window (and the window is wide enough not to hide cards), at the START-bottom corner where nothing else lives */}
            <div className="pointer-events-none absolute bottom-space-2 start-space-2 flex flex-col items-start gap-stack-xs">
              {!isMobile && size.w >= 640 && scene.items.length > 0 && (fullscreen || scene.width * view.k > size.w * 1.15 || scene.height * view.k > size.h * 1.15) && <CanvasMinimap items={scene.items} width={scene.width} height={scene.height} view={view} size={size} selected={selSet} onJump={(x, y) => setView((cur) => ({ ...cur, x: size.w / 2 - x * cur.k, y: size.h / 2 - y * cur.k }))} />}
            </div>
            {!inspectorOpen && !sheet && <div className="absolute end-space-2 top-space-2" data-no-pan=""><Button size="sm" variant="secondary" iconStart="PanelRight" onClick={() => setInspectorMode('docked')}>جزئیات</Button></div>}
            <div className="pointer-events-none absolute start-space-2 top-space-2" data-no-pan=""><span className="label-sm rounded-pill border border-border-default bg-surface-raised px-inset-sm text-text-subtle">{lod === 'far' ? 'نمای دور' : lod === 'mid' ? 'نمای متوسط' : 'نمای نزدیک'} · {formatNumber(Math.round(view.k * 100))}٪</span></div>
          </div>
          {layoutEff === 'overview' && scene.overview && (
            <div className="sr-only" data-testid="overview-text">
              <h3>خلاصهٔ ردیف‌ها</h3>
              <ul aria-label="ردیف‌ها">{scene.overview.rows.map((r) => <li key={r.nodeId}>{r.label}: {formatNumber(r.counts.knowledge)} دانش، {formatNumber(r.counts.redLines)} خط قرمز، {formatNumber(r.counts.stale)} قدیمی، {formatNumber(r.counts.openThoughts)} فکر باز</li>)}</ul>
              <ul aria-label="وابستگی‌های بین ردیف‌ها">{scene.overview.rowEdges.map((e) => <li key={e.id}>{formatNumber(e.count)} مورد از «{scene.overview!.rows.find((r) => r.nodeId === e.to)?.label}» به «{scene.overview!.rows.find((r) => r.nodeId === e.from)?.label}» وابسته است</li>)}</ul>
            </div>
          )}
          {lineage && scene.lineage && (() => {
            const t = lineageText(scene.lineage, (id) => objectById.get(id)?.title ?? id);
            return (
              <div className="mt-stack-sm grid gap-stack-sm sm:grid-cols-2" data-testid="lineage-text">
                <section aria-label="بر این‌ها تکیه دارد"><h3 className="label-md text-text-default">بر این‌ها تکیه دارد</h3>{t.rests.length ? <ul className="body-sm list-inside list-disc text-text-default">{t.rests.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="body-sm text-text-subtle">به چیزی تکیه ندارد.</p>}</section>
                <section aria-label="روی این‌ها اثر دارد"><h3 className="label-md text-text-default">روی این‌ها اثر دارد</h3>{t.affects.length ? <ul className="body-sm list-inside list-disc text-text-default">{t.affects.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="body-sm text-text-subtle">چیزی روی آن سوار نیست.</p>}</section>
                {t.ifApproved.length > 0 && <section aria-label="اگر تأیید شود" className="sm:col-span-2"><h3 className="label-md text-text-default">اگر این مورد تأیید شود، این‌ها نیاز به بازبینی می‌گیرند</h3><ul className="body-sm list-inside list-disc text-text-default">{t.ifApproved.map((x) => <li key={x}>{x}</li>)}</ul></section>}
              </div>
            );
          })()}
          {frameMenuAt && (() => {
            const f = frames.find((x) => x.nodeId === frameMenuAt.nodeId);
            if (!f) return null;
            return (
              <div role="menu" aria-label={`جابه‌جا کردن بخش ${f.label}`} data-testid="frame-menu" className="fixed z-dialog flex min-w-overlay-xs flex-col rounded-control border border-border-default bg-surface-overlay p-inset-xs shadow-raised" style={{ insetBlockStart: frameMenuAt.y, insetInlineStart: frameMenuAt.x }} onKeyDown={(e) => { if (e.key === 'Escape') setFrameMenuAt(null); }}>
                {frameMenu(f).filter((m) => 'label' in m).map((m) => <button key={(m as { label: string }).label} type="button" role="menuitem" autoFocus={(m as { label: string }).label.startsWith('ببر سمت راست')} className="body-sm rounded-control-sm px-inset-sm py-inset-sm text-start text-text-default hover:bg-bg-neutral-subtle" style={{ minBlockSize: 44 }} onClick={() => { setFrameMenuAt(null); (m as { onSelect: () => void }).onSelect(); box.current?.focus({ preventScroll: true }); }}>{(m as { label: string }).label}</button>)}
              </div>
            );
          })()}
          {ctx && (
            <div role="menu" aria-label="منوی کارت" className="fixed z-dialog flex min-w-overlay-xs flex-col rounded-control border border-border-default bg-surface-overlay p-inset-xs shadow-raised" style={{ insetBlockStart: ctx.y, insetInlineStart: ctx.x }} onKeyDown={(e) => { if (e.key === 'Escape') setCtx(null); }}>
              {([
                ['انتخاب و روشن کردن اثرگذارها', () => select(ctx.item.id)],
                ...(layoutEff === 'free' && (ctx.item.noteId || ctx.item.objectId) ? [['جابه‌جا کن به بخش…', () => setMoveTo({ noteId: ctx.item.noteId, objectId: ctx.item.objectId, itemId: ctx.item.id, nodeId: ctx.item.nodeId ?? '' })]] as Array<[string, () => void]> : []),
                ...(ctx.item.objectId && mode === 'truth' ? [['دور این مورد', () => enterLineage(ctx.item.objectId!)]] as Array<[string, () => void]> : []),
                ...(ctx.item.objectId ? [['باز کردن', () => { const o = objectById.get(ctx.item.objectId!); if (o) p.onOpenObject(o); }], ['انتقال و اتصال', () => setActions(ctx.item.objectId!)], ...(mode === 'thinking' ? [[placedIds.has(ctx.item.objectId) ? 'از بوم فکر بردار' : 'بگذار در بوم فکر', () => { const id = ctx.item.objectId!; if (placedIds.has(id)) void p.onUnplaceObject(id); else { void p.onPlaceObject(id, 40, 40); setLayout('free'); } }]] : [])] as Array<[string, () => void]> : []),
                ...(ctx.item.kind === 'note' && ctx.item.noteId ? [['تبدیل به قلم دانش', () => setToKnowledge(ctx.item.noteId!)], ...(p.onNoteToSection ? [['ساخت بخش از این فکر', () => p.onNoteToSection!(ctx.item.noteId!)]] : [])] as Array<[string, () => void]> : []),
              ] as Array<[string, () => void]>).map(([label, fn]) => <button key={label} type="button" role="menuitem" autoFocus={label.startsWith('انتخاب')} className="body-sm rounded-control-sm px-inset-sm py-inset-sm text-start text-text-default hover:bg-bg-neutral-subtle" onClick={() => { setCtx(null); fn(); }}>{label}</button>)}
            </div>
          )}
          {inspectorOpen && floating && inspector}
        </div>
        {inspectorOpen && !sheet && !floating && inspector}
      </div>
      {sheet && inspectorOpen && inspector}
      {sheet && toolbar}

      <input ref={fileInput} type="file" accept=".canvas,application/json" className="sr-only" aria-label="انتخاب فایل بوم" tabIndex={-1} onChange={(e) => void importCanvas(e.target.files?.[0])} />

      {mode === 'thinking' && (
        <Dialog open={anchorOpen} onClose={() => setAnchorOpen(false)} size="sm" title="کارت حقیقت را کنار فکرها بیاور"
          description="همان کارتِ منبع حقیقت است، نه کپی؛ اینجا فقط جایش را عوض می‌کنی و متنش از اینجا ویرایش نمی‌شود."
          footer={<><Button variant="ghost" onClick={() => setAnchorOpen(false)}>انصراف</Button><Button variant="primary" disabled={!anchorId} onClick={() => { void p.onPlaceObject(anchorId, 40 + (placedIds.size % 4) * 260, 40 + Math.floor(placedIds.size / 4) * 150); setLayout('free'); setAnchorOpen(false); }}>بگذار روی بوم فکر</Button></>}>
          <Select label="کدام کارت؟" value={anchorId} onChange={(e) => setAnchorId(e.target.value)} options={[{ value: '', label: 'یکی را انتخاب کن' }, ...placeable(p.objects.filter((o) => o.status === 'Confirmed' && !o.sample), p.canvas.free).map((o) => ({ value: o.id, label: o.title }))]} />
        </Dialog>
      )}

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} size="sm" title="میان‌برهای بوم">
        <dl className="flex flex-col gap-stack-sm">{SHORTCUTS.map(([k, v]) => <div key={k} className="flex items-start justify-between gap-inline-md"><dt className="label-md text-text-default"><kbd>{k}</kbd></dt><dd className="body-sm text-text-subtle">{v}</dd></div>)}</dl>
      </Dialog>

      <Dialog open={!!activeObj && !!activeItem} onClose={() => setActions(null)} size="sm" title={`انتقال و اتصال: ${activeObj?.title ?? ''}`}>
        {activeObj && (
          <div className="flex flex-col gap-stack-md">
            {(
              <div className="flex flex-col gap-stack-xs">
                <span className="label-md text-text-default">وضعیت</span>
                <div className="flex flex-wrap gap-inline-xs">{LANES.map((l) => <Button key={l} size="sm" variant="secondary" disabled={(activeItem?.lane ?? (activeObj.status === 'Confirmed' ? 'confirmed' : 'thinking')) === l} onClick={() => { setActions(null); void request({ objectId: activeObj.id, lane: l }); }}>{LANE_FA[l]}</Button>)}</div>
              </div>
            )}
            <Select label="انتقال به گره" value={activeObj.nodeId} onChange={(e) => { setActions(null); void request({ objectId: activeObj.id, lane: activeItem?.lane ?? (activeObj.status === 'Confirmed' ? 'confirmed' : 'thinking'), nodeId: e.target.value }); }} options={p.nodes.map((n) => ({ value: n.id, label: n.label }))} />
            <div className="flex flex-wrap gap-inline-xs">
              <Button size="sm" variant="secondary" iconStart="Link2" onClick={() => { setActions(null); setConnectMode(true); setConnectFrom(activeObj.id); setSelection([`o:${activeObj.id}`]); }}>وصل کن</Button>
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

      <ConnectDialog open={!!connect} from={connect ? objectById.get(connect.fromId)?.title : undefined} to={connect ? objectById.get(connect.toId)?.title : undefined} options={connectOpts} busy={busy} onClose={() => { setConnect(null); setConnectFrom(null); }} onConfirm={(o, why) => void confirmConnect(o, why)} />

      <Dialog open={!!frameDlg} onClose={() => setFrameDlg(null)} size="sm" title="جابه‌جا کردن یک بخش" description="همهٔ کارت‌ها و فکرهای آن بخش با هم جابه‌جا می‌شوند؛ با «برگرداندن» برمی‌گردد.">
        {frameDlg && (() => {
          const f = frames.find((x) => x.nodeId === frameDlg);
          if (!f) return null;
          return (
            <div className="flex flex-col gap-stack-md" data-testid="frame-dialog">
              <Select label="کدام بخش؟" value={frameDlg} onChange={(e) => setFrameDlg(e.target.value)} options={frames.map((x) => ({ value: x.nodeId, label: x.label }))} />
              <div className="grid grid-cols-2 gap-inline-sm">
                <Button variant="secondary" onClick={() => moveFrame(f, 160, 0)}>سمت راست</Button>
                <Button variant="secondary" onClick={() => moveFrame(f, -160, 0)}>سمت چپ</Button>
                <Button variant="secondary" onClick={() => moveFrame(f, 0, -120)}>بالاتر</Button>
                <Button variant="secondary" onClick={() => moveFrame(f, 0, 120)}>پایین‌تر</Button>
              </div>
              {frames.length > 1 && <Select label="کنار این بخش بگذار" value="" onChange={(e) => { const o = frames.find((x) => x.nodeId === e.target.value); if (o) { const d = beside(f, o); moveFrame(f, d.dx, d.dy); } }} options={[{ value: '', label: 'یکی را انتخاب کن' }, ...frames.filter((x) => x.nodeId !== f.nodeId).map((x) => ({ value: x.nodeId, label: x.label }))]} />}
            </div>
          );
        })()}
      </Dialog>

      <Dialog open={!!moveTo} onClose={() => setMoveTo(null)} size="sm" title="جابه‌جا کن به بخش…" description="فقط بخشِ این مورد عوض می‌شود؛ جایش روی بوم همان می‌ماند. با «برگرداندن» برمی‌گردد."
        footer={<><Button variant="ghost" onClick={() => setMoveTo(null)}>انصراف</Button><Button variant="primary" disabled={!moveTo?.nodeId || moveTo.nodeId === byId.get(moveTo.itemId)?.nodeId} loading={busy} onClick={async () => { const it = moveTo && byId.get(moveTo.itemId); if (moveTo && it) { await changeSection(it, moveTo.nodeId); setMoveTo(null); } }}>جابه‌جا کن</Button></>}>
        {moveTo && <Select label="بخش" value={moveTo.nodeId} onChange={(e) => setMoveTo({ ...moveTo, nodeId: e.target.value })} options={p.nodes.map((n) => ({ value: n.id, label: n.label }))} />}
      </Dialog>

      <Dialog open={!!newNote} onClose={() => setNewNote(null)} size="sm" title="یادداشت آزاد روی بوم"
        footer={<><Button variant="ghost" onClick={() => setNewNote(null)}>انصراف</Button><Button variant="primary" disabled={!newNote?.content.trim()} loading={busy} onClick={async () => { if (!newNote) return; setBusy(true); try { await p.onCreateNote({ content: newNote.content.trim(), x: newNote.x, y: newNote.y, nodeId: newNote.nodeId }); setNewNote(null); setLayout('free'); } finally { setBusy(false); } }}>ذخیره</Button></>}>
        {newNote && (
          <div className="flex flex-col gap-stack-md">
            <Textarea label="یادداشت خام" rows={4} value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })} hint="این یادداشت در فهرست فکرها نمی‌آید و به AI داده نمی‌شود. برای ایده، سؤال یا فرض باز از «فکر تازه» استفاده کن." />
            <Select label="به کدام گره مربوط است؟" value={newNote.nodeId} onChange={(e) => setNewNote({ ...newNote, nodeId: e.target.value })} options={p.nodes.map((n) => ({ value: n.id, label: n.label }))} />
          </div>
        )}
      </Dialog>

      <Dialog open={!!toKnowledge} onClose={() => setToKnowledge(null)} size="sm" title="تبدیل به قلم دانش">
        {toKnowledge && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">یک قلم «پیشنهادی» ساخته می‌شود؛ تا تأیید نکنی واقعیت نیست. یادداشت سر جایش می‌ماند.</p>
            <div className="flex flex-wrap gap-inline-xs">{([['Fact', 'واقعیت'], ['Decision', 'تصمیم'], ['Constraint', 'خط قرمز']] as const).map(([t, label]) => <Button key={t} size="sm" variant="secondary" onClick={async () => { const id = toKnowledge; setToKnowledge(null); await p.onNoteToKnowledge(id, t); }}>{label}</Button>)}</div>
          </div>
        )}
      </Dialog>
    </div>
  );
  // full screen is an in-app layer rendered at the end of <body>: no ancestor can clip it or change what «fixed» means
  return fullscreen ? createPortal(body, document.body) : body;
};
