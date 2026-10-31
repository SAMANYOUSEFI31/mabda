/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { LedgerEntry, TreeNode } from '../types';
import type { CoachQuota, CoachResultInfo } from '../types/state';
import { dataApi, DataApiError } from '../services/dataApi';
import { useAiStatus } from '../services/aiStatus';
import { Alert, Badge, Button, Checkbox, Textarea, formatNumber } from '../ui';
import { TypeBadge } from '../ui';

type Proposal = CoachResultInfo['proposals'][number];

interface Props {
  workspaceId: string;
  scope: 'onboarding' | 'node';
  nodeId: string;
  nodes: TreeNode[];
  seedText?: string;
  /** saves the chosen proposals as PROPOSED objects (never Confirmed) */
  onSaveProposals: (proposals: Proposal[]) => Promise<void>;
  onLedger?: (ledger: LedgerEntry[]) => void;
  onOpenAiSettings: () => void;
}

/**
 * Context Coach (balanced tier): asks clarifying questions, points at ambiguous phrases and drafts Proposed objects.
 * It writes nothing by itself; the user ticks what to keep. Has its own daily cap per plan.
 */
export const CoachPanel: React.FC<Props> = ({ workspaceId, scope, nodeId, nodes, seedText = '', onSaveProposals, onLedger, onOpenAiSettings }) => {
  const ai = useAiStatus();
  const [text, setText] = useState(seedText);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'coach'; content: string }>>([]);
  const [result, setResult] = useState<CoachResultInfo | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [quota, setQuota] = useState<CoachQuota | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { dataApi.coachQuota(workspaceId).then(setQuota).catch(() => setQuota(null)); }, [workspaceId]);

  const ask = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await dataApi.coach(workspaceId, { scope, nodeId, text: text.trim(), history });
      setResult(r.result);
      setPicked(new Set(r.result.proposals.map((_, i) => i)));
      setQuota(r.quota);
      onLedger?.(r.ledger);
      setHistory((h) => [...h, { role: 'user' as const, content: text.trim() }, { role: 'coach' as const, content: r.result.questions.join(' ') }].slice(-6));
      setSaved(0);
    } catch (e) {
      setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته. دوباره تلاش کن.');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!result) return;
    const chosen = result.proposals.filter((_, i) => picked.has(i));
    if (!chosen.length) return;
    setSaving(true);
    try { await onSaveProposals(chosen); setSaved(chosen.length); setResult({ ...result, proposals: result.proposals.filter((_, i) => !picked.has(i)) }); setPicked(new Set()); } finally { setSaving(false); }
  };

  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const out = quota && quota.remaining <= 0;

  return (
    <div className="flex flex-col gap-stack-md rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <div className="flex flex-wrap items-center gap-inline-sm">
          <span className="label-md text-text-default">Context Coach</span>
          <Badge intent="neutral" icon="Brain">سطح متعادل</Badge>
        </div>
        {quota && <span className="caption text-text-subtle">باقی‌ماندهٔ امروز: {formatNumber(quota.remaining)} از {formatNumber(quota.limit)}</span>}
      </div>
      <p className="body-sm text-text-subtle">Coach سؤال روشن‌کننده می‌پرسد و ابهام را نشان می‌دهد. چیزی خودش ثبت نمی‌کند؛ فقط موارد «پیشنهادی» می‌سازد که خودت تأیید می‌کنی.</p>

      <Textarea label="چه چیزی را می‌خواهی روشن کنی؟" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      {!ai.available && (
        <Alert intent="warning" title="هوش مصنوعی راه‌اندازی نشده" action={<Button size="sm" variant="secondary" iconStart="Settings" onClick={onOpenAiSettings}>تنظیم کلید API</Button>}>برای Coach کلید API لازم است.</Alert>
      )}
      {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" onClick={ask}>دوباره</Button>}>{error}</Alert>}
      <div>
        <Button variant="secondary" iconStart="Sparkles" loading={busy} disabled={!ai.available || !text.trim() || !!out} onClick={ask}>
          {result ? 'پرسش دوباره با پاسخ‌هایم' : 'از Coach بپرس'}
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-stack-md">
          {result.questions.length > 0 && (
            <div className="flex flex-col gap-stack-xs">
              <span className="label-md text-text-default">سؤال‌های روشن‌کننده</span>
              <ol className="body-md list-inside list-decimal text-text-default">{result.questions.map((q) => <li key={q}>{q}</li>)}</ol>
              <span className="caption text-text-subtle">جواب‌ها را به متن بالا اضافه کن و دوباره بپرس.</span>
            </div>
          )}
          {result.ambiguities.length > 0 && (
            <div className="flex flex-col gap-stack-xs">
              <span className="label-md text-text-default">ابهام‌ها</span>
              {result.ambiguities.map((a) => <Alert key={a.quote} intent="warning" title={`«${a.quote}»`}>{a.why}</Alert>)}
            </div>
          )}
          {result.proposals.length > 0 && (
            <div className="flex flex-col gap-stack-xs">
              <span className="label-md text-text-default">پیشنهاد برای ثبت (وضعیت: پیشنهادی)</span>
              {result.proposals.map((p, i) => (
                <div key={`${p.title}-${i}`} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-raised p-inset-md">
                  <Checkbox label={<span className="inline-flex flex-wrap items-center gap-inline-sm"><TypeBadge value={p.type} />{p.title}<span className="caption text-text-subtle">({label(p.nodeId)})</span></span>} checked={picked.has(i)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                  <p className="body-sm text-text-default">{p.content}</p>
                </div>
              ))}
              <div><Button variant="secondary" iconStart="Plus" loading={saving} disabled={picked.size === 0} onClick={save}>ثبت به‌عنوان پیشنهادی</Button></div>
            </div>
          )}
          {saved > 0 && <Alert intent="success">{formatNumber(saved)} مورد پیشنهادی ثبت شد؛ در منبع حقیقت منتظر تأیید توست.</Alert>}
          {result.questions.length === 0 && result.ambiguities.length === 0 && result.proposals.length === 0 && <p className="body-sm text-text-subtle">Coach چیزی برای روشن‌کردن پیدا نکرد.</p>}
        </div>
      )}
    </div>
  );
};
