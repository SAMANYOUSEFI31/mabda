/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TreeNode } from '../../types';
import React, { useState } from 'react';
import { MyTemplates } from '../structure/MyTemplates';
import type { Workspace } from '../../types';
import { LIBRARY, currentSpecIds, specFits } from '../../core/specs';
import { Badge, Button, Dialog, formatNumber } from '../../ui';

interface Props {
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  /** the full list of library workstream ids this workspace should show */
  onChange: (ids: string[]) => Promise<void>;
  /** the user's own templates (saved from a node or a custom workstream): bring one into this workspace */
  onApplyTemplate: (templateId: string, parentId?: string) => Promise<void>;
  nodes: TreeNode[];
}

/** The library of ready-made workstreams. A workspace shows only the ones it took from here (plus its own). Removing one only hides it: outputs already built stay in «دارایی‌ها». */
export const SpecLibraryDialog: React.FC<Props> = ({ open, workspace, onClose, onChange, onApplyTemplate, nodes }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const ids = currentSpecIds(workspace);
  const toggle = async (id: string) => {
    setBusy(id);
    try { await onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]); } finally { setBusy(null); }
  };
  const row = (s: (typeof LIBRARY)[number]) => {
    const on = ids.includes(s.id);
    return (
      <div key={s.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
        <div className="flex flex-wrap items-center justify-between gap-inline-sm">
          <span className="label-md text-text-default">{s.title}</span>
          {on && <Badge icon="Check">در این فضا</Badge>}
        </div>
        <p className="body-sm text-text-subtle">{s.description} · {formatNumber(s.deliverables.length)} خروجی</p>
        {s.reference && <p className="caption text-text-subtle">منبع: {s.reference}</p>}
        <div>
          <Button variant="secondary" size="sm" iconStart={on ? 'Minus' : 'Plus'} loading={busy === s.id} onClick={() => toggle(s.id)}>{on ? 'حذف از این فضا' : 'افزودن به این فضا'}</Button>
        </div>
      </div>
    );
  };
  const fitting = LIBRARY.filter((s) => specFits(s, workspace.purpose));
  const others = LIBRARY.filter((s) => !specFits(s, workspace.purpose));
  return (
    <Dialog open={open} onClose={onClose} size="md" title="کتابخانهٔ جریان‌های کار" footer={<Button variant="primary" onClick={onClose}>بستن</Button>}>
      <div className="flex flex-col gap-stack-md">
        <p className="body-sm text-text-subtle">جریان‌های آماده؛ هر فضا فقط آن‌هایی را نشان می‌دهد که از اینجا برداشته. حذف فقط پنهانش می‌کند و دارایی‌های ساخته‌شده می‌مانند.</p>
        {fitting.map(row)}
        {others.length > 0 && (
          <section className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg" aria-label="برای کار و کسب‌وکار">
            <h3 className="label-md text-text-default">برای کار و کسب‌وکار</h3>
            <p className="body-sm text-text-subtle">برای فضا نوشته شده‌اند؛ اگر به کارت می‌آیند، اینجا هم می‌شود برداشت.</p>
            {others.map(row)}
          </section>
        )}
        <MyTemplates open={open} workspaceId={workspace.id} nodes={nodes} onApplyTemplate={onApplyTemplate} kinds={['node', 'workstream']} />
      </div>
    </Dialog>
  );
};
