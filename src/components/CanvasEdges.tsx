/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import type { SceneEdge, SceneItem } from '../core/canvasScene';
import { routeEdges } from '../core/edgeRouting';
import type { Rect, Route } from '../core/edgeRouting';
import type { MapEdgeKind } from '../core/mapModel';

/** per relation type: a colour token, a dash pattern and a width — never colour alone */
export const EDGE_STYLE: Record<MapEdgeKind, { stroke: string; fill: string; dash?: string; width: number }> = {
  dependency: { stroke: 'stroke-mabda-edge-dependency', fill: 'fill-mabda-edge-dependency', width: 1.75 },
  lineage: { stroke: 'stroke-mabda-edge-lineage', fill: 'fill-mabda-edge-lineage', dash: '8 5', width: 1.75 },
  supersedes: { stroke: 'stroke-mabda-edge-supersedes', fill: 'fill-mabda-edge-supersedes', dash: '12 4 2 4', width: 1.75 },
};
export const ARROW = 12; // arrow head, in stage px (≥ 10)
export const EMPHASIS_EXTRA = 1; // an emphasized line is this much thicker

export interface RoutedEdge { edge: SceneEdge; route: Route }

/** the routes of the given edges between the given items (obstacles = every card, so a line never crosses one) */
export function routeSceneEdges(edges: SceneEdge[], all: SceneItem[], obstacles?: Rect[]): RoutedEdge[] {
  const need = new Set(edges.flatMap((e) => [e.influencer, e.influenced]));
  const rects = new Map<string, Rect>(all.filter((i) => need.has(i.id)).map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }]));
  const routes = routeEdges(edges.map((e) => ({ id: e.id, from: e.influencer, to: e.influenced })), rects, { obstacles: obstacles ?? all.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h })) });
  return edges.flatMap((edge) => { const route = routes.get(edge.id); return route ? [{ edge, route }] : []; });
}

interface Props {
  width: number;
  height: number;
  routed: RoutedEdge[];
  /** edges to draw strong (they touch the selection); the rest are dimmed, never hidden — unless `all` */
  emphasized: Set<string>;
  hasFocus: boolean;
  showAll: boolean;
  hovered: string | null;
  selectedEdge: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/** the lines: a halo under each (so crossings read as «in front»), then the line with its own pattern, an arrow into the influenced card, a wide invisible hit area */
export const CanvasEdges = React.memo(function CanvasEdges({ width, height, routed, emphasized, hasFocus, showAll, hovered, selectedEdge, onHover, onSelect }: Props) {
  const ids = useMemo(() => (['dependency', 'lineage', 'supersedes'] as MapEdgeKind[]), []);
  return (
    <svg className="pointer-events-none absolute top-space-0 start-space-0 overflow-visible" width={width} height={height} aria-hidden="true" data-testid="canvas-edges">
      <defs>
        {ids.map((k) => (
          <marker key={k} id={`canvas-arrow-${k}`} viewBox="0 0 12 12" refX="11" refY="6" markerWidth={ARROW} markerHeight={ARROW} markerUnits="userSpaceOnUse" orient="auto">
            <path d="M 1 1 L 11 6 L 1 11 z" className={`${EDGE_STYLE[k].fill} stroke-mabda-edge-halo`} strokeWidth={1} strokeLinejoin="round" />
          </marker>
        ))}
      </defs>
      {/* two layers: ALL halos first, then ALL lines — a halo never cuts a line that was drawn before it. Emphasised lines come last (in front). */}
      {(() => {
        const info = (edge: SceneEdge) => {
          const strong = emphasized.has(edge.id) || hovered === edge.id || selectedEdge === edge.id;
          return { strong, dim: hasFocus && !showAll && !strong, w: EDGE_STYLE[edge.kind].width + (strong ? EMPHASIS_EXTRA : 0) };
        };
        const ordered = [...routed].sort((x, y) => Number(info(x.edge).strong) - Number(info(y.edge).strong));
        return (
          <>
            <g data-layer="halo">
              {ordered.map(({ edge, route }) => { const i = info(edge); return <path key={edge.id} d={route.d} fill="none" className={`stroke-mabda-edge-halo ${i.dim ? 'opacity-35' : ''}`} strokeWidth={i.w + 4} strokeLinecap="round" strokeLinejoin="round" />; })}
            </g>
            <g data-layer="line">
              {ordered.map(({ edge, route }) => {
                const st = EDGE_STYLE[edge.kind];
                const i = info(edge);
                return (
                  <g key={edge.id} data-edge={edge.id} data-kind={edge.kind} className={i.dim ? 'opacity-35' : ''}>
                    <path d={route.d} fill="none" className={st.stroke} data-line="" strokeWidth={i.w} strokeDasharray={st.dash} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#canvas-arrow-${edge.kind})`} />
                  </g>
                );
              })}
            </g>
            <g data-layer="hit">
              {ordered.map(({ edge, route }) => (
                <path key={edge.id} d={route.d} fill="none" stroke="transparent" strokeWidth={16} className="cursor-pointer" style={{ pointerEvents: 'stroke' }} onPointerEnter={() => onHover(edge.id)} onPointerLeave={() => onHover(null)} onClick={(e) => { e.stopPropagation(); onSelect(edge.id); }} />
              ))}
            </g>
          </>
        );
      })()}
    </svg>
  );
});
