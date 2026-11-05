/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { Contradiction, ContextObject, TreeNode } from '../types';
import { flatten } from '../core/nodeTree';
import { Badge, Button, Card, Select, StatusBadge, TypeBadge, formatNumber } from '../ui';

interface Props {
  contradictions: Contradiction[];
  nodes: TreeNode[];
  onKeep: (c: Contradiction, keepId: string) => Promise<void>;
  onSeparate: (c: Contradiction, moveId: string, nodeId: string) => Promise<void>;
  /** semantic check (needs an AI key and a plan with it): the button and the quiet daily meter. Absent = not available. */
  check?: { busy: boolean; onCheck: () => void; used: number | null; cap: number };
}

/**
 * Resolve a conflict with the two claims side by side. Two ways out, neither deletes anything:
 *   «این را نگه دار»  → the other becomes «جایگزین‌شده» (history stays)
 *   «هر دو درست‌اند» → move one claim to another node so they stop competing
 */
const CheckBar: React.FC<{ check: NonNullable<Props['check']> }> = ({ check }) => (
  <div className="flex flex-wrap items-center justify-between gap-inline-md">
    <span className="body-sm text-text-subtle">
      {check.used === null ? '' : `${formatNumber(check.used)} قضاوت امروز از سقف ${formatNumber(check.cap)}`}
    </span>
    <Button variant="secondary" size="sm" iconStart="Search" loading={check.busy} onClick={check.onCheck}>بررسی تناقض</Button>
  </div>
);

export const ContradictionPanel: React.FC<Props> = ({ contradictions, nodes, onKeep, onSeparate, check }) => {
  if (contradictions.length === 0) {
    return check ? <Card padding="lg" id="contradictions" aria-label="تناقض‌ها"><CheckBar check={check} /></Card> : null;
  }
  return (
    <Card padding="xl" id="contradictions" className="flex flex-col gap-stack-lg" aria-label="تناقض‌ها">
      <div className="flex flex-col gap-stack-xs border-b border-border-default pb-inset-lg">
        <div className="flex items-center gap-inline-sm">
          <h2 className="heading-sm text-text-default">تناقض‌ها</h2>
          <Badge intent="warning" icon="TriangleAlert">{formatNumber(contradictions.length)} مورد</Badge>
        </div>
        <p className="body-sm text-text-subtle">دو مورد با هم نمی‌خوانند. یکی را نگه دار تا دیگری «جایگزین‌شده» شود، یا اگر هر دو درست‌اند آن‌ها را در گره‌های جدا بگذار. چیزی پاک نمی‌شود.</p>
      </div>
      {check && <CheckBar check={check} />}
      {contradictions.map((c) => <Pair key={c.id} c={c} nodes={nodes} onKeep={onKeep} onSeparate={onSeparate} />)}
    </Card>
  );
};

const Pair: React.FC<{ c: Contradiction; nodes: TreeNode[]; onKeep: Props['onKeep']; onSeparate: Props['onSeparate'] }> = ({ c, nodes, onKeep, onSeparate }) => {
  const [moveId, setMoveId] = useState(c.itemB.id);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const moving = moveId === c.itemA.id ? c.itemA : c.itemB;
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const column = (o: ContextObject, ordinal: string) => (
    <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <span className="label-md text-text-default">{ordinal}: {o.title}</span>
        <span className="flex items-center gap-inline-xs"><TypeBadge value={o.type} /><StatusBadge value={o.status} /></span>
      </div>
      <span className="body-sm text-text-subtle">گره: {label(o.nodeId)} · نسخهٔ {formatNumber(o.version)}</span>
      <p className="body-md text-text-default">{o.content}</p>
      <div className="mt-stack-xs">
        <Button variant="secondary" size="sm" fullWidth iconStart="Check" loading={busy === `keep:${o.id}`} onClick={() => run(`keep:${o.id}`, () => onKeep(c, o.id))}>این را نگه دار</Button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-stack-md rounded-control border border-border-default p-inset-lg">
      <p className="label-md text-text-default">{c.reason}</p>
      <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">
        {column(c.itemA, 'مورد اول')}
        {column(c.itemB, 'مورد دوم')}
      </div>
      <div className="flex flex-col gap-inline-sm border-t border-border-subtle pt-inset-md lg:flex-row lg:items-end">
        <span className="label-md text-text-default lg:pb-inset-sm">هر دو درست‌اند؟</span>
        <div className="lg:flex-1">
          <Select label="کدام را جابه‌جا کنیم" value={moveId} onChange={(e) => setMoveId(e.target.value)} options={[{ value: c.itemA.id, label: c.itemA.title }, { value: c.itemB.id, label: c.itemB.title }]} />
        </div>
        <div className="lg:flex-1">
          <Select label="به این گره" value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: '', label: 'انتخاب کن…' }, ...flatten(nodes).filter(({ node }) => node.id !== moving.nodeId).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }))]} />
        </div>
        <Button variant="secondary" iconStart="Network" disabled={!target} loading={busy === 'sep'} onClick={() => run('sep', () => onSeparate(c, moveId, target))}>گره‌ها را جدا کن</Button>
      </div>
    </div>
  );
};
