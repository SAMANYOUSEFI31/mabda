/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { ContextObject, ContextRelationship, Note, TreeNode } from '../types';
import type { CanvasItem } from '../types/state';
import { buildCanvasModel, CARD_H, CARD_W, dropTarget, LANE_FA, LANES, moveEffect, visibleCards } from '../core/canvasModel';
import type { CanvasCard, DropTarget, Lane } from '../core/canvasModel';
import { fromJsonCanvas, toJsonCanvas } from '../core/jsonCanvas';
import type { MapEdge, MapVertex } from '../core/mapModel';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Icon, IconButton, RadioGroup, Select, TextField, Textarea, TypeBadge, formatNumber, useToast } from '../ui';
import { EdgesLayer } from './ContextMapView';
import { usePanZoom } from './usePanZoom';

export interface MovePayload { objectId: string; lane: Lane; nodeId?: string; beforeId?: string; afterId?: string; reason?: string; confirmBackward?: boolean }
interface Props {
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  notes: Note[];
  /** declared positions: decision-board ranks and free-note x/y */
  canvas: { decisions: CanvasItem[]; free: CanvasItem[] };
  /** objects that need a review because a dependency changed (derived) */
  reviewIds: Set<string>;
  onMove: (m: MovePayload) => Promise<void>;
  onConnect: (c: { fromId: string; toId: string; type: 'depends_on' | 'supersedes'; reason?: string; confirmed?: boolean }) => Promise<void>;
  onCreateNote: (n: { content: string; x: number; y: number; nodeId?: string }) => Promise<void>;
  onMoveNote: (id: string, x: number, y: number) => void;
  onUpdateNote: (id: string, content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onNoteToKnowledge: (id: string, type: 'Fact' | 'Decision' | 'Constraint') => Promise<void>;
  onAutoLayout: () => Promise<void>;
  onOpenObject: (o: ContextObject) => void;
}

const HEAD = 44; // lane headers sit above the rows
const FREE_GAP = 72;
const NOTE_W = 220;
const NOTE_H = 120;
const MAX_EDGES = 800;

type Pending =
  | { kind: 'accept'; payload: MovePayload; title: string }
  | { kind: 'backward'; payload: MovePayload; title: string; toLane: Lane }
  | null;

/** The editable board. The card's column is its status, its row its node, its order a stored priority — see core/canvasModel. */
export const ContextCanvasView: React.FC<Props> = (p) => {
  const toast = useToast();
  const { nodes, objects, relationships, notes, canvas, reviewIds } = p;
  const ranks = useMemo(() => new Map(canvas.decisions.filter((i) => i.rank !== undefined).map((i) => [i.itemRef.slice(4), i.rank!])), [canvas.decisions]);
  const model = useMemo(() => buildCanvasModel({ nodes, objects, reviewIds, ranks }), [nodes, objects, reviewIds, ranks]);
  const byObject = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);

  // free-thinking zone: below the board
  const freeTop = HEAD + model.height + FREE_GAP;
  const freeNotes = useMemo(() => canvas.free.map((i) => ({ item: i, note: notes.find((n) => `note:${n.id}` === i.itemRef) })).filter((x): x is { item: CanvasItem; note: Note } => !!x.note), [canvas.free, notes]);
  const freeW = Math.max(model.width, ...freeNotes.map((n) => (n.item.x ?? 0) + NOTE_W + 40));
  const freeH = Math.max(260, ...freeNotes.map((n) => (n.item.y ?? 0) + NOTE_H + 60));
  const content = { width: freeW, height: freeTop + freeH };
  const shapeKey = `${model.cards.length}:${Math.round(model.height)}:${freeNotes.length}`;
  const { box, view, size, fit, zoomAt, reveal, toStage, handlers } = usePanZoom(content, shapeKey, 1);

  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target?: DropTarget } | null>(null);
  const [linkDrag, setLinkDrag] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [actions, setActions] = useState<string | null>(null); // object id whose actions dialog is open
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [connect, setConnect] = useState<{ fromId: string; toId: string; type: 'depends_on' | 'supersedes'; reason: string } | null>(null);
  const [newNote, setNewNote] = useState<{ content: string; nodeId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toKnowledge, setToKnowledge] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // cull to the viewport (snapped, so panning does not re-render the cards)
  const SNAP = 160;
  const gx = Math.floor(-view.x / view.k / SNAP), gy = Math.floor(-view.y / view.k / SNAP);
  const gw = Math.ceil(size.w / view.k / SNAP) + 1, gh = Math.ceil(size.h / view.k / SNAP) + 1;
  const shown = useMemo(() => visibleCards(model, { x: gx * SNAP, y: gy * SNAP - HEAD, w: gw * SNAP, h: gh * SNAP }, SNAP), [model, gx, gy, gw, gh]);
  const shownRows = useMemo(() => model.rows.filter((r) => r.y + r.h + HEAD >= gy * SNAP - SNAP && r.y + HEAD <= (gy + gh) * SNAP + SNAP), [model.rows, gy, gh]);
  const shownIds = useMemo(() => new Set(shown.map((c) => c.id)), [shown]);

  // depends_on lines between cards that are on the board (display of real Relations)
  const edgeData = useMemo(() => {
    const cards = new Map(model.cards.map((c) => [c.objectId, c]));
    const vertices = new Map<string, MapVertex>();
    const edges: MapEdge[] = [];
    for (const r of relationships) {
      if (r.type !== 'depends_on') continue;
      const a = cards.get(r.sourceId), b = cards.get(r.targetId);
      if (!a || !b || (!shownIds.has(a.id) && !shownIds.has(b.id))) continue;
      for (const c of [a, b]) vertices.set(c.id, { id: c.id, kind: 'object', label: '', layer: 0, row: 0, x: c.x, y: c.y + HEAD, w: c.w, h: c.h });
      edges.push({ id: `d|${a.id}|${b.id}`, from: a.id, to: b.id, kind: 'dependency', label: 'وابسته به', count: 1 });
      if (edges.length >= MAX_EDGES) break;
    }
    return { vertices, edges };
  }, [model.cards, relationships, shownIds]);

  const cellOf = useCallback((c: CanvasCard) => model.cells.get(`${c.lane}|${c.nodeId}`) ?? [], [model.cells]);

  const request = useCallback(async (payload: MovePayload) => {
    const o = byObject.get(payload.objectId);
    if (!o) return;
    const eff = moveEffect(o, reviewIds, payload.lane, payload.nodeId ?? o.nodeId);
    if (eff.needsConfirm) { setReason(''); setPending({ kind: 'backward', payload, title: o.title, toLane: payload.lane }); return; }
    if (eff.kind === 'accept') { setReason(''); setPending({ kind: 'accept', payload, title: o.title }); return; }
    setBusy(true);
    try { await p.onMove(payload); } finally { setBusy(false); }
  }, [byObject, reviewIds, p]);

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await p.onMove({ ...pending.payload, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(pending.kind === 'backward' ? { confirmBackward: true } : {}) });
      setPending(null);
    } finally { setBusy(false); }
  };

  // ── dragging a card (mouse / pen; touch uses the actions dialog instead) ──
  const startDrag = (e: React.PointerEvent, card: CanvasCard) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const origin = toStage(e.clientX, e.clientY);
    const grab = { x: origin.x - card.x, y: origin.y - (card.y + HEAD) };
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      moved = true;
      const s = toStage(ev.clientX, ev.clientY);
      setDrag({ id: card.objectId, x: s.x - grab.x, y: s.y - grab.y, target: dropTarget(model, s.x, s.y - HEAD, card.objectId) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!moved) { const o = byObject.get(card.objectId); if (o) p.onOpenObject(o); return; }
      const s = toStage(ev.clientX, ev.clientY);
      const t = dropTarget(model, s.x, s.y - HEAD, card.objectId);
      if (t) void request({ objectId: card.objectId, lane: t.lane, nodeId: t.nodeId, beforeId: t.before?.objectId, afterId: t.after?.objectId });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── dragging a line out of a card's link handle onto another card ──
  const startLink = (e: React.PointerEvent, card: CanvasCard) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    const move = (ev: PointerEvent) => { const s = toStage(ev.clientX, ev.clientY); setLinkDrag({ fromId: card.objectId, x: s.x, y: s.y }); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLinkDrag(null);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-object-id]');
      const toId = el?.dataset.objectId;
      if (toId && toId !== card.objectId) setConnect({ fromId: card.objectId, toId, type: 'depends_on', reason: '' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const moveBy = (card: CanvasCard, dir: -1 | 1) => {
    const list = cellOf(card);
    const i = list.findIndex((c) => c.objectId === card.objectId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const others = list.filter((c) => c.objectId !== card.objectId);
    // after removing the card, it goes to slot j
    void request({ objectId: card.objectId, lane: card.lane, beforeId: others[j - 1]?.objectId, afterId: others[j]?.objectId });
  };

  // ── free-thinking zone ──
  const dragNote = (e: React.PointerEvent, id: string, at: { x: number; y: number }) => {
    if (e.pointerType === 'touch') return;
    if ((e.target as HTMLElement).closest('button, textarea')) return;
    e.stopPropagation();
    const origin = toStage(e.clientX, e.clientY);
    const grab = { x: origin.x - at.x, y: origin.y - (at.y + freeTop) };
    const move = (ev: PointerEvent) => { const s = toStage(ev.clientX, ev.clientY); setNoteDrag({ id, x: s.x - grab.x, y: s.y - grab.y - freeTop }); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const s = toStage(ev.clientX, ev.clientY);
      setNoteDrag(null);
      p.onMoveNote(id, Math.max(0, Math.round(s.x - grab.x)), Math.max(0, Math.round(s.y - grab.y - freeTop)));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const [noteDrag, setNoteDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const placeNewNote = () => {
    const spot = freeNotes.length;
    return { x: (spot % 4) * 260, y: Math.floor(spot / 4) * 150 };
  };

  const exportCanvas = () => {
    const cards = [
      ...model.cards.map((c) => { const o = byObject.get(c.objectId)!; return { id: c.id, text: `${o.title}\n${o.content}`, x: c.x, y: c.y + HEAD, w: c.w, h: c.h }; }),
      ...freeNotes.map(({ item, note }) => ({ id: item.itemRef, text: note.content, x: item.x ?? 0, y: freeTop + (item.y ?? 0), w: NOTE_W, h: NOTE_H })),
    ];
    const ids = new Set(cards.map((c) => c.id));
    const links = relationships.filter((r) => r.type === 'depends_on' && ids.has(`o:${r.sourceId}`) && ids.has(`o:${r.targetId}`)).map((r) => ({ id: r.id, from: `o:${r.sourceId}`, to: `o:${r.targetId}`, label: 'وابسته به' }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(toJsonCanvas(cards, links), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'mabda.canvas'; a.click();
    URL.revokeObjectURL(url);
  };
  const importCanvas = async (file?: File) => {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = '';
    try {
      const r = fromJsonCanvas(await file.text());
      for (const c of r.cards) await p.onCreateNote({ content: c.text, x: Math.max(0, Math.round(c.x)), y: Math.max(0, Math.round(c.y)) });
      toast.show({ intent: 'success', message: `${formatNumber(r.cards.length)} یادداشت در ناحیهٔ فکر آزاد گذاشته شد${r.skipped ? ` (${formatNumber(r.skipped)} مورد از نوع دیگر کنار ماند)` : ''}. هیچ‌کدام دانش نیستند تا خودت تبدیلشان کنی.` });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof Error ? e.message : 'ورود فایل ناموفق بود.' }); }
  };

  const activeCard = actions ? model.cards.find((c) => c.objectId === actions) : undefined;
  const activeObj = actions ? byObject.get(actions) : undefined;

  if (model.cards.length === 0 && freeNotes.length === 0) {
    return (
      <EmptyState
        icon="Workflow"
        title="بوم هنوز خالی است"
        description="هر دانشی که ثبت کنی در ستون وضعیتش می‌نشیند؛ فکرهای نیمه‌کاره را هم می‌توانی در ناحیهٔ فکر آزاد بگذاری."
        action={<Button variant="secondary" iconStart="Plus" onClick={() => setNewNote({ content: '', nodeId: 'business' })}>یادداشت تازه</Button>}
      />
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-stack-md" aria-label="بوم تصمیم‌ها">
      <div className="flex flex-wrap items-center justify-between gap-inline-md">
        <p className="body-sm text-text-subtle">ستون = وضعیت · ردیف = گره · ترتیب = اولویت. کارت را بکش یا از «⋯» منوی انتقال را باز کن. کشیدن «در فکر» به «تأییدشده» یعنی تأیید.</p>
        <div className="flex flex-wrap items-center gap-inline-xs">
          <Button size="sm" variant="secondary" iconStart="Plus" onClick={() => setNewNote({ content: '', nodeId: 'business' })}>یادداشت تازه</Button>
          <Button size="sm" variant="secondary" iconStart="Wand2" loading={busy} onClick={async () => { setBusy(true); try { await p.onAutoLayout(); } finally { setBusy(false); } }}>چیدمان خودکار</Button>
          <Button size="sm" variant="ghost" iconStart="Download" onClick={exportCanvas}>خروجی JSON Canvas</Button>
          <Button size="sm" variant="ghost" iconStart="Upload" onClick={() => fileInput.current?.click()}>ورود JSON Canvas</Button>
          <input ref={fileInput} type="file" accept=".canvas,application/json" className="sr-only" aria-label="انتخاب فایل بوم" tabIndex={-1} onChange={(e) => void importCanvas(e.target.files?.[0])} />
          <IconButton icon="ZoomOut" label="کوچک‌نمایی" onClick={() => zoomAt(1 / 1.25)} />
          <IconButton icon="ZoomIn" label="بزرگ‌نمایی" onClick={() => zoomAt(1.25)} />
          <IconButton icon="Maximize" label="جا دادن در صفحه" onClick={fit} />
        </div>
      </div>

      <div
        ref={box}
        dir="ltr"
        tabIndex={0}
        role="application"
        aria-label="بوم تصمیم‌ها. با کلیدهای جهت‌دار جابه‌جا شو؛ با Tab بین کارت‌ها برو و از دکمهٔ «انتقال» هر اقدام را بدون کشیدن انجام بده."
        {...handlers}
        className="relative touch-none select-none overflow-hidden rounded-control border border-border-default bg-surface-sunken"
        style={{ blockSize: '68vh', minBlockSize: 380 }}
      >
        <div className="absolute top-space-0 start-space-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0', willChange: 'transform', inlineSize: content.width, blockSize: content.height }}>
          {model.lanes.map((b) => (
            <div key={b.lane} className="absolute top-space-0 start-space-0 flex items-center justify-center rounded-control-sm border border-border-default bg-surface-raised label-md text-text-default" style={{ transform: `translate(${b.x}px, 0)`, inlineSize: b.w, blockSize: HEAD - 8 }}>
              <span dir="rtl">{LANE_FA[b.lane]}</span>
            </div>
          ))}
          {shownRows.map((r) => (
            <div key={r.nodeId} className="absolute top-space-0 start-space-0 rounded-control-sm border border-border-subtle bg-surface-raised/40" style={{ transform: `translate(0, ${r.y + HEAD}px)`, inlineSize: model.width, blockSize: r.h }}>
              <span dir="rtl" className="block label-md px-inset-sm text-text-subtle" style={{ paddingInlineEnd: 12 + r.depth * 12 }}>{r.label}</span>
              {model.lanes.map((b) => {
                const hot = drag?.target && drag.target.lane === b.lane && drag.target.nodeId === r.nodeId;
                return hot ? <div key={b.lane} aria-hidden="true" className="absolute top-space-0 start-space-0 rounded-control-sm border-2 border-dashed border-border-selected bg-bg-selected/40" style={{ transform: `translate(${b.x}px, 0)`, inlineSize: b.w, blockSize: r.h }} /> : null;
              })}
            </div>
          ))}
          <EdgesLayer width={content.width} height={content.height} edges={edgeData.edges} byId={edgeData.vertices} dim={false} selected={null} />
          {linkDrag && (() => {
            const from = model.cards.find((c) => c.objectId === linkDrag.fromId);
            return from ? <svg className="pointer-events-none absolute top-space-0 start-space-0 overflow-visible" width={content.width} height={content.height} aria-hidden="true"><line x1={from.x + from.w / 2} y1={from.y + HEAD + from.h / 2} x2={linkDrag.x} y2={linkDrag.y} strokeWidth={2} strokeDasharray="6 4" className="stroke-border-selected" /></svg> : null;
          })()}
          {shown.map((c) => {
            const o = byObject.get(c.objectId)!;
            return (
              <BoardCard
                key={c.id}
                card={c}
                object={o}
                dragging={drag?.id === c.objectId}
                onPointerDown={(e) => startDrag(e, c)}
                onLink={(e) => startLink(e, c)}
                onActions={() => setActions(c.objectId)}
                onOpen={() => p.onOpenObject(o)}
                onFocus={() => reveal(c.x, c.y + HEAD, c.w, c.h)}
              />
            );
          })}
          {drag && (() => {
            const o = byObject.get(drag.id);
            const c = model.cards.find((x) => x.objectId === drag.id);
            return o && c ? <div className="pointer-events-none absolute top-space-0 start-space-0 opacity-90" style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}><BoardCard card={c} object={o} ghost /></div> : null;
          })()}

          <div className="absolute top-space-0 start-space-0 rounded-control-sm border border-dashed border-border-bold" style={{ transform: `translate(0, ${freeTop - 36}px)`, inlineSize: freeW, blockSize: freeH + 36 }}>
            <span dir="rtl" className="block label-md px-inset-md text-text-subtle">ناحیهٔ فکر آزاد — یادداشت‌ها هرگز دانش نیستند و به هوش مصنوعی داده نمی‌شوند.</span>
          </div>
          {freeNotes.map(({ item, note }) => {
            const at = noteDrag?.id === note.id ? { x: noteDrag.x, y: noteDrag.y } : { x: item.x ?? 0, y: item.y ?? 0 };
            return (
              <div
                key={note.id}
                tabIndex={0}
                data-no-pan=""
                onFocus={() => reveal(at.x, freeTop + at.y, NOTE_W, NOTE_H)}
                aria-label={`یادداشت آزاد: ${note.content.slice(0, 40)}. با کلیدهای جهت‌دار جابه‌جا می‌شود.`}
                onPointerDown={(e) => dragNote(e, note.id, { x: item.x ?? 0, y: item.y ?? 0 })}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 96 : 24;
                  const d: Record<string, [number, number]> = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowUp: [0, -step] }; // check:design-ignore (key names)
                  if (!d[e.key] || (e.target as HTMLElement).closest('textarea')) return;
                  e.preventDefault(); e.stopPropagation();
                  p.onMoveNote(note.id, Math.max(0, (item.x ?? 0) + d[e.key][0]), Math.max(0, (item.y ?? 0) + d[e.key][1]));
                }}
                className="canvas-card absolute top-space-0 start-space-0 overflow-hidden rounded-control border border-border-default bg-bg-warning-subtle p-inset-sm"
                style={{ transform: `translate(${at.x}px, ${freeTop + at.y}px)`, inlineSize: NOTE_W, blockSize: NOTE_H }}
              >
                <div dir="rtl" className="flex h-full flex-col gap-stack-xs">
                {editing?.id === note.id ? (
                  <>
                    <textarea aria-label="متن یادداشت" value={editing.text} onChange={(e) => setEditing({ id: note.id, text: e.target.value })} className="body-sm min-h-space-0 flex-1 resize-none rounded-control-sm border border-border-input bg-bg-input p-inset-xs text-text-default" />
                    <span className="flex gap-inline-xs"><Button size="sm" variant="secondary" onClick={async () => { await p.onUpdateNote(note.id, editing.text); setEditing(null); }}>ذخیره</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>انصراف</Button></span>
                  </>
                ) : (
                  <>
                    <p className="body-sm line-clamp-3 flex-1 whitespace-pre-wrap text-text-default">{note.content}</p>
                    <span className="flex flex-wrap gap-inline-xs">
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: note.id, text: note.content })}>ویرایش</Button>
                      <Button size="sm" variant="secondary" onClick={() => setToKnowledge(note.id)}>تبدیل به قلم دانش</Button>
                      <IconButton icon="Trash2" label="حذف یادداشت" size="sm" onClick={() => void p.onDeleteNote(note.id)} />
                    </span>
                  </>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* actions of one card: the keyboard / touch equivalent of dragging and of drawing a line */}
      <Dialog open={!!activeObj && !!activeCard} onClose={() => setActions(null)} size="sm" title={`انتقال و اتصال: ${activeObj?.title ?? ''}`}>
        {activeObj && activeCard && (
          <div className="flex flex-col gap-stack-md">
            <div className="flex flex-col gap-stack-xs">
              <span className="label-md text-text-default">انتقال به ستون</span>
              <div className="flex flex-wrap gap-inline-xs">
                {LANES.map((l) => <Button key={l} size="sm" variant="secondary" disabled={l === activeCard.lane} onClick={() => { setActions(null); void request({ objectId: activeObj.id, lane: l }); }}>{LANE_FA[l]}</Button>)}
              </div>
            </div>
            <div className="flex flex-wrap gap-inline-xs">
              <Button size="sm" variant="secondary" disabled={cellOf(activeCard)[0]?.objectId === activeObj.id} onClick={() => { setActions(null); moveBy(activeCard, -1); }}>اولویت بالاتر</Button>
              <Button size="sm" variant="secondary" disabled={cellOf(activeCard).at(-1)?.objectId === activeObj.id} onClick={() => { setActions(null); moveBy(activeCard, 1); }}>اولویت پایین‌تر</Button>
            </div>
            <Select label="انتقال به گره" value={activeObj.nodeId} onChange={(e) => { setActions(null); void request({ objectId: activeObj.id, lane: activeCard.lane, nodeId: e.target.value }); }} options={nodes.map((n) => ({ value: n.id, label: n.label }))} />
            <div className="flex flex-wrap gap-inline-xs">
              <Button size="sm" variant="secondary" iconStart="Link2" onClick={() => { setActions(null); setConnect({ fromId: activeObj.id, toId: objects.find((o) => o.id !== activeObj.id && model.cards.some((c) => c.objectId === o.id))?.id ?? '', type: 'depends_on', reason: '' }); }}>وصل کن به…</Button>
              <Button size="sm" variant="ghost" onClick={() => { setActions(null); p.onOpenObject(activeObj); }}>باز کردن</Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        size="sm"
        title={pending?.kind === 'accept' ? 'تأیید این مورد؟' : 'برگرداندن مورد تأییدشده'}
        footer={<><Button variant="ghost" onClick={() => setPending(null)}>انصراف</Button><Button variant="primary" loading={busy} onClick={confirmPending}>{pending?.kind === 'accept' ? 'تأیید' : 'برگردان'}</Button></>}
      >
        {pending && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">
              {pending.kind === 'accept' ? `«${pending.title}» واقعیت می‌شود و در بستهٔ دانش و خروجی‌های بعدی استفاده می‌شود.` : `«${pending.title}» دیگر واقعیت نیست و ${pending.toLane === 'thinking' ? 'به «در فکر» برمی‌گردد' : 'نیاز به بازبینی پیدا می‌کند'}. خروجی‌هایی که از آن ساخته شده‌اند هم نیاز به بازبینی می‌گیرند.`}
            </p>
            <TextField label="دلیل (اختیاری)" hint="در تاریخچهٔ تغییرها ثبت می‌شود، نه در متن." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!connect}
        onClose={() => setConnect(null)}
        size="sm"
        title="ساخت اتصال"
        footer={<><Button variant="ghost" onClick={() => setConnect(null)}>انصراف</Button><Button variant="primary" disabled={!connect?.toId} loading={busy} onClick={async () => {
          if (!connect) return;
          setBusy(true);
          try { await p.onConnect({ fromId: connect.fromId, toId: connect.toId, type: connect.type, ...(connect.reason.trim() ? { reason: connect.reason.trim() } : {}), ...(connect.type === 'supersedes' ? { confirmed: true } : {}) }); setConnect(null); } finally { setBusy(false); }
        }}>ساخت</Button></>}
      >
        {connect && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">«{byObject.get(connect.fromId)?.title}»</p>
            <RadioGroup legend="این مورد…" value={connect.type} onChange={(v) => setConnect({ ...connect, type: v as 'depends_on' | 'supersedes' })} options={[{ value: 'depends_on', label: 'وابسته است به' }, { value: 'supersedes', label: 'جایگزین می‌کند' }]} />
            <Select label="این مورد" value={connect.toId} onChange={(e) => setConnect({ ...connect, toId: e.target.value })} options={[{ value: '', label: 'انتخاب کن…' }, ...objects.filter((o) => o.id !== connect.fromId && (o.status === 'Confirmed' || o.status === 'Proposed' || o.status === 'Needs Review')).map((o) => ({ value: o.id, label: o.title }))]} />
            {connect.type === 'supersedes' && <Alert intent="warning">مورد دوم «جایگزین‌شده» می‌شود (حذف نمی‌شود و در تاریخچه می‌ماند) و خروجی‌های ساخته‌شده از آن نیاز به بازبینی پیدا می‌کنند.</Alert>}
            <TextField label="دلیل (اختیاری)" value={connect.reason} onChange={(e) => setConnect({ ...connect, reason: e.target.value })} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!newNote}
        onClose={() => setNewNote(null)}
        size="sm"
        title="یادداشت تازه در ناحیهٔ فکر آزاد"
        footer={<><Button variant="ghost" onClick={() => setNewNote(null)}>انصراف</Button><Button variant="primary" disabled={!newNote?.content.trim()} loading={busy} onClick={async () => { if (!newNote) return; setBusy(true); try { await p.onCreateNote({ content: newNote.content, nodeId: newNote.nodeId, ...placeNewNote() }); setNewNote(null); } finally { setBusy(false); } }}>ثبت یادداشت</Button></>}
      >
        {newNote && (
          <div className="flex flex-col gap-stack-md">
            <Textarea label="فکر خام" rows={4} value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })} hint="این فقط یادداشت است؛ تا تبدیلش نکنی دانش نیست و به هیچ AI داده نمی‌شود." />
            <Select label="به کدام گره مربوط است؟" value={newNote.nodeId} onChange={(e) => setNewNote({ ...newNote, nodeId: e.target.value })} options={nodes.map((n) => ({ value: n.id, label: n.label }))} />
          </div>
        )}
      </Dialog>

      <Dialog open={!!toKnowledge} onClose={() => setToKnowledge(null)} size="sm" title="تبدیل به قلم دانش">
        {toKnowledge && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-md text-text-default">یک قلم «پیشنهادی» ساخته می‌شود؛ تا تأیید نکنی واقعیت نیست. یادداشت سر جایش می‌ماند.</p>
            <div className="flex flex-wrap gap-inline-xs">
              {([['Fact', 'واقعیت'], ['Decision', 'تصمیم'], ['Constraint', 'محدودیت']] as const).map(([t, label]) => (
                <Button key={t} size="sm" variant="secondary" onClick={async () => { const id = toKnowledge; setToKnowledge(null); await p.onNoteToKnowledge(id, t); }}>{label}</Button>
              ))}
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
};

const BoardCard = React.memo(function BoardCard({ card, object, dragging, ghost, onPointerDown, onLink, onActions, onOpen, onFocus }: {
  card: CanvasCard; object: ContextObject; dragging?: boolean; ghost?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void; onLink?: (e: React.PointerEvent) => void; onActions?: () => void; onOpen?: () => void; onFocus?: () => void;
}) {
  const fromAi = object.source && object.source.kind !== 'user';
  return (
    <div
      data-object-id={object.id}
      data-no-pan=""
      tabIndex={ghost ? -1 : 0}
      role={ghost ? undefined : 'group'}
      aria-label={ghost ? undefined : `${object.title}، ${LANE_FA[card.lane]}${card.review ? '، نیاز به بازبینی' : ''}`}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen?.(); }}
      className={`canvas-card ${ghost ? 'is-ghost' : ''} ${dragging ? 'is-lifted' : ''} ${ghost ? '' : 'absolute top-space-0 start-space-0'} overflow-hidden rounded-control border bg-surface-raised p-inset-sm ${card.review ? 'border-border-warning' : card.lane === 'thinking' ? 'border-dashed border-border-bold' : 'border-border-default'}`}
      style={ghost ? { inlineSize: CARD_W, blockSize: CARD_H } : { transform: `translate(${card.x}px, ${card.y + HEAD}px)`, inlineSize: CARD_W, blockSize: CARD_H }}
    >
    <div dir="rtl" className="flex h-full flex-col justify-between">
      <span className="flex items-center justify-between gap-inline-xs">
        <span className="flex min-w-space-0 items-center gap-inline-xs">
          <TypeBadge value={object.type} iconOnly />
          {fromAi && <Badge intent="neutral" icon={false}>پیشنهاد AI</Badge>}
          {card.review && <Badge intent="warning" icon={false}>بازبینی</Badge>}
        </span>
        {!ghost && (
          <span className="flex items-center">
            <button type="button" aria-label={`وصل کن: ${object.title}`} title="بکش روی کارت دیگر تا وصل شود" onPointerDown={onLink} onClick={onActions} className="flex min-h-touch-comfortable min-w-touch-comfortable items-center justify-center rounded-control-sm text-icon-subtle hover:bg-interaction-hover"><Icon name="Link2" size="md" /></button>
            <button type="button" aria-label={`انتقال و اتصال: ${object.title}`} onClick={onActions} className="flex min-h-touch-comfortable min-w-touch-comfortable items-center justify-center rounded-control-sm text-icon-subtle hover:bg-interaction-hover"><Icon name="Ellipsis" size="md" /></button>
          </span>
        )}
      </span>
      <span className="body-sm line-clamp-2 text-text-default">{object.title}</span>
    </div>
    </div>
  );
});
