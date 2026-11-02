/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { Workspace } from '../types';
import { LIBRARY, currentSpecIds } from '../core/specs';
import { dataApi } from '../services/dataApi';
import { Badge, Button, Dialog, Select, formatNumber } from '../ui';

interface Props {
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  /** the full list of library workstream ids this workspace should show */
  onChange: (ids: string[]) => Promise<void>;
  /** the user's own templates (saved from a node or a custom workstream): bring one into this workspace */
  onApplyTemplate: (templateId: string, parentId?: string) => Promise<void>;
  nodes: Array<{ id: string; label: string }>;
}

/** The library of ready-made workstreams. A workspace shows only the ones it took from here (plus its own). Removing one only hides it: outputs already built stay in «دارایی‌ها». */
export const SpecLibraryDialog: React.FC<Props> = ({ open, workspace, onClose, onChange, onApplyTemplate, nodes }) => {
  const [templates, setTemplates] = useState<Array<{ id: string; kind: 'node' | 'workstream'; name: string }>>([]);
  const [parent, setParent] = useState('business');
  useEffect(() => { if (open) dataApi.listTemplates().then((r) => setTemplates(r.templates)).catch(() => setTemplates([])); }, [open]);
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
        {LIBRARY.map((s) => {
          const on = ids.includes(s.id);
          return (
            <div key={s.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="label-md text-text-default">{s.title}</span>
                {on && <Badge intent="success" icon="Check">در این فضا</Badge>}
              </div>
              <p className="body-sm text-text-subtle">{s.description} · {formatNumber(s.deliverables.length)} خروجی</p>
              {s.reference && <p className="caption text-text-subtle">منبع: {s.reference}</p>}
              <div>
                <Button variant="secondary" size="sm" iconStart={on ? 'Minus' : 'Plus'} loading={busy === s.id} onClick={() => toggle(s.id)}>{on ? 'حذف از این فضا' : 'افزودن به این فضا'}</Button>
              </div>
            </div>
          );
        })}
        <section className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg" aria-label="قالب‌های من">
          <h3 className="label-md text-text-default">قالب‌های من</h3>
          {templates.length === 0 ? <p className="body-sm text-text-subtle">هنوز قالبی نساخته‌ای: از منوی هر گره «ذخیره به‌عنوان قالب» را بزن.</p> : (
            <>
              <Select label="گره‌های قالب زیر کدام گره بیایند؟" value={parent} onChange={(e) => setParent(e.target.value)} options={nodes.map((n) => ({ value: n.id, label: n.label }))} />
              {templates.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control border border-border-default p-inset-lg">
                  <span className="label-md text-text-default">{t.name} <Badge intent="neutral" icon={false}>{t.kind === 'node' ? 'گره' : 'جریان کار'}</Badge></span>
                  <span className="flex gap-inline-xs">
                    <Button size="sm" variant="secondary" iconStart="Plus" loading={busy === t.id} onClick={async () => { setBusy(t.id); try { await onApplyTemplate(t.id, parent); } finally { setBusy(null); } }}>افزودن به این فضا</Button>
                    <Button size="sm" variant="ghost" iconStart="Trash2" aria-label={`حذف قالب ${t.name}`} onClick={async () => { await dataApi.deleteTemplate(t.id); setTemplates((l) => l.filter((x) => x.id !== t.id)); }}>حذف</Button>
                  </span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
};
