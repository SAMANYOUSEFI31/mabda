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
 *  · OverviewFarList — the far level: every row as one line of a list (label, counters, the rows it leans on), in screen space.
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
      {rows.map((r, idx) => {
        // an opened sub-row closes from where the eye is (§۴۸): the row it was opened from may already be off screen
        let parent: typeof r | undefined;
        if (r.depth > 0) for (let j = idx - 1; j >= 0; j--) if (rows[j].depth < r.depth) { parent = rows[j]; break; }
        const top = view.y + r.y * view.k;
        const bottom = view.y + (r.y + r.h) * view.k;
        if (bottom < 0 || top > size.h) return null;
        const y = Math.min(Math.max(top + 4, 4), Math.max(top + 4, bottom - 64)); // stays visible while the row is on screen
        // a row shorter on screen than the full label (zoomed out) gets the small tab too, or the labels pile onto each other
        // and zoomed in past 110٪ the full label would sit on the cards' titles: the tab keeps the row's name only, a tap opens the rest
        const tight = bottom - top < 116 || view.k > 1.1;
        if ((compact || tight) && openRow !== r.nodeId) return (
          <button key={r.nodeId} type="button" data-testid="row-rail" data-row={r.nodeId} data-no-pan="" aria-expanded={false} onClick={() => setOpenRow(r.nodeId)} className="label-sm pointer-events-auto absolute end-space-1 text-balance rounded-control border border-border-default bg-surface-raised px-inset-sm py-inset-xs text-text-default shadow-raised" style={{ top: y, inlineSize: 96, minBlockSize: 44 }}>{r.label}</button>
        );
        return (
          <div key={r.nodeId} data-testid="row-rail" data-row={r.nodeId} data-no-pan="" className="pointer-events-auto absolute end-space-1 flex flex-col gap-stack-xs rounded-control border border-border-default bg-surface-raised px-inset-sm py-inset-xs shadow-raised" style={{ top: y, inlineSize: 168 }}>
            <span dir="rtl" className="flex items-center justify-between gap-inline-xs">
              <span className="label-md min-w-space-0 text-balance text-text-default">{r.label}</span>
              {onMoveRow && <span className="flex shrink-0 items-center"><IconButton icon="ChevronUp" label={`ردیف «${r.label}» را بالاتر ببر`} onClick={() => onMoveRow(r.nodeId, -1)} /><IconButton icon="ChevronDown" label={`ردیف «${r.label}» را پایین‌تر ببر`} onClick={() => onMoveRow(r.nodeId, 1)} /></span>}
            </span>
            {parent && <span dir="rtl" className="caption text-text-subtle">زیربخشِ «{parent.label}»</span>}
            <span dir="rtl" className="caption text-text-subtle">{countsText(r.counts)}</span>
            <span dir="rtl" className="flex flex-wrap gap-inline-xs">
              {/* once opened, its sections have rows of their own and rolledUp is 0: the way back must stay */}
              {(r.rolledUp > 0 || opened.has(r.nodeId)) && <Button size="sm" variant="ghost" aria-expanded={opened.has(r.nodeId)} onClick={() => onToggleRow(r.nodeId)}>{opened.has(r.nodeId) ? 'زیربخش‌ها را جمع کن' : `زیربخش‌ها (${formatNumber(r.rolledUp)})`}</Button>}
              {parent && opened.has(parent.nodeId) && <Button size="sm" variant="ghost" aria-label={`زیربخش‌های «${parent.label}» را جمع کن`} onClick={() => onToggleRow(parent.nodeId)}>جمع کن</Button>}
              {onEnterRow && <Button size="sm" variant="ghost" onClick={() => onEnterRow(r.nodeId)}>برو داخل</Button>}
              {(compact || tight) && <Button size="sm" variant="ghost" onClick={() => setOpenRow(null)}>ببند</Button>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** drawn INSIDE the transformed stage: text is scaled back so it reads at about 15px whatever the zoom */

/**
 * The FAR level of the overview (decisions.md §۵۰، بازبینی): every row as one line of a list, in SCREEN space, at a readable size.
 * Drawn on the board (the earlier OverviewFar) a row kept the height of its cards, about 216px on screen at 25٪ for 9 stacked cards,
 * so a 216-item space showed 3 of its 23 rows: the far level did not show the whole. What a far view is for is the whole: every
 * section, how much is in it, what is wrong in it, and which sections lean on which; a row's height carries none of that, so here
 * it is the height of its two lines of text (the label and its counters, ≥ the 44px touch target), the same for 3 rows or 300.
 * A list longer than the stage scrolls (a plain wheel or one finger), as a long list does. Zooming IN on a row (ctrl+wheel, pinch,
 * the button, a tap) opens the board at that row; the levels are discrete steps, like a photo library's years / months / days.
 */
export const OverviewFarList: React.FC<{ scene: Scene; onZoomRow: (nodeId: string) => void; onZoomRows: (from: string, to: string) => void; listRef?: React.Ref<HTMLDivElement>; /** a control floats at the stage's top corner (the «جزئیات» button): the list starts below it */ topRoom?: boolean }> = ({ scene, onZoomRow, onZoomRows, listRef, topRoom }) => {
  const ov = scene.overview;
  if (!ov) return null;
  const label = new Map(ov.rows.map((r) => [r.nodeId, r.label]));
  return (
    <div ref={listRef} dir="rtl" data-no-pan="" data-testid="overview-far-list" className="absolute top-space-0 bottom-space-0 start-space-0 end-space-0 touch-pan-y overflow-y-auto bg-surface-sunken p-inset-sm">
      {topRoom && <div className="min-h-touch" aria-hidden="true" />}
      <ul className="flex flex-col gap-stack-xs" aria-label={`همهٔ بخش‌ها (${formatNumber(ov.rows.length)})`}>
        {ov.rows.map((r) => {
          const leansOn = ov.rowEdges.filter((e) => e.to === r.nodeId);
          return (
            <li key={r.nodeId} data-row={r.nodeId} className="flex flex-wrap items-center gap-inline-xs rounded-control border border-border-default bg-surface-raised pe-inset-xs" style={{ marginInlineStart: `calc(${r.depth} * var(--space-6))` }}>
              {/* one line where it fits (name · counters · the rows it leans on), wrapping on a narrow stage; each target ≥ 44px tall,
                  drawn smaller (a pill inside its hit area) so a long list stays dense */}
              <button type="button" data-testid="row-summary" aria-label={`${r.label}: ${countsText(r.counts)}؛ بزرگ‌نمایی کن`} onClick={() => onZoomRow(r.nodeId)}
                className="flex min-h-touch min-w-space-0 basis-full flex-wrap items-baseline sm:flex-1 sm:basis-auto gap-inline-sm rounded-control px-inset-md py-inset-xs text-start hover:bg-interaction-hover">
                <span className="label-md text-text-default">{r.label}</span>
                <span className="body-sm text-text-subtle">{countsText(r.counts)}</span>
              </button>
              {leansOn.map((e) => (
                <button key={e.id} type="button" data-testid="row-edge" aria-label={`${formatNumber(e.count)} وابستگی به «${label.get(e.from) ?? ''}» از «${r.label}»؛ بازشان کن`} onClick={() => onZoomRows(e.from, e.to)}
                  className="group inline-flex min-h-touch items-center">
                  <span className="body-sm rounded-pill border border-border-selected bg-bg-selected px-inset-sm text-text-default group-hover:bg-interaction-hover">{formatNumber(e.count)} وابستگی به «{label.get(e.from)}»</span>
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
