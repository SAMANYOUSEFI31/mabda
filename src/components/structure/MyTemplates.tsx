/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * «قالب‌های من»: a section saved as a template («ذخیره به‌عنوان قالب») and brought into a space again. It lived in the workstream
 * library; that library is not a place any more (docs/product-scope.md), so it sits with «اسکلت شروع», the other way to start a
 * tree. A saved workstream template stays stored (the workshop is frozen, not deleted) and is listed only where `kinds` asks.
 */

import type { TreeNode } from '../../types';
import React, { useEffect, useState } from 'react';
import { dataApi } from '../../services/dataApi';
import { Badge, Button, useToast } from '../../ui';
import { NodePickerField } from './NodePicker';

interface Props {
  open: boolean;
  workspaceId: string;
  nodes: TreeNode[];
  onApplyTemplate: (templateId: string, parentId?: string) => Promise<void>;
  kinds?: Array<'node' | 'workstream'>;
}

export const MyTemplates: React.FC<Props> = ({ open, workspaceId, nodes, onApplyTemplate, kinds = ['node'] }) => {
  const [templates, setTemplates] = useState<Array<{ id: string; kind: 'node' | 'workstream'; name: string }>>([]);
  const [parent, setParent] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => { if (open) dataApi.listTemplates().then((r) => setTemplates(r.templates)).catch(() => setTemplates([])); }, [open]);
  const shown = templates.filter((t) => kinds.includes(t.kind));
  return (
    <section className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg" aria-label="قالب‌های من">
      <h3 className="label-md text-text-default">قالب‌های من</h3>
      {shown.length === 0 ? <p className="body-sm text-text-subtle">هنوز قالبی نساخته‌ای: از منوی هر بخش «ذخیره به‌عنوان قالب» را بزن.</p> : (
        <>
          <NodePickerField label="بخش‌های قالب زیر کدام بخش بیایند؟" nodes={nodes} value={parent || (nodes[0]?.id ?? '')} onChange={setParent} />
          {shown.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control border border-border-default p-inset-lg">
              <span className="label-md text-text-default">{t.name}{kinds.length > 1 && <> <Badge intent="neutral" icon={false}>{t.kind === 'node' ? 'بخش' : 'جریان کار'}</Badge></>}</span>
              <span className="flex gap-inline-xs">
                <Button size="sm" variant="secondary" iconStart="Plus" loading={busy === t.id} onClick={async () => { setBusy(t.id); try { await onApplyTemplate(t.id, parent || undefined); } finally { setBusy(null); } }}>افزودن به این فضا</Button>
                <Button size="sm" variant="ghost" iconStart="Trash2" aria-label={`حذف قالب ${t.name}`} onClick={async () => { const r = await dataApi.deleteTemplate(t.id); setTemplates((l) => l.filter((x) => x.id !== t.id)); const gone = r.template; toast.show({ intent: 'success', message: `قالب «${t.name}» حذف شد.`, duration: 10000, ...(gone ? { action: { label: 'واگرد', onClick: () => { void dataApi.restoreTemplate(workspaceId, gone).then(() => dataApi.listTemplates()).then((x) => setTemplates(x.templates)); } } } : {}) }); }}>حذف</Button>
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
};
