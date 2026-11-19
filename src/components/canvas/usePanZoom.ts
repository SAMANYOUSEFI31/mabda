/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { clampView, zoomRange } from '../../core/canvasLod';

export interface View { x: number; y: number; k: number }
// zoom range and what each range shows: src/core/canvasLod.ts (`zoomRange`), docs/ux/decisions.md §۵۰
const READABLE_K = 0.85;
const CARD_W = 220;

const pinchDistance = (pts: Map<number, { x: number; y: number }>) => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
const pinchCenter = (pts: Map<number, { x: number; y: number }>) => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

/**
 * Pan / zoom of a stage (shared by the map and the boards): drag or one finger pans, two fingers pinch, ctrl+wheel zooms,
 * arrow keys pan and +/−/0 zoom/fit when the stage itself has focus. Coordinates stay plain numbers; the stage is moved with `transform`.
 */
/** `endInset(stageWidth, k)`: room kept free at the stage's END edge (the right, the stage is LTR) for labels pinned there, so the first
 *  view, «متناسب‌سازی» and the pan limit never place a card under them (the overview's row labels). It depends on the zoom because
 *  the board's own end margin already covers part of it, more so the nearer the view */
/** `roam`: the free canvas keeps room around its cards to put new ones (40% of the stage); boards with a fixed layout keep only a small margin */
export function usePanZoom(content: { width: number; height: number }, shapeKey: string, readableK = READABLE_K, remountKey: unknown = 0, endInset: (w: number, k: number) => number = () => 0, roam = false) {
  const [view, setRawView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 800, h: 520 });
  // every change of the view goes through the clamp, so no gesture, button or jump can leave the board off screen
  const bounds = useRef({ size, content, endInset, roam });
  const setView = useCallback((next: View | ((v: View) => View)) => setRawView((cur) => {
    const v = typeof next === 'function' ? next(cur) : next;
    const b = bounds.current;
    return clampView(v, { stageW: b.size.w, stageH: b.size.h, contentW: b.content.width, contentH: b.content.height, endInset: b.endInset(b.size.w, v.k), marginX: b.roam ? b.size.w * 0.4 : 24, marginY: b.roam ? b.size.h * 0.4 : 24 });
  }), []);
  const [measured, setMeasured] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pts: Map<number, { x: number; y: number }>; last?: { x: number; y: number }; pinch?: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    setMeasured(true);
    return () => ro.disconnect();
  }, [remountKey]);

  bounds.current = { size, content, endInset, roam };
  const inset = endInset(size.w, 1);
  const range = zoomRange({ stageW: size.w - inset, stageH: size.h, contentW: content.width, contentH: content.height, cardW: CARD_W });
  /** «متناسب‌سازی»: everything, or as much as still reads (a tall board: from its start, at the far floor) */
  const fit = useCallback(() => {
    const k = Math.min(1, Math.max(range.min, range.fit));
    const w = size.w - endInset(size.w, k);
    const cw = content.width * k, ch = content.height * k;
    setView({ k, x: cw <= w - 32 ? (w - cw) / 2 : w - 16 - cw, y: ch <= size.h - 32 ? (size.h - ch) / 2 : 16 });
  }, [size.w, size.h, content.width, content.height, endInset, range.min, range.fit, setView]);
  /** first view: readable (cards stay comfortably tappable), anchored at the START of the flow (the right edge in RTL) */
  const overview = useCallback(() => {
    const k = Math.min(1, Math.max(readableK, Math.min((size.w - inset - 32) / Math.max(content.width, 1), (size.h - 32) / Math.max(content.height, 1))));
    const room = size.w - endInset(size.w, k);
    const w = content.width * k;
    setView({ k, x: w <= room - 32 ? (room - w) / 2 : room - 16 - w, y: content.height * k <= size.h - 32 ? (size.h - content.height * k) / 2 : 16 });
  }, [size.w, size.h, content.width, content.height, readableK, inset, endInset, setView]);
  useEffect(() => { if (measured) overview(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, measured]);

  const zoomAt = useCallback((factor: number, cx = size.w / 2, cy = size.h / 2) => {
    // a view already outside the range (the stage was resized) is never pushed further out, only back toward it
    setView((v) => { const k = Math.min(Math.max(range.max, v.k), Math.max(Math.min(range.min, v.k), v.k * factor)); const r = k / v.k; return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; });
  }, [size.w, size.h, range.min, range.max, setView]);
  useEffect(() => { // ctrl/⌘ + wheel zooms (a plain wheel keeps scrolling the page)
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, remountKey]);

  // how far the last gesture moved: a pan or pinch ends in a click event too, and that click must not clear the selection
  const travel = useRef(0);
  /** true when the gesture that just ended moved the view (more than a tap's wobble): its click is not a tap */
  const panned = useCallback(() => travel.current > 6, []);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, [data-no-pan]')) return; // cards and controls keep their own gestures
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d: NonNullable<typeof drag.current> = drag.current ?? { pts: new Map<number, { x: number; y: number }>() };
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    d.last = { x: e.clientX, y: e.clientY };
    d.pinch = d.pts.size === 2 ? pinchDistance(d.pts) : undefined;
    if (d.pts.size === 1) travel.current = 0;
    drag.current = d;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !d.pts.has(e.pointerId)) return;
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pts.size === 2) {
      const dist = pinchDistance(d.pts);
      travel.current = Infinity; // a pinch is never a tap
      if (d.pinch) { const r = box.current!.getBoundingClientRect(); const c = pinchCenter(d.pts); zoomAt(dist / d.pinch, c.x - r.left, c.y - r.top); }
      d.pinch = dist;
    } else if (d.last) {
      const dx = e.clientX - d.last.x, dy = e.clientY - d.last.y;
      travel.current += Math.abs(dx) + Math.abs(dy);
      d.last = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.pts.delete(e.pointerId);
    d.pinch = undefined;
    d.last = d.pts.size === 1 ? [...d.pts.values()][0] : undefined;
    if (!d.pts.size) drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, select, [role=menu]')) return;
    const step = 80;
    if (e.key === 'ArrowDown') setView((v) => ({ ...v, y: v.y - step }));
    else if (e.key === 'ArrowUp') setView((v) => ({ ...v, y: v.y + step }));
    else if (e.key === 'ArrowRight') setView((v) => ({ ...v, x: v.x + step })); // check:design-ignore (key name)
    else if (e.key === 'ArrowLeft') setView((v) => ({ ...v, x: v.x - step })); // check:design-ignore (key name)
    else if (e.key === '+' || e.key === '=') zoomAt(1.2);
    else if (e.key === '-') zoomAt(1 / 1.2);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  };
  const sizeRef = useRef(size);
  sizeRef.current = size;
  /** keyboard focus on a card brings it into view */
  const reveal = useCallback((x: number, y: number, w: number, h: number) => setView((cur) => {
    const s = sizeRef.current;
    const sx = x * cur.k + cur.x, sy = y * cur.k + cur.y;
    const inside = sx >= 0 && sy >= 0 && sx + w * cur.k <= s.w && sy + h * cur.k <= s.h;
    return inside ? cur : { ...cur, x: s.w / 2 - (x + w / 2) * cur.k, y: s.h / 2 - (y + h / 2) * cur.k };
  }), [setView]);
  /** stage coordinates of a pointer position */
  const toStage = useCallback((clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k } : { x: 0, y: 0 };
  }, [view]);

  return { box, view, setView, size, range, fit, overview, zoomAt, reveal, toStage, panned, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown } };
}
