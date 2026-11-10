/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SceneItem } from '../../core/canvasScene';
import type { View } from './usePanZoom';

const W = 168;
const H = 104;
const MAX_DOTS = 1500;

interface Props { items: SceneItem[]; width: number; height: number; view: View; size: { w: number; h: number }; selected: Set<string>; onJump: (x: number, y: number) => void }

/** a small overview in the corner: every card as a speck, the visible window as a frame; a click centres the canvas there */
export const CanvasMinimap: React.FC<Props> = ({ items, width, height, view, size, selected, onJump }) => {
  const sx = W / Math.max(width, 1), sy = H / Math.max(height, 1);
  const s = Math.min(sx, sy);
  const step = Math.ceil(items.length / MAX_DOTS);
  const win = { x: -view.x / view.k, y: -view.y / view.k, w: size.w / view.k, h: size.h / view.k };
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJump((e.clientX - r.left) / s, (e.clientY - r.top) / s);
  };
  return (
    <div data-no-pan="" className="pointer-events-auto rounded-control-sm border border-border-default bg-surface-raised p-inset-xs shadow-raised" aria-label="مینی‌مپ">
      <svg width={W} height={H} role="img" aria-label="نمای کلی بوم؛ با کلیک به آن نقطه می‌روی" onPointerDown={at} onPointerMove={(e) => { if (e.buttons === 1) at(e); }} className="block cursor-pointer touch-none">
        {items.filter((_, i) => i % step === 0).map((i) => <rect key={i.id} x={i.x * s} y={i.y * s} width={Math.max(2, i.w * s)} height={Math.max(2, i.h * s)} className={selected.has(i.id) ? 'fill-border-selected' : 'fill-border-bold'} />)}
        <rect x={win.x * s} y={win.y * s} width={Math.max(4, win.w * s)} height={Math.max(4, win.h * s)} fill="none" className="stroke-border-selected" strokeWidth={1.5} />
      </svg>
    </div>
  );
};
