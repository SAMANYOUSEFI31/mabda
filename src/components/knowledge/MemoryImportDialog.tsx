/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject } from '../../types';
import { dataApi, DataApiError } from '../../services/dataApi';
import { Alert, Badge, Button, Dialog, Select, Textarea, TypeBadge, formatNumber, useToast } from '../../ui';

const SOURCES = ['ChatGPT', 'Claude', 'Gemini', 'ابزار دیگر'];

/** Ask the other AI for what it remembers about you — the user copies this prompt there and pastes the answer back here. */
const EXPORT_PROMPT = 'هر چیزی که تا حالا دربارهٔ من و کسب‌وکارم یاد گرفته‌ای را به‌صورت فهرست مرتب بنویس: کسب‌وکار، مخاطب، محصول و قیمت، لحن، تصمیم‌ها و خط قرمزها. فقط چیزهایی که واقعاً می‌دانی؛ حدس نزن.';

interface Props {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  /** objects created (already Proposed on the server) */
  onImported: (created: ContextObject[], ledger: import('../../types').LedgerEntry[]) => void;
}

/** Import the memory of ChatGPT / Claude / any text: it becomes PROPOSED objects (Imported), each with the passage it came from. */
export const MemoryImportDialog: React.FC<Props> = (props) => (props.open ? <Importer {...props} /> : null);

const Importer: React.FC<Props> = ({ workspaceId, onClose, onImported }) => {
  const toast = useToast();
  const [text, setText] = useState('');
  const [source, setSource] = useState(SOURCES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: ContextObject[]; found: number; skipped: number; truncated: boolean } | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await dataApi.importMemory(workspaceId, { text, sourceLabel: source });
      setResult(r);
      onImported(r.created, r.ledger);
    } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته. دوباره تلاش کن.'); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="وارد کردن حافظه از ابزار دیگر"
      description="حافظهٔ ChatGPT یا Claude (یا هر متنی دربارهٔ کسب‌وکارت) را بچسبان. مبدأ آن را به «پیشنهاد» تبدیل می‌کند و برای هر مورد، همان بخش متن را نقل می‌کند. تا تأیید نکنی هیچ‌چیز واقعیت نیست."
      footer={<><Button variant="ghost" onClick={onClose}>بستن</Button><Button variant="primary" iconStart="Wand2" loading={busy} disabled={!text.trim()} onClick={run}>استخراج پیشنهادها</Button></>}
    >
      <div className="flex flex-col gap-stack-lg">
        <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
          <span className="label-md text-text-default">متن آماده برای گرفتن حافظه</span>
          <p className="body-sm text-text-subtle">{EXPORT_PROMPT}</p>
          <div><Button size="sm" variant="secondary" iconStart="Copy" onClick={async () => { await navigator.clipboard.writeText(EXPORT_PROMPT).catch(() => undefined); toast.show({ intent: 'success', message: 'کپی شد؛ آن را در آن ابزار بفرست و جواب را اینجا بچسبان.' }); }}>کپی متن</Button></div>
        </div>
        <Select label="این حافظه از کجاست؟" value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES.map((s) => ({ value: s, label: s }))} />
        <Textarea label="حافظه یا متن" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={run}>دوباره</Button>}>{error}</Alert>}

        {result && (
          <div className="flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <Badge intent={result.created.length ? 'success' : 'neutral'} icon={false}>{formatNumber(result.created.length)} پیشنهاد در صندوق</Badge>
              {result.skipped > 0 && <Badge intent="warning" icon={false}>{formatNumber(result.skipped)} مورد به‌خاطر سقف پلن ثبت نشد</Badge>}
              {result.truncated && <Badge intent="warning" icon={false}>فقط بخش ابتدایی متن خوانده شد</Badge>}
            </div>
            {result.created.length === 0 && <p className="body-md text-text-subtle">چیزی که به کسب‌وکار مربوط باشد در این متن پیدا نشد.</p>}
            {result.created.map((o) => (
              <div key={o.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                <span className="flex flex-wrap items-center gap-inline-sm"><TypeBadge value={o.type} /><span className="label-md text-text-default">{o.title}</span></span>
                <p className="body-md text-text-default">{o.content}</p>
                {o.source?.quote ? <p className="body-sm text-text-subtle">نقل از متن: «{o.source.quote}»</p> : <p className="body-sm text-text-subtle">نقل مستقیمی برای این مورد پیدا نشد.</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
};
