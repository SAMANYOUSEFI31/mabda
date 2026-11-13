/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { Scene } from '../../core/canvasScene';
import { Button, IconButton, formatNumber } from '../../ui';

interface View { x: number; y: number; k: number }
interface Size { w: number; h: number }

const countsText = (c: { knowledge: number; redLines: number; stale: number; openThoughts: number }) =>
  `${formatNumber(c.knowledge)} دانش${c.redLines ? ` · ${formatNumber(c.redLines)} خط قرمز` : ''}${c.stale ? ` · ${formatNumber(c.stale)} قدیمی` : ''}${c.openThoughts ? ` · ${formatNumber(c.openThoughts)} فکر باز` : ''}`;

/**
 * The semantic-zoom parts of the overview (docs/canvas-design.md):
 *  · RowRail     — the label of every visible row, pinned to the START edge of the stage while the row scrolls (sticky), with its
 *                  counters and, for a row that has deeper sections rolled into it, a button to open them;
 *  · OverviewFar — zoomed out, a row is ONE summary (counters) and the lines between rows are ONE line with a count.
 */
/** the stage width under which a row label is a small tab; and the room the labels take at the END edge (their width + gap),
 *  kept free by the first view and «متناسب‌سازی» so no card starts under a label */
const COMPACT_BELOW = 560;
export const railInset = (stageW: number) => (stageW < COMPACT_BELOW ? 96 : 168) + 12;

export const RowRail: React.FC<{ scene: Scene; view: View; size: Size; opened: Set<string>; onToggleRow: (nodeId: string) => void; onEnterRow?: (nodeId: string) => void; /** the order of rows is display only */ onMoveRow?: (nodeId: string, dir: -1 | 1) => void }> = ({ scene, view, size, opened, onToggleRow, onEnterRow, onMoveRow }) => {
  const rows = scene.overview?.rows ?? [];
  // on a phone the label is a small tab; a tap opens its counters and buttons (the labels must not cover the cards)
  const compact = size.w < COMPACT_BELOW;
  const [openRow, setOpenRow] = useState<string | null>(null);
  return (
    <div className="pointer-events-none absolute top-space-0 bottom-space-0 end-space-0 start-space-0 overflow-hidden">
      {rows.map((r) => {
        const top = view.y + r.y * view.k;
        const bottom = view.y + (r.y + r.h) * view.k;
        if (bottom < 0 || top > size.h) return null;
        const y = Math.min(Math.max(top + 4, 4), Math.max(top + 4, bottom - 64)); // stays visible while the row is on screen
        if (compact && openRow !== r.nodeId) return (
          <button key={r.nodeId} type="button" data-testid="row-rail" data-row={r.nodeId} data-no-pan="" aria-expanded={false} onClick={() => setOpenRow(r.nodeId)} className="label-sm pointer-events-auto absolute end-space-1 text-balance rounded-control border border-border-default bg-surface-raised px-inset-sm py-inset-xs text-text-default shadow-raised" style={{ top: y, inlineSize: 96, minBlockSize: 44 }}>{r.label}</button>
        );
        return (
          <div key={r.nodeId} data-testid="row-rail" data-row={r.nodeId} data-no-pan="" className="pointer-events-auto absolute end-space-1 flex flex-col gap-stack-xs rounded-control border border-border-default bg-surface-raised px-inset-sm py-inset-xs shadow-raised" style={{ top: y, inlineSize: 168 }}>
            <span dir="rtl" className="flex items-center justify-between gap-inline-xs">
              <span className="label-md min-w-space-0 text-balance text-text-default" style={{ paddingInlineStart: r.depth * 10 }}>{r.label}</span>
              {onMoveRow && <span className="flex shrink-0 items-center"><IconButton icon="ChevronUp" label={`ردیف «${r.label}» را بالاتر ببر`} onClick={() => onMoveRow(r.nodeId, -1)} /><IconButton icon="ChevronDown" label={`ردیف «${r.label}» را پایین‌تر ببر`} onClick={() => onMoveRow(r.nodeId, 1)} /></span>}
            </span>
            <span dir="rtl" className="caption text-text-subtle">{countsText(r.counts)}</span>
            <span dir="rtl" className="flex flex-wrap gap-inline-xs">
              {r.rolledUp > 0 && <Button size="sm" variant="ghost" aria-expanded={opened.has(r.nodeId)} onClick={() => onToggleRow(r.nodeId)}>{opened.has(r.nodeId) ? 'زیربخش‌ها را جمع کن' : `زیربخش‌ها (${formatNumber(r.rolledUp)})`}</Button>}
              {onEnterRow && <Button size="sm" variant="ghost" onClick={() => onEnterRow(r.nodeId)}>برو داخل</Button>}
              {compact && <Button size="sm" variant="ghost" onClick={() => setOpenRow(null)}>ببند</Button>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** drawn INSIDE the transformed stage: text is scaled back so it reads at about 15px whatever the zoom */
export const OverviewFar: React.FC<{ scene: Scene; k: number; onZoomRows: (from: string, to: string) => void; onZoomRow: (nodeId: string) => void }> = ({ scene, k, onZoomRows, onZoomRow }) => {
  const ov = scene.overview;
  if (!ov) return null;
  const rowById = new Map(ov.rows.map((r) => [r.nodeId, r]));
  const fs = Math.min(90, 15 / Math.max(k, 0.05));
  const pad = Math.min(36, 10 / Math.max(k, 0.05));
  return (
    <>
      {ov.rows.map((r) => (
        <button key={r.nodeId} type="button" data-no-pan="" data-testid="row-summary" aria-label={`${r.label}: ${countsText(r.counts)}؛ بزرگ‌نمایی کن`} onClick={() => onZoomRow(r.nodeId)}
          className="absolute start-space-0 flex items-center justify-between gap-inline-sm rounded-control border border-border-bold bg-surface-raised text-start text-text-default" style={{ top: r.y, inlineSize: scene.width, blockSize: r.h - 6, paddingInline: pad, fontSize: fs }}>
          <span dir="rtl" style={{ fontWeight: 600 }}>{r.label}</span>
          <span dir="rtl" className="text-text-subtle">{countsText(r.counts)}</span>
        </button>
      ))}
      {ov.rowEdges.map((e, i) => {
        const a = rowById.get(e.from), b = rowById.get(e.to);
        if (!a || !b) return null;
        const x = 80 + ((i * 197) % Math.max(200, scene.width - 160));
        const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
        return (
          <React.Fragment key={e.id}>
            <svg className="pointer-events-none absolute top-space-0 start-space-0 overflow-visible" width={scene.width} height={scene.height} aria-hidden="true"><line x1={x} y1={y1} x2={x} y2={y2} className="stroke-border-selected" strokeWidth={Math.min(8, 2 / Math.max(k, 0.15))} /></svg>
            <button type="button" data-no-pan="" data-testid="row-edge" aria-label={`${formatNumber(e.count)} وابستگی به «${a.label}» از «${b.label}»؛ بازشان کن`} onClick={() => onZoomRows(e.from, e.to)}
              className="absolute rounded-pill border border-border-selected bg-bg-selected text-text-default" style={{ insetInlineStart: x, top: (y1 + y2) / 2, transform: 'translate(-50%, -50%)', fontSize: fs, paddingInline: pad, whiteSpace: 'nowrap' }}>
              {formatNumber(e.count)} وابستگی به «{a.label}»
            </button>
          </React.Fragment>
        );
      })}
    </>
  );
};
