/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { GeneratedDeliverable, ObjectSource } from '../types';
import type { ImportParseResult } from '../types/state';
import type { ParsedBlock } from '../core/answerParser';
import { contextTypeOf, isContextKind } from '../core/answerParser';
import { dataApi, DataApiError } from '../services/dataApi';
import type { TreeNode } from '../types';
import { flatten } from '../core/nodeTree';
import { Alert, Badge, Button, Dialog, Markdown, Select, Textarea, formatNumber } from '../ui';

const KIND_FA: Record<ParsedBlock['kind'], string> = { decision: 'تصمیم', fact: 'واقعیت', constraint: 'محدودیت', asset: 'دارایی', question: 'سؤال AI', paragraph: 'متن' };
const METHOD_FA = { headings: 'بر اساس سرتیترها', ai: 'تقسیم با لایهٔ تصمیم', raw: 'متن خام' } as const;

interface Props {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  nodes?: TreeNode[];
  onProposeContext: (p: { type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string; source: ObjectSource }) => Promise<boolean>;
  onSaveAsset: (asset: GeneratedDeliverable) => Promise<boolean>;
}

/** Paste the answer of an outside AI → blocks → take each block to Context (as Proposed) or to the asset library, with the pack's lineage. */
export const ImportAnswerDialog: React.FC<Props> = (props) => (props.open ? <Importer {...props} /> : null);

const Importer: React.FC<Props> = ({ workspaceId, onClose, nodes = [], onProposeContext, onSaveAsset }) => {
  const [nodeId, setNodeId] = useState('');
  const [text, setText] = useState('');
  const [packs, setPacks] = useState<Array<{ id: string; title: string }>>([]);
  const [packId, setPackId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<ImportParseResult | null>(null);
  const [blocks, setBlocks] = useState<Array<ParsedBlock & { done?: string }>>([]);

  useEffect(() => { dataApi.listPacks(workspaceId).then((p) => { setPacks(p); setPackId(p[0]?.id ?? ''); }).catch(() => setPacks([])); }, [workspaceId]);

  const parse = async () => {
    setBusy(true); setError(null);
    try {
      const r = await dataApi.parseImport(workspaceId, { text, packId: packId || undefined });
      setRes(r); setBlocks(r.blocks);
    } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); } finally { setBusy(false); }
  };

  const mark = (id: string, done: string) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, done } : b)));
  const at = () => new Date().toISOString();

  const toContext = async (b: ParsedBlock) => {
    if (!isContextKind(b.kind)) return;
    const ok = await onProposeContext({ type: contextTypeOf(b.kind), title: b.title, content: b.markdown, nodeId, source: { kind: 'paste', label: res?.packTitle ?? undefined, at: at() } });
    if (ok) mark(b.id, 'به صندوق پیشنهادها رفت');
  };

  const toAsset = async (b: ParsedBlock) => {
    // an Asset block answering a pack made for a specific output counts as that output (unlocks what depends on it)
    const forOutput = b.kind === 'asset' && res?.packDeliverableId && res.packSpecId;
    const asset: GeneratedDeliverable = {
      id: `del_paste_${Date.now()}`, workspaceId, workstreamId: forOutput ? res!.packSpecId! : 'external',
      deliverableId: forOutput ? res!.packDeliverableId! : `external_${Date.now()}`, title: b.title, content: b.markdown,
      executionMode: 'auto', creditCost: 0, usedContext: res?.usedContext ?? [], rebuildCount: 0, createdAt: at(),
      source: { kind: 'paste', label: res?.packTitle ?? undefined, at: at() }, ...(res?.packId ? { sourcePackId: res.packId } : {}),
    };
    if (await onSaveAsset(asset)) mark(b.id, 'در کتابخانهٔ دارایی‌ها ذخیره شد');
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="وارد کردن پاسخ AI بیرونی"
      description="پاسخ را همان‌طور که AI داد بچسبان. بلوک‌ها را خودت به دانش یا دارایی می‌بری؛ هیچ‌چیز خودکار ثبت نمی‌شود."
      footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}
    >
      <div className="flex flex-col gap-stack-lg">
        <Textarea label="پاسخ AI" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'## Decision: …\n## Asset: …'} />
        <div className="flex flex-col gap-inline-sm sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Select label="از کدام بستهٔ دانش؟ (اصالت)" value={packId} onChange={(e) => setPackId(e.target.value)} options={[{ value: '', label: 'بدون بسته (اصالت ثبت نمی‌شود)' }, ...packs.map((p) => ({ value: p.id, label: p.title }))]} />
          </div>
          <Button variant="primary" loading={busy} disabled={!text.trim()} iconStart="Wand2" onClick={parse}>تبدیل به بلوک</Button>
        </div>
        {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" onClick={parse}>دوباره</Button>}>{error}</Alert>}

        {res && (
          <div className="flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <Badge intent="neutral" icon={false}>{METHOD_FA[res.method]}</Badge>
              <Badge intent="neutral" icon={false}>{formatNumber(blocks.length)} بلوک</Badge>
              {res.packId ? <Badge intent="success" icon="Link2">اصالت: {formatNumber(res.usedContext.length)} قلم دانش از «{res.packTitle}»</Badge> : <Badge intent="warning" icon={false}>بدون بستهٔ مبدأ</Badge>}
            </div>
            {res.warning && <Alert intent="warning">{res.warning}</Alert>}
            {nodes.length > 0 && <Select label="بخش دانش‌هایی که می‌بری (اختیاری)" value={nodeId} onChange={(e) => setNodeId(e.target.value)} options={[{ value: '', label: 'بدون بخش مشخص' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${'— '.repeat(depth)}${n.label}` }))]} />}
            {blocks.map((b) => (
              <div key={b.id} className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <div className="flex flex-wrap items-center gap-inline-sm">
                    <Badge intent={b.kind === 'asset' ? 'info' : b.kind === 'question' ? 'warning' : 'neutral'} icon={false}>{KIND_FA[b.kind]}</Badge>
                    <span className="label-md text-text-default">{b.title}</span>
                  </div>
                  {b.done ? <Badge intent="success" icon="Check">{b.done}</Badge> : (
                    <div className="flex flex-wrap items-center gap-inline-xs">
                      {isContextKind(b.kind) && <Button size="sm" variant="secondary" iconStart="Plus" onClick={() => toContext(b)}>به دانش (پیشنهادی)</Button>}
                      {b.kind !== 'question' && <Button size="sm" variant="secondary" iconStart="Package" onClick={() => toAsset(b)}>ذخیره به‌عنوان دارایی</Button>}
                      <Button size="sm" variant="ghost" iconStart="X" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}>حذف</Button>
                    </div>
                  )}
                </div>
                <Markdown>{b.markdown}</Markdown>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
};
