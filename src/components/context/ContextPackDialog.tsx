/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { PackInfo } from '../../types/state';
import { dataApi, DataApiError } from '../../services/dataApi';
import { Alert, Badge, Button, Dialog, Spinner, Textarea, formatNumber, useToast, Caution } from '../../ui';

export interface PackTarget { specId?: string; deliverableId?: string; title: string }

interface Props {
  workspaceId: string;
  target: PackTarget | null;
  onClose: () => void;
  onOpenImport: () => void;
}

/** «کپی برای استفاده در هر ابزار»: compact Markdown for any outside tool (even a free chat). The size is shown before copying. */
export const ContextPackDialog: React.FC<Props> = ({ workspaceId, target, onClose, onOpenImport }) => {
  const toast = useToast();
  const [pack, setPack] = useState<PackInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!target) return;
    let live = true;
    setPack(null); setError(null); setCopied(false);
    dataApi.createPack(workspaceId, { specId: target.specId, deliverableId: target.deliverableId })
      .then((p) => { if (live) setPack(p); })
      .catch((e) => { if (live) setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); });
    return () => { live = false; };
  }, [target, workspaceId]);

  const copy = async () => {
    if (!pack) return;
    try { await navigator.clipboard.writeText(pack.markdown); } catch {
      const ta = document.createElement('textarea'); ta.value = pack.markdown; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(true);
    toast.show({ intent: 'success', message: 'بستهٔ دانش کپی شد. آن را در هر ابزاری که می‌خواهی بچسبان و بخواه طبق قالب جواب بدهد.' });
  };

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      size="lg"
      title={`کپی برای استفاده در هر ابزار — ${target?.title ?? ''}`}
      description="Markdown فشرده با دانش تأییدشده، جاهای خالی، معیارها و خط قرمزها و قالب پاسخی که ابزار باید رعایت کند."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>بستن</Button>
          <Button variant="secondary" iconStart="Upload" onClick={() => { onClose(); onOpenImport(); }}>وارد کردن متن آماده</Button>
          <Button variant="primary" iconStart={copied ? 'Check' : 'Copy'} disabled={!pack} onClick={copy}>{copied ? 'کپی شد' : 'کپی'}</Button>
        </>
      }
    >
      {error ? <Alert intent="danger">{error}</Alert> : !pack ? (
        <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال ساخت بسته" /><span className="body-md">در حال ساخت بسته…</span></div>
      ) : (
        <div className="flex flex-col gap-stack-md">
          <div className="flex flex-wrap items-center gap-inline-sm">
            <Badge intent="neutral" icon="FileText">حدود {formatNumber(pack.tokens)} توکن</Badge>
            <Badge intent="neutral" icon={false}>{formatNumber(pack.chars)} نویسه</Badge>
            <Badge icon={false}>{formatNumber(pack.counts.confirmed)} واقعیت تأییدشده</Badge>
            {pack.counts.proposed > 0 && <Caution>{formatNumber(pack.counts.proposed)} پیشنهادی (تأییدنشده)</Caution>}
            {pack.counts.gaps > 0 && <Caution>{formatNumber(pack.counts.gaps)} جای خالی</Caution>}
            {pack.counts.guardrails > 0 && <Badge intent="neutral" icon={false}>{formatNumber(pack.counts.guardrails)} خط قرمز</Badge>}
          </div>
          <Textarea label="پیش‌نمایش بسته (فقط‌خواندنی)" rows={12} readOnly value={pack.markdown} className="code" />
          <p className="caption text-text-subtle">وقتی جواب را از ابزار برگرداندی و وارد کردی، بخش‌های جواب به بلوک تبدیل می‌شوند و اصالت دارایی به همین بسته وصل می‌ماند.</p>
        </div>
      )}
    </Dialog>
  );
};
