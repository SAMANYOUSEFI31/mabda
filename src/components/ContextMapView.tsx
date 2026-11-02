/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../types';
import { dependentsOf } from '../core/decisionGraph';
import { buildMapModel, CARD_H, CARD_W, EDGE_LABEL, highlightOf, impactOf, latestChangedObject, visibleVertices } from '../core/mapModel';
import type { MapEdge, MapEdgeKind, MapVertex } from '../core/mapModel';
import { usePanZoom } from './usePanZoom';
import { Badge, Button, Card, EmptyState, IconButton, STATUS_META, Switch, TypeBadge, formatNumber } from '../ui';

interface Props {
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  changes: ContextChange[];
  /** derived «needs review» objects / assets that need a review */
  reviewObjectIds: Set<string>;
  staleAssetIds: Set<string>;
  onOpenObject: (o: ContextObject) => void;
  onOpenAssets: () => void;
}

const EXPAND_ALL_LIMIT = 2000;
const MAX_EDGES = 1500;

/** line style per relation type — never colour alone: each type also has its own dash pattern and a label in the legend */
const EDGE_STYLE: Record<MapEdgeKind, { cls: string; dash?: string; width: number }> = {
  structural: { cls: 'stroke-border-default', dash: '2 5', width: 1.5 },
  dependency: { cls: 'stroke-border-bold', width: 2 },
  lineage: { cls: 'stroke-border-info', dash: '8 5', width: 2 },
  supersedes: { cls: 'stroke-border-warning', dash: '12 4 2 4', width: 2 },
};

/** from the facing side of one card to the facing side of the other (a bezier; vertical bend when they share a column) */
function pathOf(a: MapVertex, b: MapVertex): string {
  if (Math.abs(a.x - b.x) < 1) {
    const x = a.x + a.w / 2;
    const [y0, y1] = a.y < b.y ? [a.y + a.h, b.y] : [a.y, b.y + b.h];
    const bend = 40;
    return `M ${x} ${y0} C ${x + bend} ${y0}, ${x + bend} ${y1}, ${x} ${y1}`;
  }
  const rightward = a.x < b.x; // a sits to the right in RTL when a.x is larger
  const x0 = rightward ? a.x + a.w : a.x;
  const x1 = rightward ? b.x : b.x + b.w;
  const y0 = a.y + a.h / 2, y1 = b.y + b.h / 2;
  const mid = (x0 + x1) / 2;
  return `M ${x0} ${y0} C ${mid} ${y0}, ${mid} ${y1}, ${x1} ${y1}`;
}

export const ContextMapView: React.FC<Props> = ({ nodes, objects, relationships, deliverables, changes, reviewObjectIds, staleAssetIds, onOpenObject, onOpenAssets }) => {
  const [expanded, setExpanded] = useState<Set<string> | null>(null); // null = automatic (all when small)
  const [showAssets, setShowAssets] = useState(true);
  const [history, setHistory] = useState(false);
  const [lastChangeMode, setLastChangeMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const input = useMemo(() => ({ nodes, objects, relationships, deliverables, reviewObjectIds, staleAssetIds }), [nodes, objects, relationships, deliverables, reviewObjectIds, staleAssetIds]);
  const model = useMemo(() => buildMapModel(input, { expanded: expanded ?? undefined, showAssets, includeHistory: history }), [input, expanded, showAssets, history]);
  const byId = useMemo(() => new Map(model.vertices.map((v) => [v.id, v])), [model]);
  const effectiveExpanded = useMemo(() => new Set(model.vertices.filter((v) => v.kind === 'node' && v.expanded).map((v) => v.nodeId!)), [model]);

  // the object whose path of effect is lit: the selected one, or the newest change («اثر تغییر»)
  const lastChanged = useMemo(() => latestChangedObject(changes), [changes]);
  const selectedVertex = selected ? byId.get(selected) : undefined;
  const focusObjectId = lastChangeMode ? lastChanged : selectedVertex?.kind === 'object' ? selectedVertex.objectId : undefined;
  const impact = useMemo(() => (focusObjectId ? impactOf(input, focusObjectId) : null), [input, focusObjectId]);
  const lit = useMemo(() => (impact ? highlightOf(model, impact) : null), [model, impact]);

  const fitKey = `${model.vertices.length}:${Math.round(model.width)}:${Math.round(model.height)}`;
  const { box, view, size, fit, zoomAt, reveal: revealXY, handlers } = usePanZoom(model, fitKey);
  const reveal = useCallback((v: MapVertex) => revealXY(v.x, v.y, v.w, v.h), [revealXY]);
  const select = useCallback((id: string) => { setSelected(id); setLastChangeMode(false); }, []);

  // the drawn set only changes when the viewport crosses a 160px grid line — panning in between re-renders nothing heavy
  const SNAP = 160;
  const gx = Math.floor(-view.x / view.k / SNAP), gy = Math.floor(-view.y / view.k / SNAP);
  const gw = Math.ceil(size.w / view.k / SNAP) + 1, gh = Math.ceil(size.h / view.k / SNAP) + 1;
  const shown = useMemo(() => visibleVertices(model, { x: gx * SNAP, y: gy * SNAP, w: gw * SNAP, h: gh * SNAP }, SNAP), [model, gx, gy, gw, gh]);
  const shownIds = useMemo(() => new Set(shown.map((v) => v.id)), [shown]);
  const edges = useMemo(() => {
    const out: MapEdge[] = [];
    for (const e of model.edges) {
      if (!shownIds.has(e.from) && !shownIds.has(e.to)) continue;
      out.push(e);
      if (out.length >= MAX_EDGES) break;
    }
    return out;
  }, [model.edges, shownIds]);

  const toggleNode = useCallback((nodeId: string) => setExpanded((cur) => { const s = new Set(cur ?? effectiveExpanded); if (s.has(nodeId)) s.delete(nodeId); else s.add(nodeId); return s; }), [effectiveExpanded]);
  const objectOf = (id?: string) => objects.find((o) => o.id === id);
  const dim = !!lit;

  if (objects.length === 0 && deliverables.length === 0) return <EmptyState icon="Network" title="هنوز چیزی برای نقشه نیست" description="با ثبت اولین دانش، گره‌ها و ارتباط‌ها اینجا کشیده می‌شوند." />;

  return (
    <Card padding="lg" className="flex flex-col gap-stack-md" aria-label="نقشهٔ منبع حقیقت">
      <div className="flex flex-wrap items-center justify-between gap-inline-md">
        <div className="flex flex-wrap items-center gap-inline-md">
          <Switch label="خروجی‌ها" checked={showAssets} onChange={(e) => setShowAssets(e.target.checked)} />
          <Switch label="جایگزین‌شده‌ها" checked={history} onChange={(e) => setHistory(e.target.checked)} />
          <Switch label="اثر آخرین تغییر" checked={lastChangeMode} disabled={!lastChanged} onChange={(e) => { setLastChangeMode(e.target.checked); if (e.target.checked) setSelected(null); }} />
        </div>
        <div className="flex flex-wrap items-center gap-inline-xs">
          <Button size="sm" variant="secondary" disabled={objects.length > EXPAND_ALL_LIMIT} onClick={() => setExpanded(new Set(nodes.map((n) => n.id)))}>باز کردن همهٔ گره‌ها</Button>
          <Button size="sm" variant="secondary" onClick={() => setExpanded(new Set())}>جمع کردن همه</Button>
          <IconButton icon="ZoomOut" label="کوچک‌نمایی" onClick={() => zoomAt(1 / 1.25)} />
          <IconButton icon="ZoomIn" label="بزرگ‌نمایی" onClick={() => zoomAt(1.25)} />
          <IconButton icon="Maximize" label="جا دادن در صفحه" onClick={fit} />
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-inline-lg gap-y-stack-xs" aria-label="راهنمای خط‌ها">
        {(Object.keys(EDGE_STYLE) as MapEdgeKind[]).map((k) => (
          <li key={k} className="body-sm flex items-center gap-inline-xs text-text-subtle">
            <svg width="36" height="8" aria-hidden="true"><line x1="0" y1="4" x2="36" y2="4" className={EDGE_STYLE[k].cls} strokeWidth={EDGE_STYLE[k].width} strokeDasharray={EDGE_STYLE[k].dash} /></svg>
            {EDGE_LABEL[k]}
          </li>
        ))}
        <li className="body-sm text-text-subtle">{formatNumber(model.summary.objects)} مورد · {formatNumber(model.summary.assets)} خروجی{model.summary.collapsedNodes ? ` · ${formatNumber(model.summary.collapsedNodes)} گره جمع‌شده` : ''}</li>
      </ul>

      <div className="flex flex-col gap-stack-md lg:flex-row">
        <div
          ref={box}
          dir="ltr"
          tabIndex={0}
          role="application"
          aria-label="نقشه. با کلیدهای جهت‌دار جابه‌جا شو، با مثبت و منفی بزرگ و کوچک کن؛ با Tab بین کارت‌ها برو و Enter را بزن."
          {...handlers}
          className="relative min-w-space-0 flex-1 touch-none select-none overflow-hidden rounded-control border border-border-default bg-surface-sunken"
          style={{ blockSize: '62vh', minBlockSize: 360 }}
        >
          <div className="absolute top-space-0 start-space-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0', willChange: 'transform', inlineSize: model.width, blockSize: model.height }}>
            <EdgesLayer width={model.width} height={model.height} edges={edges} byId={byId} litEdges={lit?.edgeIds} dim={dim} selected={selected} />
            {shown.map((v) => (
              <MapCard
                key={v.id}
                v={v}
                selected={selected === v.id}
                lit={!!lit?.vertexIds.has(v.id)}
                dimmed={dim && !lit?.vertexIds.has(v.id) && selected !== v.id}
                onSelect={select}
                onToggle={toggleNode}
                onFocus={reveal}
              />
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-stack-sm rounded-control border border-border-default bg-surface-raised p-inset-lg lg:w-overlay-xs lg:shrink-0" aria-label="خلاصهٔ مورد انتخاب‌شده" aria-live="polite">
          {lastChangeMode && lastChanged && !selectedVertex ? (
            <Summary title={objectOf(lastChanged)?.title ?? lastChanged} subtitle="آخرین تغییرِ دانش" impact={impact} object={objectOf(lastChanged)} relationships={relationships} objects={objects} deliverables={deliverables} nodes={nodes} onOpenObject={onOpenObject} onOpenAssets={onOpenAssets} />
          ) : !selectedVertex ? (
            <p className="body-md text-text-subtle">روی یک کارت بزن تا خلاصه‌اش و مسیر اثرش را ببینی. با «اثر آخرین تغییر» مسیر آخرین تغییر روشن می‌شود.</p>
          ) : selectedVertex.kind === 'object' ? (
            <Summary title={selectedVertex.label} impact={impact} object={objectOf(selectedVertex.objectId)} relationships={relationships} objects={objects} deliverables={deliverables} nodes={nodes} onOpenObject={onOpenObject} onOpenAssets={onOpenAssets} />
          ) : selectedVertex.kind === 'node' ? (
            <>
              <h3 className="heading-xs text-text-default">{selectedVertex.label}</h3>
              <p className="body-sm text-text-subtle">{formatNumber(selectedVertex.count ?? 0)} مورد در این گره{selectedVertex.expanded ? ' (باز است)' : ' (جمع‌شده)'}.</p>
              {(selectedVertex.count ?? 0) > 0 && <div><Button size="sm" variant="secondary" onClick={() => toggleNode(selectedVertex.nodeId!)}>{selectedVertex.expanded ? 'جمع کردن' : 'باز کردن موردها'}</Button></div>}
            </>
          ) : (
            <>
              <h3 className="heading-xs text-text-default">{selectedVertex.label}</h3>
              {selectedVertex.review && <Badge intent="warning" icon={false}>نیاز به بازبینی</Badge>}
              <p className="body-sm text-text-subtle">{selectedVertex.kind === 'assets' ? `${formatNumber(selectedVertex.count ?? 0)} خروجی (برای خوانایی یک‌جا جمع شده‌اند).` : 'خروجی ساخته‌شده از دانش.'}</p>
              <div><Button size="sm" variant="secondary" onClick={onOpenAssets}>باز کردن</Button></div>
            </>
          )}
        </aside>
      </div>
    </Card>
  );
};

export const EDGE_STYLE_PUBLIC = EDGE_STYLE;
export const EdgesLayer = React.memo(function EdgesLayer({ width, height, edges, byId, litEdges, dim, selected }: { width: number; height: number; edges: MapEdge[]; byId: Map<string, MapVertex>; litEdges?: Set<string>; dim: boolean; selected: string | null }) {
  return (
            <svg className="pointer-events-none absolute top-space-0 start-space-0 overflow-visible" width={width} height={height} aria-hidden="true">
              <defs>
                <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="fill-border-bold" /></marker>
              </defs>
              {edges.map((e) => {
                const a = byId.get(e.from), b = byId.get(e.to);
                if (!a || !b) return null;
                const st = EDGE_STYLE[e.kind];
                const on = litEdges?.has(e.id);
                const touches = selected === e.from || selected === e.to;
                return (
                  <path
                    key={e.id}
                    d={pathOf(a, b)}
                    fill="none"
                    strokeWidth={on ? st.width + 1.5 : st.width}
                    strokeDasharray={st.dash}
                    markerEnd={e.kind === 'dependency' || e.kind === 'supersedes' ? 'url(#map-arrow)' : undefined}
                    className={`${on ? 'stroke-border-danger' : st.cls} ${dim && !on && !touches ? 'opacity-25' : ''}`}
                  >
                    <title>{`${e.label}${e.count > 1 ? ` (${formatNumber(e.count)})` : ''}`}</title>
                  </path>
                );
              })}
            </svg>
  );
});

const MapCard = React.memo(function MapCard({ v, selected, lit, dimmed, onSelect, onToggle, onFocus }: { v: MapVertex; selected: boolean; lit: boolean; dimmed: boolean; onSelect: (id: string) => void; onToggle: (nodeId: string) => void; onFocus: (v: MapVertex) => void }) {
  const tone = lit ? 'border-border-danger bg-bg-danger-subtle' : selected ? 'border-border-selected bg-bg-selected' : v.kind === 'node' ? 'border-border-bold bg-surface-overlay' : 'border-border-default bg-surface-raised';
  const label = v.kind === 'node' ? `گرهٔ ${v.label}، ${v.count ?? 0} مورد` : v.kind === 'object' ? `${v.label}${v.review ? '، نیاز به بازبینی' : ''}` : `${v.label}${v.review ? '، نیاز به بازبینی' : ''}`;
  return (
    <div
      className={`absolute top-space-0 start-space-0 overflow-hidden rounded-control border ${tone} ${dimmed ? 'opacity-40' : ''}`}
      style={{ transform: `translate(${v.x}px, ${v.y}px)`, inlineSize: CARD_W, blockSize: CARD_H }}
    >
      <div dir="rtl" className="flex h-full items-stretch">
      <button type="button" aria-label={label} aria-pressed={selected} onClick={() => onSelect(v.id)} onFocus={() => onFocus(v)} className="flex min-w-space-0 flex-1 flex-col justify-center gap-stack-xs px-inset-sm text-start">
        <span className="flex items-center gap-inline-xs">
          {v.kind === 'object' && v.type && <TypeBadge value={v.type} iconOnly />}
          {v.kind === 'asset' && <Badge intent="neutral" icon={false}>خروجی</Badge>}
          {v.kind === 'assets' && <Badge intent="neutral" icon={false}>{formatNumber(v.count ?? 0)} خروجی</Badge>}
          {v.kind === 'node' && <Badge intent="neutral" icon={false}>{formatNumber(v.count ?? 0)} مورد</Badge>}
          {v.review && <Badge intent="warning" icon={false}>بازبینی</Badge>}
          {v.kind === 'object' && v.status && v.status !== 'Confirmed' && <span className="caption text-text-subtle">{STATUS_META[v.status].label}</span>}
        </span>
        <span className={`body-sm line-clamp-2 text-text-default ${v.kind === 'node' ? 'label-md' : ''}`}>{v.label}</span>
      </button>
      {v.kind === 'node' && (v.count ?? 0) > 0 && (
        <button type="button" aria-expanded={!!v.expanded} aria-label={`${v.expanded ? 'جمع کردن' : 'باز کردن'} موردهای ${v.label}`} onClick={() => v.nodeId && onToggle(v.nodeId)} className="flex items-center justify-center border-s border-border-default text-text-subtle hover:bg-interaction-hover" style={{ inlineSize: 56 }}>
          {v.expanded ? '−' : '+'}
        </button>
      )}
      </div>
    </div>
  );
});

const Summary: React.FC<{
  title: string; subtitle?: string; object?: ContextObject; impact: ReturnType<typeof impactOf> | null; relationships: ContextRelationship[]; objects: ContextObject[]; deliverables: GeneratedDeliverable[]; nodes: TreeNode[];
  onOpenObject: (o: ContextObject) => void; onOpenAssets: () => void;
}> = ({ title, subtitle, object, impact, relationships, objects, deliverables, nodes, onOpenObject, onOpenAssets }) => {
  if (!object) return <h3 className="heading-xs text-text-default">{title}</h3>;
  const deps = relationships.filter((r) => r.type === 'depends_on' && r.sourceId === object.id).length;
  const dependents = dependentsOf(object.id, relationships, objects).length;
  const assets = impact ? impact.assetIds.size : deliverables.filter((d) => (d.usedContext ?? []).some((u) => u.id === object.id)).length;
  return (
    <>
      {subtitle && <span className="label-sm text-text-subtle">{subtitle}</span>}
      <h3 className="heading-xs text-text-default">{title}</h3>
      <div className="flex flex-wrap items-center gap-inline-xs"><TypeBadge value={object.type} /><Badge intent="neutral" icon={false}>{STATUS_META[object.status].label}</Badge><Badge intent="neutral" icon={false}>نسخهٔ {formatNumber(object.version)}</Badge></div>
      <p className="body-sm text-text-subtle">{nodes.find((n) => n.id === object.nodeId)?.label}</p>
      <p className="body-md text-text-default">{object.content.length > 220 ? `${object.content.slice(0, 220)}…` : object.content}</p>
      <ul className="body-sm flex flex-col gap-stack-xs text-text-default">
        <li>به {formatNumber(deps)} مورد وابسته است.</li>
        <li>{formatNumber(dependents)} مورد روی آن سوارند.</li>
        <li>{formatNumber(assets)} خروجی از مسیر اثر آن ساخته شده‌اند.</li>
      </ul>
      <div className="flex flex-wrap gap-inline-xs">
        <Button size="sm" variant="secondary" onClick={() => onOpenObject(object)}>باز کردن</Button>
        {assets > 0 && <Button size="sm" variant="ghost" onClick={onOpenAssets}>خروجی‌ها</Button>}
      </div>
    </>
  );
};
