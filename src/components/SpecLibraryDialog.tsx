/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { Workspace } from '../types';
import { WORKSTREAM_SPECS, currentSpecIds } from '../core/specs';
import { Badge, Button, Dialog, formatNumber } from '../ui';

interface Props {
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  /** the full list of library workstream ids this workspace should show */
  onChange: (ids: string[]) => Promise<void>;
}

/** The library of ready-made workstreams. A workspace shows only the ones it took from here (plus its own). Removing one only hides it: outputs already built stay in «دارایی‌ها». */
export const SpecLibraryDialog: React.FC<Props> = ({ open, workspace, onClose, onChange }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const ids = currentSpecIds(workspace);
  const toggle = async (id: string) => {
    setBusy(id);
    try { await onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]); } finally { setBusy(null); }
  };
  return (
    <Dialog open={open} onClose={onClose} size="md" title="کتابخانهٔ جریان‌های کار" footer={<Button variant="primary" onClick={onClose}>بستن</Button>}>
      <div className="flex flex-col gap-stack-md">
        <p className="body-sm text-text-subtle">جریان‌های آماده؛ هر فضا فقط آن‌هایی را نشان می‌دهد که از اینجا برداشته. حذف فقط پنهانش می‌کند و دارایی‌های ساخته‌شده می‌مانند.</p>
        {WORKSTREAM_SPECS.map((s) => {
          const on = ids.includes(s.id);
          return (
            <div key={s.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="label-md text-text-default">{s.title}</span>
                {on && <Badge intent="success" icon="Check">در این فضا</Badge>}
              </div>
              <p className="body-sm text-text-subtle">{s.description} · {formatNumber(s.deliverables.length)} خروجی</p>
              <div>
                <Button variant="secondary" size="sm" iconStart={on ? 'Minus' : 'Plus'} loading={busy === s.id} onClick={() => toggle(s.id)}>{on ? 'حذف از این فضا' : 'افزودن به این فضا'}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
};
