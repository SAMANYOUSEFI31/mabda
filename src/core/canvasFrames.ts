/**
 * Section frames of the FREE canvas («بوم فکر»): every section that has placed cards or notes gets one frame around them. A frame
 * is derived (the box around its members, never stored): dragging it moves all its members, dropping a card into another
 * section's frame changes that card's section. Both have a no-drag equivalent (a menu: «جابه‌جا کن به…»). Pure.
 */

import type { TreeNode } from '../types';
import type { SceneItem } from './canvasScene';

export const FRAME_PAD = 28;
export const FRAME_HEAD = 44;

export interface Frame { nodeId: string; label: string; x: number; y: number; w: number; h: number; /** the scene ids of its cards and notes */ ids: string[] }
type Placed = Pick<SceneItem, 'id' | 'x' | 'y' | 'w' | 'h' | 'nodeId' | 'unplaced'>;

export function freeFrames(items: Placed[], nodes: TreeNode[]): Frame[] {
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  const by = new Map<string, Placed[]>();
  for (const it of items) if (it.nodeId && !it.unplaced && label.has(it.nodeId)) by.set(it.nodeId, [...(by.get(it.nodeId) ?? []), it]);
  return [...by.entries()].map(([nodeId, list]) => {
    const x0 = Math.min(...list.map((i) => i.x)) - FRAME_PAD, y0 = Math.min(...list.map((i) => i.y)) - FRAME_HEAD;
    const x1 = Math.max(...list.map((i) => i.x + i.w)) + FRAME_PAD, y1 = Math.max(...list.map((i) => i.y + i.h)) + FRAME_PAD;
    return { nodeId, label: label.get(nodeId)!, x: x0, y: y0, w: x1 - x0, h: y1 - y0, ids: list.map((i) => i.id).sort() };
  }).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/** the frame a point falls in (the smallest if two overlap); `except` = the card's own section */
export function frameAt(frames: Frame[], x: number, y: number, except?: string): Frame | undefined {
  return frames.filter((f) => f.nodeId !== except && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h).sort((a, b) => a.w * a.h - b.w * b.h || a.nodeId.localeCompare(b.nodeId))[0];
}

/** the new place of every member when the frame moves by (dx, dy); nothing leaves the canvas (x, y ≥ 0) — and then the SAME shift applies to all, so the group keeps its shape */
export function shiftFrame(frame: Frame, items: Placed[], dx: number, dy: number): Array<{ id: string; x: number; y: number }> {
  const members = items.filter((i) => frame.ids.includes(i.id));
  const minX = Math.min(...members.map((m) => m.x)), minY = Math.min(...members.map((m) => m.y));
  const sx = Math.round(Math.max(dx, -minX)), sy = Math.round(Math.max(dy, -minY));
  return members.map((m) => ({ id: m.id, x: m.x + sx, y: m.y + sy }));
}

/** where `frame` goes to sit beside `target` (on its right, tops aligned, with a gap): the menu alternative to dragging */
export function beside(frame: Frame, target: Frame, gap = 48): { dx: number; dy: number } {
  return { dx: target.x + target.w + gap - frame.x, dy: target.y - frame.y };
}
