/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface View { x: number; y: number; k: number }
const MIN_K = 0.1;
const MAX_K = 2.5;
const READABLE_K = 0.85;

const pinchDistance = (pts: Map<number, { x: number; y: number }>) => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
const pinchCenter = (pts: Map<number, { x: number; y: number }>) => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

/**
 * Pan / zoom of a stage (shared by the map and the boards): drag or one finger pans, two fingers pinch, ctrl+wheel zooms,
 * arrow keys pan and +/−/0 zoom/fit when the stage itself has focus. Coordinates stay plain numbers; the stage is moved with `transform`.
 */
export function usePanZoom(content: { width: number; height: number }, shapeKey: string, readableK = READABLE_K) {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 800, h: 520 });
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
  }, []);

  const fit = useCallback(() => {
    const k = Math.min(1, Math.max(MIN_K, Math.min((size.w - 32) / Math.max(content.width, 1), (size.h - 32) / Math.max(content.height, 1))));
    setView({ k, x: Math.max(16, (size.w - content.width * k) / 2), y: Math.max(16, (size.h - content.height * k) / 2) });
  }, [size.w, size.h, content.width, content.height]);
  /** first view: readable (cards stay comfortably tappable), anchored at the START of the flow (the right edge in RTL) */
  const overview = useCallback(() => {
    const k = Math.min(1, Math.max(readableK, Math.min((size.w - 32) / Math.max(content.width, 1), (size.h - 32) / Math.max(content.height, 1))));
    const w = content.width * k;
    setView({ k, x: w <= size.w - 32 ? (size.w - w) / 2 : size.w - 16 - w, y: content.height * k <= size.h - 32 ? (size.h - content.height * k) / 2 : 16 });
  }, [size.w, size.h, content.width, content.height, readableK]);
  useEffect(() => { if (measured) overview(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, measured]);

  const zoomAt = useCallback((factor: number, cx = size.w / 2, cy = size.h / 2) => {
    setView((v) => { const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor)); const r = k / v.k; return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; });
  }, [size.w, size.h]);
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
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, [data-no-pan]')) return; // cards and controls keep their own gestures
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d: NonNullable<typeof drag.current> = drag.current ?? { pts: new Map<number, { x: number; y: number }>() };
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    d.last = { x: e.clientX, y: e.clientY };
    d.pinch = d.pts.size === 2 ? pinchDistance(d.pts) : undefined;
    drag.current = d;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !d.pts.has(e.pointerId)) return;
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pts.size === 2) {
      const dist = pinchDistance(d.pts);
      if (d.pinch) { const r = box.current!.getBoundingClientRect(); const c = pinchCenter(d.pts); zoomAt(dist / d.pinch, c.x - r.left, c.y - r.top); }
      d.pinch = dist;
    } else if (d.last) {
      const dx = e.clientX - d.last.x, dy = e.clientY - d.last.y;
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
  }), []);
  /** stage coordinates of a pointer position */
  const toStage = useCallback((clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k } : { x: 0, y: 0 };
  }, [view]);

  return { box, view, setView, size, fit, overview, zoomAt, reveal, toStage, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown } };
}
