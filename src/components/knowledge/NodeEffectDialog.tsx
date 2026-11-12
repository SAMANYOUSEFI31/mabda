/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import type { ContextObject, ContextRelationship, TreeNode } from '../../types';
import { ancestorIds } from '../../core/nodeTree';
import { effectiveFor, overrideProblem } from '../../core/effectiveContext';
import type { EffectiveItem } from '../../core/effectiveContext';
import { formatJalaliDate } from '../../ui';
import { Alert, Button, Dialog, EmptyState, OriginBadge, ReachBadge, Select, StatusBadge, Textarea, TypeBadge } from '../../ui';

interface Props {
  nodeId: string | null;
  nodes: TreeNode[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  onClose: () => void;
  /** `byId` (an object of THIS node) sets `targetId` (an object above) aside for this node and its sub-nodes */
  onOverride: (byId: string, targetId: string, reason: string) => Promise<void>;
  onRemoveOverride: (byId: string, targetId: string) => Promise<void>;
  onAddToNode: (nodeId: string) => void;
  onOpenObject: (o: ContextObject) => void;
}

/** «آنچه اینجا اثر دارد»: every rule and fact in force at a node — and why — with the one exception action. */
export const NodeEffectDialog: React.FC<Props> = (props) => (props.nodeId ? <Body {...props} nodeId={props.nodeId} /> : null);

const Body: React.FC<Props & { nodeId: string }> = ({ nodeId, nodes, objects, relationships, onClose, onOverride, onRemoveOverride, onAddToNode, onOpenObject }) => {
  const node = nodes.find((n) => n.id === nodeId);
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const title = (id: string) => objects.find((o) => o.id === id)?.title ?? id;
  const items = useMemo(() => effectiveFor(nodeId, objects, nodes, relationships, new Date()), [nodeId, objects, nodes, relationships]);
  const mine = objects.filter((o) => o.nodeId === nodeId && o.status !== 'Archived' && o.status !== 'Superseded');
  const [setAside, setSetAside] = useState<EffectiveItem | null>(null);
  const [by, setBy] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canSetAside = (i: EffectiveItem) => i.origin !== 'own' && (i.origin === 'inherited' || i.origin === 'global') && mine.some((m) => !overrideProblem(m, i.object, nodes));

  const submit = async () => {
    if (!setAside || !by || !reason.trim()) return;
    setBusy(true); setError('');
    try { await onOverride(by, setAside.object.id, reason.trim()); setSetAside(null); setReason(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'انجام نشد؛ دوباره.'); }
    finally { setBusy(false); }
  };
  const sections: Array<{ title: string; list: EffectiveItem[] }> = [
    { title: 'در این بخش اثر دارند', list: items.filter((i) => i.origin === 'own' || i.origin === 'inherited' || i.origin === 'global') },
    { title: 'اینجا اثر ندارند', list: items.filter((i) => i.origin === 'overridden' || i.origin === 'expired') },
  ];
  return (
    <Dialog open onClose={onClose} size="lg" title={`آنچه در «${node?.label ?? nodeId}» اثر دارد`} description="همان فهرستی که AI برای ساخت خروجی و گفتگوی این بخش می‌بیند. خط قرمز هر بخش فقط به همان بخش و زیرشاخه‌هایش می‌رسد." footer={<Button variant="secondary" onClick={onClose}>بستن</Button>}>
      <div className="flex flex-col gap-stack-lg">
        {items.length === 0 && <EmptyState title="هیچ خط قرمز یا دانشی روی این بخش اثر ندارد" />}
        {sections.filter((s) => s.list.length > 0).map((sec) => (
          <section key={sec.title} className="flex flex-col gap-stack-sm" aria-label={sec.title}>
            <h3 className="heading-xs text-text-default">{sec.title}</h3>
            {sec.list.map((i) => (
              <div key={i.object.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <button type="button" className="label-md text-start text-text-default underline-offset-2 hover:underline" onClick={() => onOpenObject(i.object)}>{i.object.title}</button>
                  <span className="flex flex-wrap items-center gap-inline-xs"><OriginBadge value={i.origin} /><TypeBadge value={i.object.type} /><ReachBadge object={i.object} /><StatusBadge value={i.object.status} /></span>
                </div>
                <p className="body-sm text-text-subtle">
                  {i.origin === 'own' ? 'ثبت‌شده در همین بخش.' : `از «${label(i.fromNodeId)}»${i.origin === 'global' ? ' (خط قرمز سراسری)' : ''}.`}
                  {i.origin === 'overridden' && i.overriddenBy ? ` کنار گذاشته شد با «${title(i.overriddenBy)}».` : ''}
                  {i.origin === 'expired' && i.object.validUntil ? ` تا ${formatJalaliDate(i.object.validUntil)} معتبر بود.` : ''}
                  {i.origin !== 'expired' && i.object.validUntil ? ` معتبر تا ${formatJalaliDate(i.object.validUntil)}.` : ''}
                </p>
                <p className="body-md line-clamp-2 text-text-default">{i.object.content}</p>
                {canSetAside(i) && <div><Button size="sm" variant="secondary" iconStart="Minus" onClick={() => { setSetAside(i); setBy(mine.find((m) => !overrideProblem(m, i.object, nodes))?.id ?? ''); setReason(''); setError(''); }}>برای این بخش کنار بگذار</Button></div>}
                {(i.origin === 'inherited' || i.origin === 'global') && !canSetAside(i) && mine.length === 0 && ancestorIds(nodes, nodeId).includes(i.object.nodeId) && <p className="caption text-text-subtle">برای کنار گذاشتنش اول در همین بخش یک تصمیم ثبت کن.</p>}
                {i.origin === 'overridden' && i.overriddenBy && <div><Button size="sm" variant="ghost" onClick={() => onRemoveOverride(i.overriddenBy!, i.object.id)}>برگردان</Button></div>}
              </div>
            ))}
          </section>
        ))}
        {mine.length === 0 && <div><Button size="sm" variant="ghost" iconStart="Plus" onClick={() => onAddToNode(nodeId)}>افزودن تصمیم به این بخش</Button></div>}
        {setAside && (
          <div className="flex flex-col gap-stack-sm rounded-control border border-border-selected p-inset-lg" role="group" aria-label="کنار گذاشتن برای این بخش">
            <p className="label-md text-text-default">«{setAside.object.title}» برای «{node?.label}» و زیرشاخه‌هایش کنار می‌رود. جای دیگر همچنان اثر دارد.</p>
            <Select label="با کدام مورد این بخش؟" value={by} onChange={(e) => setBy(e.target.value)} options={mine.filter((m) => !overrideProblem(m, setAside.object, nodes)).map((m) => ({ value: m.id, label: m.title }))} />
            <Textarea label="دلیل (لازم)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            {error && <Alert intent="danger">{error}</Alert>}
            <div className="flex flex-wrap gap-inline-sm"><Button variant="secondary" loading={busy} disabled={!by || !reason.trim()} onClick={submit}>کنار بگذار</Button><Button variant="ghost" onClick={() => setSetAside(null)}>انصراف</Button></div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
