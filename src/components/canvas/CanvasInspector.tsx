/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../../types';
import type { Scene, SceneEdge, SceneItem } from '../../core/canvasScene';
import { EDGE_ABOUT, LAYOUT_ABOUT, LAYOUT_FA } from '../../core/canvasScene';
import { LOD_FA } from '../../core/canvasLod';
import type { Lod } from '../../core/canvasLod';
import { aboutSentence, influenceOf, influenceSummary } from '../../core/influence';
import { Badge, Button, StatusBadge, TypeBadge, formatNumber, Caution } from '../../ui';
import { Closed as DetailSection, InfluencePanel } from '../knowledge/InfluencePanel';
import { provenanceOf } from '../../core/provenance';
import type { Note } from '../../types';
import { ProvenanceList } from '../knowledge/ProvenanceList';
import { EDGE_STYLE } from './CanvasEdges';

interface Props {
  scene: Scene;
  selection: string[];
  selectedEdge: SceneEdge | null;
  objects: ContextObject[];
  nodes: TreeNode[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  lod: Lod;
  now: Date;
  /** actions (the keyboard / touch equivalents of dragging) */
  canMoveStatus: boolean;
  onOpenObject: (o: ContextObject) => void;
  onOpenAssets: () => void;
  onActions: (objectId: string) => void;
  onAcceptReview: (objectId: string) => Promise<void>;
  onPlace?: (objectId: string) => void;
  onUnplace?: (objectId: string) => void;
  onClear: () => void;
  onSelect: (id: string) => void;
  placed: boolean;
  /** for «منشأ» */
  notes?: Note[];
  /** «دور این مورد» (the truth canvas) */
  onLineage?: (objectId: string) => void;
  onOpenNote?: (noteId: string, nodeId: string) => void;
}

const LEGEND: Array<{ kind: SceneEdge['kind']; what: string }> = [
  { kind: 'dependency', what: 'وابسته به' },
  { kind: 'lineage', what: 'ساخته‌شده از' },
  { kind: 'supersedes', what: 'جایگزین کرد' },
];

/** «what is this, and why is it here»: the side panel says in words what the picture says in shapes (also the screen-reader path) */
export const CanvasInspector: React.FC<Props> = (p) => {
  const { scene } = p;
  const byId = new Map(scene.items.map((i) => [i.id, i]));
  const item = p.selection.length === 1 ? byId.get(p.selection[0]) : undefined;
  const nodeLabel = (id?: string) => p.nodes.find((n) => n.id === id)?.label ?? '';
  const titleOf = (id: string) => byId.get(id)?.label ?? id;

  if (p.selectedEdge) {
    const e = p.selectedEdge;
    return (
      <div className="flex flex-col gap-stack-sm" data-testid="inspector-edge">
        <span className="label-sm text-text-subtle">خط</span>
        <h3 className="heading-xs text-text-default">{e.label}</h3>
        <p className="body-md text-text-default">«{titleOf(e.influencer)}» ← «{titleOf(e.influenced)}»</p>
        <p className="body-sm text-text-subtle">پیکان همیشه از اثرگذار به اثرپذیر می‌رود. {EDGE_ABOUT[e.kind]}</p>
        {e.redundant && <p className="body-sm text-text-default" data-testid="edge-redundant">این خط لازم نیست؛ همین اثر از راه کارت‌های دیگر هم می‌رسد. می‌توانی آن را از «جزئیات» همان دانش برداری.</p>}
        {e.count > 1 && <p className="body-sm text-text-subtle">{formatNumber(e.count)} رابطه در این خط جمع شده‌اند.</p>}
        <div className="flex gap-inline-xs"><Button size="sm" variant="ghost" onClick={p.onClear}>بستن</Button></div>
      </div>
    );
  }
  if (p.selection.length > 1) {
    return (
      <div className="flex flex-col gap-stack-sm" data-testid="inspector-multi">
        <h3 className="heading-xs text-text-default">{formatNumber(p.selection.length)} مورد انتخاب شده</h3>
        <ul className="flex flex-col gap-stack-xs">{p.selection.slice(0, 8).map((id) => <li key={id}><button type="button" className="body-sm text-start text-text-default underline-offset-2 hover:underline" onClick={() => p.onSelect(id)}>{titleOf(id)}</button></li>)}</ul>
        {p.selection.length > 8 && <p className="body-sm text-text-subtle">و {formatNumber(p.selection.length - 8)} مورد دیگر.</p>}
        <div><Button size="sm" variant="ghost" onClick={p.onClear}>پاک کردن انتخاب</Button></div>
      </div>
    );
  }
  if (!item) {
    const about = LAYOUT_ABOUT[scene.layout];
    return (
      <div className="flex flex-col gap-stack-md" data-testid="inspector-empty">
        <div className="flex flex-col gap-stack-xs">
          <span className="label-sm text-text-subtle">چیدمان «{LAYOUT_FA[scene.layout]}»</span>
          <h3 className="heading-xs text-text-default">{about.question}</h3>
          <p className="body-sm text-text-subtle">{about.what}</p>
        </div>
        <p className="body-sm text-text-default">{formatNumber(scene.summary.objects)} مورد{scene.summary.assets ? ` · ${formatNumber(scene.summary.assets)} خروجی` : ''}{scene.summary.notes ? ` · ${formatNumber(scene.summary.notes)} یادداشت` : ''} · سطح جزئیات: {LOD_FA[p.lod]}</p>
        {scene.edges.length > 0 && (
          <ul className="flex flex-col gap-stack-xs" aria-label="راهنمای خط‌ها">
            {LEGEND.filter((l) => scene.edges.some((e) => e.kind === l.kind)).map((l) => (
              <li key={l.kind} className="body-sm flex items-start gap-inline-sm text-text-default">
                <svg width="40" height="12" aria-hidden="true" className="mt-stack-xs shrink-0"><line x1="1" y1="6" x2="30" y2="6" className={EDGE_STYLE[l.kind].stroke} strokeWidth={2} strokeDasharray={EDGE_STYLE[l.kind].dash} /><path d="M 28 1 L 39 6 L 28 11 z" className={EDGE_STYLE[l.kind].fill} /></svg>
                <span><b>{l.what}</b> — {EDGE_ABOUT[l.kind]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const o = item.objectId ? p.objects.find((x) => x.id === item.objectId) : undefined;
  if (item.kind === 'object' && o) {
    const inf = influenceOf(o.id, p.objects, p.nodes, p.relationships, p.deliverables, p.now);
    const sum = inf ? influenceSummary(inf, formatNumber) : undefined;
    const moveBtn = <Button key="move" size="sm" variant="secondary" iconStart="Link2" onClick={() => p.onActions(o.id)}>انتقال و اتصال</Button>;
    return (
      <div key={o.id} className="flex flex-col gap-stack-sm" data-testid="inspector-object">
        <h3 className="heading-xs text-text-default">{o.title}</h3>
        <p className="body-md text-text-default" data-testid="inspector-about">{aboutSentence(o, nodeLabel(o.nodeId), { review: item.review, expired: item.expired })}</p>
        {sum && <p className="body-sm text-text-subtle" data-testid="inspector-summary">{sum.sentence}</p>}
        {/* at most two actions in the first view; everything else is one click away under «بیشتر» */}
        <div className="flex flex-wrap gap-inline-xs" data-testid="inspector-actions">
          {item.review ? <Button size="sm" variant="secondary" onClick={() => void p.onAcceptReview(o.id)}>بدون تغییر بپذیر</Button> : p.onLineage ? <Button size="sm" variant="secondary" iconStart="Workflow" onClick={() => p.onLineage!(o.id)}>دور این مورد</Button> : moveBtn}
          <Button size="sm" variant="secondary" onClick={() => p.onOpenObject(o)}>باز کردن</Button>
        </div>
        {inf && <InfluencePanel compact influence={inf} nodes={p.nodes} onOpenObject={p.onOpenObject} onOpenAssets={p.onOpenAssets} />}
        <DetailSection title="منشأ" count={0}>
          <ProvenanceList
            provenance={provenanceOf({ objectId: o.id, objects: p.objects, relationships: p.relationships, notes: p.notes ?? [], deliverables: p.deliverables })}
            onOpen={(l) => { const t = l.target; if (!t) return; if (t.type === 'object') { const it = scene.items.find((i) => i.objectId === t.objectId); if (it) p.onSelect(it.id); else { const ob = p.objects.find((x) => x.id === t.objectId); if (ob) p.onOpenObject(ob); } } else if (t.type === 'note') p.onOpenNote?.(t.noteId, t.nodeId); else p.onOpenAssets(); }}
          />
        </DetailSection>
        <DetailSection title="بیشتر" count={0}>
          <p className="body-md whitespace-pre-wrap text-text-default">{o.content.length > 400 ? `${o.content.slice(0, 400)}…` : o.content}</p>
          <div className="flex flex-wrap items-center gap-inline-xs"><TypeBadge value={o.type} /><StatusBadge value={o.status} />{item.assumption && <Badge intent="neutral" icon={false}>فرض</Badge>}{item.expired && <Badge intent="neutral" icon={false}>منقضی</Badge>}</div>
          <div className="flex flex-wrap gap-inline-xs">
            {(item.review || p.onLineage) && moveBtn}
            {item.review && p.onLineage && <Button size="sm" variant="secondary" iconStart="Workflow" onClick={() => p.onLineage!(o.id)}>دور این مورد</Button>}
            {p.placed && p.onUnplace ? <Button size="sm" variant="ghost" onClick={() => p.onUnplace!(o.id)}>از بوم فکر بردار</Button> : p.onPlace && scene.layout !== 'free' ? <Button size="sm" variant="ghost" onClick={() => p.onPlace!(o.id)}>بگذار در بوم فکر</Button> : null}
          </div>
        </DetailSection>
      </div>
    );
  }
  if (item.kind === 'node') return (
    <div className="flex flex-col gap-stack-sm"><span className="label-sm text-text-subtle">گره</span><h3 className="heading-xs text-text-default">{item.label}</h3><p className="body-sm text-text-subtle">{formatNumber(item.count ?? 0)} مورد در این گره؛ یک جعبهٔ دامنه است و ترتیب ندارد.</p></div>
  );
  if (item.kind === 'note') return (
    <div className="flex flex-col gap-stack-sm"><span className="label-sm text-text-subtle">یادداشت آزاد</span><p className="body-md whitespace-pre-wrap text-text-default">{item.summary}</p><p className="body-sm text-text-subtle">یادداشت دانش نیست و به AI داده نمی‌شود.</p></div>
  );
  return (
    <div className="flex flex-col gap-stack-sm"><span className="label-sm text-text-subtle">{item.kind === 'assets' ? 'خروجی‌ها' : 'خروجی'}</span><h3 className="heading-xs text-text-default">{item.label}</h3>{item.review && <Caution>نیاز به بازبینی</Caution>}<p className="body-sm text-text-subtle">{item.kind === 'assets' ? `${formatNumber(item.count ?? 0)} خروجی (برای خوانایی یک‌جا جمع شده‌اند).` : 'خروجی ساخته‌شده از Context؛ با تغییر Context قدیمی می‌شود.'}</p><div><Button size="sm" variant="secondary" onClick={p.onOpenAssets}>باز کردن</Button></div></div>
  );
};
