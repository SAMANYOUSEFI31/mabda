/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defaultNodeId } from '../../core/nodeTree';
import React, { useRef, useState } from 'react';
import type { StoredFile, TreeNode } from '../../types';
import type { FileChargeInfo, FileQuotaInfo } from '../../types/state';
import { flatten } from '../../core/nodeTree';
import { useAiStatus } from '../../services/aiStatus';
import { DangerDialog } from '../shared/Removal';
import { Alert, Badge, Button, Card, Dialog, EmptyState, IconButton, Progress, Select, formatNumber } from '../../ui';

interface Props {
  files: StoredFile[];
  nodes: TreeNode[];
  quota: FileQuotaInfo | null;
  credits: number;
  onUpload: (file: File, nodeId: string) => Promise<{ file: StoredFile; charge: FileChargeInfo; policy: 'ok' | 'credits' | 'blocked' } | undefined>;
  onProcess: (fileId: string) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
}

const STATUS: Record<StoredFile['status'], { label: string; intent: 'neutral' | 'info' | 'success' | 'danger' }> = {
  uploaded: { label: 'در انتظار پردازش', intent: 'neutral' },
  processing: { label: 'در حال پردازش', intent: 'info' },
  ready: { label: 'آماده', intent: 'success' },
  failed: { label: 'ناموفق', intent: 'danger' },
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${formatNumber(Math.round((n / 1024 / 1024) * 10) / 10)} مگابایت` : `${formatNumber(Math.max(1, Math.round(n / 1024)))} کیلوبایت`);

/** Upload txt / md / pdf / docx (≤ 25MB). Processed once on the cheap tier: summary, Proposed objects, ~800-token chunks. */
export const FilesPanel: React.FC<Props> = ({ files, nodes, quota, credits, onUpload, onProcess, onDelete }) => {
  const ai = useAiStatus();
  const managed = ai.managedEnabled;
  const [blocked, setBlocked] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredFile | null>(null);
  const [nodeId, setNodeId] = useState(() => defaultNodeId(nodes));
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ file: StoredFile; charge: FileChargeInfo } | null>(null);

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
      if (r.policy === 'blocked') setBlocked(`«${r.file.name}» از سهمیهٔ ماهانهٔ پردازش فایل بیشتر است؛ ماه بعد ادامه بده یا پلن را ارتقا بده.`);
      else if (r.policy === 'credits') setConfirm(r);
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
            <Select label="محل در درخت" value={nodeId} onChange={(e) => setNodeId(e.target.value)} options={flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }))} />
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
            {formatNumber(used)} از {formatNumber(total)} توکن مصرف شده است. {managed ? 'بیش از سهمیه، هر ۲۰ هزار توکن ۲ اعتبار.' : 'سهمیه هر ماه تازه می‌شود.'}
          </span>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState icon="Upload" title="هنوز فایلی بارگذاری نشده" description={managed ? 'سند یا برندبوکت را بگذار تا مبدأ از آن دانش پیشنهادی بسازد.' : 'سند یا برندبوکت را بگذار تا کنار دانشت نگه داشته شود.'} action={<Button variant="secondary" iconStart="Upload" onClick={() => input.current?.click()}>بارگذاری فایل</Button>} />
      ) : (
        <ul className="flex flex-col gap-stack-sm" aria-label="فایل‌های بارگذاری‌شده">
          {files.map((f) => (
            <li key={f.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-raised p-inset-md">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <div className="flex min-w-space-0 flex-wrap items-center gap-inline-sm">
                  <span className="label-md text-text-default">{f.name}</span>
                  {managed && <Badge intent={STATUS[f.status].intent} icon={false}>{STATUS[f.status].label}</Badge>}
                  <span className="caption text-text-subtle">{kb(f.sizeBytes)} · حدود {formatNumber(f.tokens)} توکن{f.chunkCount ? ` · ${formatNumber(f.chunkCount)} قطعه` : ''}</span>
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
              {f.summary && <p className="body-sm whitespace-pre-wrap text-text-default">{f.summary}</p>}
              {f.error && <Alert intent="danger">{f.error}</Alert>}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title="پردازش فراتر از سهمیه"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>بعداً</Button>
            <Button
              variant="secondary"
              disabled={!!confirm && credits < confirm.charge.credits}
              onClick={async () => { const c = confirm; setConfirm(null); if (c) await run(c.file.id, () => onProcess(c.file.id)); }}
            >
              پردازش با {confirm ? formatNumber(confirm.charge.credits) : ''} اعتبار
            </Button>
          </>
        }
      >
        {confirm && (
          <div className="flex flex-col gap-stack-sm">
            <p className="body-md text-text-default">
              «{confirm.file.name}» حدود {formatNumber(confirm.file.tokens)} توکن است و {formatNumber(confirm.charge.excessTokens)} توکنش از سهمیهٔ ماهانه بیشتر می‌شود.
            </p>
            <p className="body-md text-text-default">هزینه: {formatNumber(confirm.charge.credits)} اعتبار (موجودی: {formatNumber(credits)}).</p>
            {credits < confirm.charge.credits && <Alert intent="warning">اعتبار کافی نیست؛ از دفتر کل اعتبار بگیر یا پلن را ارتقا بده.</Alert>}
          </div>
        )}
      </Dialog>
      <DangerDialog
        open={!!pendingDelete} onClose={() => setPendingDelete(null)} title={`حذف «${pendingDelete?.name ?? ''}»`}
        description="فایل و متن پردازش‌شده‌اش پاک می‌شود. دانشی که از آن ساخته شده می‌ماند و منبعش را نگه می‌دارد. این کار برنمی‌گردد؛ اگر لازم شد دوباره بارگذاری کن."
        confirmLabel="حذف فایل"
        onConfirm={async () => { const f = pendingDelete; if (!f) return; setPendingDelete(null); await run(f.id, () => onDelete(f.id)); }}
      />
    </Card>
  );
};
