/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClosedSection } from './ClosedSection';
import type { ContextObject, GeneratedDeliverable, TreeNode } from '../types';
import type { Influence } from '../core/influence';
import { Badge, OriginBadge, StatusBadge, TypeBadge, formatNumber } from '../ui';

interface Props {
  influence: Influence;
  nodes: TreeNode[];
  onOpenObject?: (o: ContextObject) => void;
  onOpenAssets?: () => void;
  /** the inspector's version: every group is a CLOSED section in plain words (the full panel stays in the detail dialog) */
  compact?: boolean;
}

const Row: React.FC<{ o: ContextObject; extra?: React.ReactNode; onOpen?: (o: ContextObject) => void }> = ({ o, extra, onOpen }) => (
  <li className="flex flex-wrap items-center justify-between gap-inline-sm">
    {onOpen ? <button type="button" className="body-md inline-flex min-h-touch-comfortable items-center text-start text-text-default underline-offset-2 hover:underline" onClick={() => onOpen(o)}>{o.title}</button> : <span className="body-md text-text-default">{o.title}</span>}
    <span className="flex flex-wrap items-center gap-inline-xs">{extra}<TypeBadge value={o.type} /><StatusBadge value={o.status} /></span>
  </li>
);
const Group: React.FC<{ title: string; empty: string; count: number; children: React.ReactNode }> = ({ title, empty, count, children }) => (
  <div className="flex flex-col gap-stack-xs">
    <h4 className="label-md text-text-default">{title}</h4>
    {count === 0 ? <p className="body-sm text-text-subtle">{empty}</p> : <ul className="flex flex-col gap-stack-xs">{children}</ul>}
  </div>
);

/** «اثرگذاران و اثرپذیران»: above = what shapes this object, below = what it shapes. Built from effectiveFor + decisionGraph only. */
export const Closed = ClosedSection;

export const InfluencePanel: React.FC<Props> = ({ influence, nodes, onOpenObject, onOpenAssets, compact }) => {
  const { shapedBy, shapes } = influence;
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  if (compact) {
    return (
      <div className="flex flex-col gap-stack-xs" role="region" aria-label="جزئیات اثرگذاری" data-testid="inspector-details">
        <Closed title="به چه چیزی وابسته است" count={shapedBy.dependencies.length}>
          {shapedBy.dependencies.length ? <ul className="flex flex-col gap-stack-xs">{shapedBy.dependencies.map((o) => <Row key={o.id} o={o} onOpen={onOpenObject} />)}</ul> : <p className="body-sm text-text-subtle">به مورد دیگری وابسته نیست.</p>}
        </Closed>
        <Closed title="خط قرمزهایی که اینجا اعمال می‌شوند" count={shapedBy.constraints.length}>
          {shapedBy.constraints.length ? <ul className="flex flex-col gap-stack-xs">{shapedBy.constraints.map((c) => <Row key={c.object.id} o={c.object} onOpen={onOpenObject} extra={<OriginBadge value={c.origin} />} />)}</ul> : <p className="body-sm text-text-subtle">خط قرمزی در این بخش اثر ندارد.</p>}
        </Closed>
        <Closed title="اینجا اعمال نشود" count={shapedBy.exceptions.length}>
          {shapedBy.exceptions.length ? <ul className="flex flex-col gap-stack-xs">{shapedBy.exceptions.map((e) => (
            <li key={`${e.by.id}>${e.target.id}`} className="body-md text-text-default">
              {e.role === 'overrides' ? <>این مورد «{e.target.title}» را برای بخش خودش و زیربخش‌ها کنار می‌گذارد.</> : <>«{e.by.title}» آن را برای یک بخش پایین‌تر کنار می‌گذارد.</>}
            </li>
          ))}</ul> : <p className="body-sm text-text-subtle">جایی نیست که اعمال نشود.</p>}
        </Closed>
        <Closed title="آنچه از بخش بالاتر آمده" count={shapedBy.inputs.length}>
          {shapedBy.inputs.length ? <ul className="flex flex-col gap-stack-xs">{shapedBy.inputs.map((c) => <Row key={c.object.id} o={c.object} onOpen={onOpenObject} extra={<OriginBadge value={c.origin} />} />)}</ul> : <p className="body-sm text-text-subtle">چیزی از بخش‌های بالاتر نرسیده.</p>}
        </Closed>
        <Closed title="چه چیزی روی آن سوار است" count={shapes.dependents.length}>
          {shapes.dependents.length ? <ul className="flex flex-col gap-stack-xs">{shapes.dependents.map((o) => <Row key={o.id} o={o} onOpen={onOpenObject} />)}</ul> : <p className="body-sm text-text-subtle">چیزی روی آن سوار نیست.</p>}
        </Closed>
        <Closed title="خروجی‌های ساخته‌شده از آن" count={shapes.assets.length}>
          {shapes.assets.length ? <ul className="flex flex-col gap-stack-xs">{shapes.assets.map((d: GeneratedDeliverable) => (
            <li key={d.id} className="flex items-center justify-between gap-inline-sm">
              <span className="body-md text-text-default">{d.title}</span>
              {onOpenAssets && <button type="button" className="caption inline-flex min-h-touch-comfortable items-center text-text-subtle underline-offset-2 hover:underline" onClick={onOpenAssets}>خروجی‌ها</button>}
            </li>
          ))}</ul> : <p className="body-sm text-text-subtle">خروجی‌ای از آن ساخته نشده.</p>}
        </Closed>
      </div>
    );
  }
  const scopeText = shapes.scope.kind === 'global'
    ? 'در همهٔ گره‌ها اثر دارد'
    : shapes.scope.nodeIds.length === 1 ? `فقط در «${label(shapes.scope.nodeIds[0])}»` : `در ${formatNumber(shapes.scope.nodeIds.length)} گره: ${shapes.scope.nodeIds.slice(0, 4).map(label).join('، ')}${shapes.scope.nodeIds.length > 4 ? '…' : ''}`;
  return (
    <div className="flex flex-col gap-stack-lg" role="region" aria-label="اثرگذاران و اثرپذیران">
      <section className="flex flex-col gap-stack-md rounded-control border border-border-default p-inset-lg" aria-label="اثرگذاران">
        <h3 className="heading-xs text-text-default">چه چیزی روی این اثر دارد؟</h3>
        <Group title="وابستگی‌ها" empty="به مورد دیگری وابسته نیست." count={shapedBy.dependencies.length}>
          {shapedBy.dependencies.map((o) => <Row key={o.id} o={o} onOpen={onOpenObject} />)}
        </Group>
        <Group title="خط قرمزهای مؤثر در این گره" empty="خط قرمزی در این گره اثر ندارد." count={shapedBy.constraints.length}>
          {shapedBy.constraints.map((c) => <Row key={c.object.id} o={c.object} onOpen={onOpenObject} extra={<OriginBadge value={c.origin} />} />)}
        </Group>
        <Group title="جاهایی که اعمال نمی‌شود" empty="جایی نیست که اعمال نشود." count={shapedBy.exceptions.length}>
          {shapedBy.exceptions.map((e) => (
            <li key={`${e.by.id}>${e.target.id}`} className="body-md text-text-default">
              {e.role === 'overrides' ? <>این مورد «{e.target.title}» را برای گرهٔ خودش و زیرشاخه‌ها کنار می‌گذارد.</> : <>«{e.by.title}» آن را برای گره‌ای پایین‌تر کنار گذاشته است.</>}
            </li>
          ))}
        </Group>
        <Group title="ورودی‌های اصلی (از بخش بالاتر آمده)" empty="چیزی از گره‌های بالاتر نرسیده." count={shapedBy.inputs.length}>
          {shapedBy.inputs.map((c) => <Row key={c.object.id} o={c.object} onOpen={onOpenObject} extra={<OriginBadge value={c.origin} />} />)}
        </Group>
      </section>

      <section className="flex flex-col gap-stack-md rounded-control border border-border-default p-inset-lg" aria-label="اثرپذیران">
        <h3 className="heading-xs text-text-default">چه چیزی از این اثر می‌گیرد؟</h3>
        <p className="body-sm text-text-subtle"><Badge intent="neutral" icon={false}>محدوده</Badge> {scopeText}.{shapes.scope.exceptNodeIds.length > 0 ? ` (به‌جز ${shapes.scope.exceptNodeIds.slice(0, 3).map(label).join('، ')}${shapes.scope.exceptNodeIds.length > 3 ? '…' : ''} که این‌جا اعمال نمی‌شود)` : ''}</p>
        <Group title="تصمیم‌هایی که روی آن سوارند" empty="چیزی روی آن سوار نیست." count={shapes.dependents.length}>
          {shapes.dependents.map((o) => <Row key={o.id} o={o} onOpen={onOpenObject} />)}
        </Group>
        <Group title="خروجی‌های ساخته‌شده از آن" empty="خروجی‌ای از آن (یا از وابسته‌هایش) ساخته نشده." count={shapes.assets.length}>
          {shapes.assets.map((d: GeneratedDeliverable) => (
            <li key={d.id} className="flex items-center justify-between gap-inline-sm">
              <span className="body-md text-text-default">{d.title}</span>
              {onOpenAssets && <button type="button" className="caption inline-flex min-h-touch-comfortable items-center text-text-subtle underline-offset-2 hover:underline" onClick={onOpenAssets}>دارایی‌ها</button>}
            </li>
          ))}
        </Group>
      </section>
    </div>
  );
};
