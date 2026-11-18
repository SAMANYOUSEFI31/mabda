/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defaultNodeId } from '../../core/nodeTree';
import React, { useRef, useState } from 'react';
import type { StoredFile, TreeNode } from '../../types';
import type { FileChargeInfo, FileQuotaInfo } from '../../types/state';
import { flatten, treeIndent } from '../../core/nodeTree';
import { useAiStatus } from '../../services/aiStatus';
import { DangerDialog } from '../shared/Removal';
import { Alert, Badge, Button, Card, EmptyState, IconButton, Progress, Select, formatNumber } from '../../ui';

interface Props {
  files: StoredFile[];
  nodes: TreeNode[];
  quota: FileQuotaInfo | null;
  onUpload: (file: File, nodeId: string) => Promise<{ file: StoredFile; charge: FileChargeInfo; policy: 'ok' | 'blocked' } | undefined>;
  onProcess: (fileId: string) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
  /** a file with no section gets one (NEW-05) */
  onMove: (fileId: string, nodeId: string) => Promise<void>;
}

const STATUS: Record<StoredFile['status'], { label: string; intent: 'neutral' | 'info' | 'success' | 'danger' }> = {
  uploaded: { label: 'در انتظار پردازش', intent: 'neutral' },
  processing: { label: 'در حال پردازش', intent: 'info' },
  ready: { label: 'آماده', intent: 'success' },
  failed: { label: 'ناموفق', intent: 'danger' },
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${formatNumber(Math.round((n / 1024 / 1024) * 10) / 10)} مگابایت` : `${formatNumber(Math.max(1, Math.round(n / 1024)))} کیلوبایت`);

/** Upload txt / md / pdf / docx (≤ 25MB). Processed once on the cheap tier: summary, Proposed objects, ~800-token chunks. */
export const FilesPanel: React.FC<Props> = ({ files, nodes, quota, onUpload, onProcess, onDelete, onMove }) => {
  const ai = useAiStatus();
  const managed = ai.managedEnabled;
  const [blocked, setBlocked] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredFile | null>(null);
  const [nodeId, setNodeId] = useState(() => defaultNodeId(nodes));
  const [busy, setBusy] = useState<string | null>(null);
  const nodeOptions = flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${treeIndent(depth)}${node.label}` }));
  const nodeLabel = (id?: string) => (id ? nodes.find((n) => n.id === id)?.label : undefined);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try { await fn(); } finally { setBusy(null); }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (input.current) input.current.value = '';
    await run('upload', async () => {
      const r = await onUpload(f, nodeId);
      if (!r) return;
      setBlocked(null);
      if (!managed) return; // processing is Mabda's own AI: frozen with MABDA_MANAGED_AI off, the file is only stored
      if (r.policy === 'blocked') setBlocked(`«${r.file.name}» از سهمیهٔ ماهانهٔ پردازش فایل بیشتر است؛ ماه بعد ادامه بده.`);
      else await run(r.file.id, () => onProcess(r.file.id));
    });
  };

  const used = quota?.used ?? 0;
  const total = quota?.quota ?? 0;

  return (
    <Card padding="xl" className="flex flex-col gap-stack-lg">
      <div className="flex flex-col justify-between gap-inline-md sm:flex-row sm:items-start">
        <div className="flex flex-col gap-stack-xs">
          <h2 className="heading-sm text-text-default">فایل‌ها</h2>
          <p className="body-sm text-text-subtle">
            {managed ? 'txt، md، pdf و docx تا ۲۵ مگابایت. هر فایل یک‌بار پردازش می‌شود (خلاصه، دانش پیشنهادی، قطعه‌ها) و فقط قطعه‌های مرتبط با پرسش به مدل می‌رسند.' : 'txt، md، pdf و docx تا ۲۵ مگابایت. فایل‌ها کنار دانشت نگه داشته می‌شوند.'}
          </p>
        </div>
        <div className="flex flex-col gap-inline-sm sm:flex-row sm:items-end">
          <div className="sm:w-overlay-xs">
            <Select label="محل در درخت" value={nodeId} onChange={(e) => setNodeId(e.target.value)} options={nodeOptions} />
          </div>
          <input ref={input} type="file" accept=".txt,.md,.pdf,.docx" className="sr-only" aria-label="انتخاب فایل" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="secondary" iconStart="Upload" loading={busy === 'upload'} onClick={() => input.current?.click()}>بارگذاری فایل</Button>
        </div>
      </div>

      {blocked && <Alert intent="warning" title="سهمیهٔ فایل پر است">{blocked}</Alert>}

      {managed && quota && (
        <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
          <Progress value={Math.min(used, total)} max={total} label="سهمیهٔ پردازش فایل این ماه" showValue={false} intent={used >= total ? 'warning' : 'neutral'} />
          <span className="body-sm text-text-subtle">
            {formatNumber(used)} از {formatNumber(total)} توکن مصرف شده است. سهمیه هر ماه تازه می‌شود.
          </span>
        </div>
      )}

      {files.length === 0 ? (
        // the upload button is right above; an empty file list is one quiet line, not a third empty state on the page
        <p className="body-sm text-text-subtle">هنوز فایلی نگذاشته‌ای.</p>
      ) : (
        <ul className="flex flex-col gap-stack-sm" aria-label="فایل‌های بارگذاری‌شده">
          {files.map((f) => (
            <li key={f.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-raised p-inset-md">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <div className="flex min-w-space-0 flex-wrap items-center gap-inline-sm">
                  <span className="label-md text-text-default">{f.name}</span>
                  {managed && <Badge icon={false}>{STATUS[f.status].label}</Badge>}
                  <span className="body-sm text-text-subtle">{nodeLabel(f.nodeId) ? `${nodeLabel(f.nodeId)} · ` : ''}{kb(f.sizeBytes)}{managed ? ` · حدود ${formatNumber(f.tokens)} توکن${f.chunkCount ? ` · ${formatNumber(f.chunkCount)} قطعه` : ''}` : ''}</span>
                </div>
                <div className="flex items-center gap-inline-xs">
                  {managed && (f.status === 'uploaded' || f.status === 'failed') && (
                    <Button size="sm" variant="secondary" iconStart="FolderInput" loading={busy === f.id} onClick={() => run(f.id, () => onProcess(f.id))}>
                      {f.status === 'failed' ? 'دوباره' : 'پردازش'}
                    </Button>
                  )}
                  <IconButton icon="Trash2" label={`حذف ${f.name}`} size="sm" onClick={() => setPendingDelete(f)} />
                </div>
              </div>
              {!nodeLabel(f.nodeId) && (
                // a file with no living section is not in any section's list: it says so here and gets one in one step (NEW-05)
                <div className="flex flex-wrap items-end gap-inline-sm">
                  <Select label="این فایل در هیچ بخشی نیست؛ بگذارش در" placeholder="یک بخش انتخاب کن" value="" options={nodeOptions} disabled={busy === f.id} onChange={(e) => { const to = e.target.value; if (to) void run(f.id, () => onMove(f.id, to)); }} />
                </div>
              )}
              {f.summary && <p className="body-sm whitespace-pre-wrap text-text-default">{f.summary}</p>}
              {f.error && <Alert intent="danger">{f.error}</Alert>}
            </li>
          ))}
        </ul>
      )}

      <DangerDialog
        open={!!pendingDelete} onClose={() => setPendingDelete(null)} title={`حذف «${pendingDelete?.name ?? ''}»`}
        description="فایل و متن پردازش‌شده‌اش پاک می‌شود. دانشی که از آن ساخته شده می‌ماند و منبعش را نگه می‌دارد. این کار برنمی‌گردد؛ اگر لازم شد دوباره بارگذاری کن."
        confirmLabel="حذف فایل"
        onConfirm={async () => { const f = pendingDelete; if (!f) return; setPendingDelete(null); await run(f.id, () => onDelete(f.id)); }}
      />
    </Card>
  );
};
