/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ContextObject, GeneratedDeliverable, ObjectSource, TreeNode } from '../../types';
import type { ImportParseResult } from '../../types/state';
import type { ParsedBlock } from '../../core/answerParser';
import { contextTypeOf, isContextKind } from '../../core/answerParser';
import { ACTION_FA, mapAnswer } from '../../core/answerMapping';
import type { BlockMapping, MapAction } from '../../core/answerMapping';
import { PACK_MARKER_RE } from '../../core/contextPack';
import { flatten } from '../../core/nodeTree';
import { dataApi, DataApiError } from '../../services/dataApi';
import { Alert, Badge, Button, Dialog, Markdown, Select, Textarea, formatNumber, Caution } from '../../ui';

const KIND_FA: Record<ParsedBlock['kind'], string> = { decision: 'تصمیم', fact: 'واقعیت', constraint: 'خط قرمز', asset: 'دارایی', question: 'سؤال', paragraph: 'متن' };
const METHOD_FA = { headings: 'بر اساس سرتیترها', ai: 'تقسیم با لایهٔ تصمیم', raw: 'متن خام' } as const;
const BASIS_FA: Record<BlockMapping['basis'], string> = { explicit: 'نشانهٔ صریح', similar: 'شباهت', none: 'بدون سرنخ' };

interface Props {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  nodes?: TreeNode[];
  objects?: ContextObject[];
  onProposeContext: (p: { type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string; source: ObjectSource }) => Promise<boolean>;
  /** an update of knowledge that already exists: a DRAFT on it (the person approves it later), never an overwrite */
  onUpdateDraft?: (objectId: string, p: { title: string; content: string; reason: string }) => Promise<boolean>;
  onSaveAsset: (asset: GeneratedDeliverable) => Promise<boolean>;
}

/**
 * Paste the answer of an outside AI → items → for each, where it goes (new · update of X · duplicate of X · ignore), with a short
 * reason and a suggested section — all changeable, none applied by itself. New → a proposal in the thinking space; update → a draft
 * on the existing knowledge (approved there, not overwritten); duplicate / ignore → nothing is saved.
 */
export const ImportAnswerDialog: React.FC<Props> = (props) => (props.open ? <Importer {...props} /> : null);

interface Choice { action: MapAction; nodeId: string }

const Importer: React.FC<Props> = ({ workspaceId, onClose, nodes = [], objects = [], onProposeContext, onUpdateDraft, onSaveAsset }) => {
  const [text, setText] = useState('');
  const [packs, setPacks] = useState<Array<{ id: string; title: string }>>([]);
  const [packId, setPackId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<ImportParseResult | null>(null);
  const [blocks, setBlocks] = useState<Array<ParsedBlock & { done?: string }>>([]);
  const [choice, setChoice] = useState<Record<string, Choice>>({});

  useEffect(() => { dataApi.listPacks(workspaceId).then((p) => { setPacks(p); setPackId(p[0]?.id ?? ''); }).catch(() => setPacks([])); }, [workspaceId]);

  // the mapping of every item: explicit marks first, then rules among the pack's knowledge — recomputed only when the answer changes
  const maps = useMemo(() => (res ? mapAnswer(res.blocks, { objects, nodes, pack: res.packId ? res.usedContext : null }) : new Map<string, BlockMapping>()), [res, objects, nodes]);
  useEffect(() => { setChoice(Object.fromEntries([...maps].map(([id, m]) => [id, { action: m.action, nodeId: m.nodeId }]))); }, [maps]);

  const parse = async () => {
    setBusy(true); setError(null);
    try {
      // the marker the pack wrote into the request is the exact pack (it wins over the default of the list)
      const marked = text.match(PACK_MARKER_RE)?.[1];
      const r = await dataApi.parseImport(workspaceId, { text, packId: marked ?? (packId || undefined) });
      setRes(r); setBlocks(r.blocks);
    } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); } finally { setBusy(false); }
  };

  const mark = (id: string, done: string) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, done } : b)));
  const at = () => new Date().toISOString();
  const titleOf = (id?: string) => objects.find((o) => o.id === id)?.title ?? '';

  /** applies ONE item the way the person chose; returns whether anything was saved */
  const apply = async (b: ParsedBlock): Promise<boolean> => {
    const m = maps.get(b.id); const c = choice[b.id];
    if (!m || !c || !isContextKind(b.kind)) return false;
    if (c.action === 'ignore' || c.action === 'duplicate') { mark(b.id, c.action === 'duplicate' ? 'تکراری بود؛ چیزی ثبت نشد' : 'نادیده گرفته شد'); return false; }
    if (c.action === 'update' && m.targetId && onUpdateDraft) {
      const target = objects.find((o) => o.id === m.targetId);
      if (!target || target.status !== 'Confirmed') { setError('دانشی که باید به‌روز شود دیگر تأییدشده نیست؛ «تازه» را انتخاب کن.'); return false; }
      const ok = await onUpdateDraft(m.targetId, { title: b.title || target.title, content: m.body, reason: `از متن آمادهٔ وارد‌شده${res?.packTitle ? ` (بستهٔ «${res.packTitle}»)` : ''}` });
      if (ok) mark(b.id, `پیش‌نویس روی «${target.title}» ساخته شد؛ در «فکر» تأییدش کن`);
      return ok;
    }
    const ok = await onProposeContext({ type: contextTypeOf(b.kind), title: b.title, content: m.body, nodeId: c.nodeId, source: { kind: 'paste', label: res?.packTitle ?? undefined, at: at() } });
    if (ok) mark(b.id, 'به صندوق پیشنهادها رفت');
    return ok;
  };

  const ready = blocks.filter((b) => !b.done && isContextKind(b.kind) && (choice[b.id]?.action === 'new' || (choice[b.id]?.action === 'update' && onUpdateDraft)));
  const applyAll = async () => { setBusy(true); try { for (const b of ready) await apply(b); } finally { setBusy(false); } };

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

  const sectionOptions = [{ value: '', label: 'بدون بخش مشخص' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${'— '.repeat(depth)}${n.label}` }))];
  const actionOptions = (m: BlockMapping) => [
    { value: 'new', label: ACTION_FA.new },
    ...(m.targetId ? [{ value: 'update', label: `${ACTION_FA.update} «${titleOf(m.targetId)}»` }, { value: 'duplicate', label: `${ACTION_FA.duplicate} «${titleOf(m.targetId)}»` }] : []),
    { value: 'ignore', label: ACTION_FA.ignore },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="وارد کردن متن آماده"
      description="متن را همان‌طور که از ابزار گرفتی بچسبان. برای هر مورد می‌گوییم کجا می‌رود و چرا؛ تو تأیید یا عوضش می‌کنی. هیچ‌چیز خودکار ثبت نمی‌شود."
      footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}
    >
      <div className="flex flex-col gap-stack-lg">
        <Textarea label="متن آماده" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'## Decision: …\n## Asset: …'} />
        <div className="flex flex-col gap-inline-sm sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Select label="از کدام بستهٔ دانش؟ (اصالت)" value={packId} onChange={(e) => setPackId(e.target.value)} options={[{ value: '', label: 'بدون بسته (اصالت ثبت نمی‌شود)' }, ...packs.map((p) => ({ value: p.id, label: p.title }))]} hint="اگر پاسخ نشانهٔ بسته را دارد، همان بسته خودکار انتخاب می‌شود." />
          </div>
          <Button variant="primary" loading={busy} disabled={!text.trim()} iconStart="FolderInput" onClick={parse}>تبدیل به بلوک</Button>
        </div>
        {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" onClick={parse}>دوباره</Button>}>{error}</Alert>}

        {res && (
          <div className="flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <Badge intent="neutral" icon={false}>{METHOD_FA[res.method]}</Badge>
              <Badge intent="neutral" icon={false}>{formatNumber(blocks.length)} بلوک</Badge>
              {res.packId ? <Badge icon="Link2">اصالت: {formatNumber(res.usedContext.length)} قلم دانش از «{res.packTitle}»</Badge> : <Caution>بدون بستهٔ مبدأ: شباهت در همهٔ دانش دیده می‌شود</Caution>}
            </div>
            {res.warning && <Alert intent="warning">{res.warning}</Alert>}
            {ready.length > 1 && (
              <div className="flex flex-wrap items-center gap-inline-sm" data-testid="apply-all">
                <Button size="sm" variant="secondary" iconStart="Check" loading={busy} onClick={applyAll}>اعمال {formatNumber(ready.length)} مورد با همین انتخاب‌ها</Button>
                <span className="body-sm text-text-subtle">مواردی که «تکراری» یا «نادیده» انتخاب شده‌اند ثبت نمی‌شوند.</span>
              </div>
            )}
            {blocks.map((b) => {
              const m = maps.get(b.id); const c = choice[b.id]; const ctx = isContextKind(b.kind);
              return (
                <div key={b.id} className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg" data-testid="answer-block">
                  <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                    <div className="flex flex-wrap items-center gap-inline-sm">
                      <Badge icon={false}>{KIND_FA[b.kind]}</Badge>
                      <span className="label-md text-text-default">{b.title}</span>
                    </div>
                    {b.done ? <Badge icon="Check">{b.done}</Badge> : (
                      <div className="flex flex-wrap items-center gap-inline-xs">
                        {ctx && <Button size="sm" variant="secondary" iconStart="Check" onClick={() => void apply(b)}>{c?.action === 'update' ? 'ساخت پیش‌نویس' : c?.action === 'new' ? 'پیشنهاد بده' : 'تأیید انتخاب'}</Button>}
                        {b.kind !== 'question' && <Button size="sm" variant="ghost" iconStart="Package" onClick={() => toAsset(b)}>ذخیره به‌عنوان دارایی</Button>}
                        <Button size="sm" variant="ghost" iconStart="X" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}>حذف</Button>
                      </div>
                    )}
                  </div>
                  {ctx && m && c && !b.done && (
                    <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md" data-testid="block-mapping">
                      <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
                        <Select label="کجا می‌رود؟" value={c.action} onChange={(e) => setChoice((s) => ({ ...s, [b.id]: { ...c, action: e.target.value as MapAction } }))} options={actionOptions(m)} />
                        {c.action === 'new' && <Select label="در کدام بخش؟" value={c.nodeId} onChange={(e) => setChoice((s) => ({ ...s, [b.id]: { ...c, nodeId: e.target.value } }))} options={sectionOptions} />}
                      </div>
                      <p className="body-sm text-text-subtle"><Badge intent="neutral" icon={false}>{BASIS_FA[m.basis]}</Badge> {m.reason}</p>
                      {c.action === 'update' && <p className="body-sm text-text-subtle">متن موجود دست نمی‌خورد؛ یک پیش‌نویس ساخته می‌شود و در «فکر» تأییدش می‌کنی.</p>}
                    </div>
                  )}
                  <Markdown>{m?.body ?? b.markdown}</Markdown>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
};
