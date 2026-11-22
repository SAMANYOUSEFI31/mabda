/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ContextObject, GeneratedDeliverable, ObjectSource, TreeNode } from '../../types';
import type { ImportParseResult } from '../../types/state';
import type { ParsedBlock } from '../../core/answerParser';
import { contextTypeOf, isContextKind } from '../../core/answerParser';
import { ACTION_FA, mapAnswer } from '../../core/answerMapping';
import type { BlockMapping, MapAction } from '../../core/answerMapping';
import { PACK_MARKER_RE } from '../../core/contextPack';
import { flatten, treeIndent } from '../../core/nodeTree';
import { dataApi, DataApiError } from '../../services/dataApi';
import { Alert, Badge, Button, Dialog, Markdown, Select, Textarea, formatNumber, Caution } from '../../ui';
import { clientId } from '../../core/ids';

const KIND_FA: Record<ParsedBlock['kind'], string> = { decision: 'تصمیم', fact: 'واقعیت', constraint: 'خط قرمز', asset: 'خروجی', question: 'سؤال', paragraph: 'متن' };
const METHOD_FA = { headings: 'بر اساس سرتیترها', ai: 'تقسیم با لایهٔ تصمیم', raw: 'متن خام' } as const;
const BASIS_FA: Record<BlockMapping['basis'], string> = { explicit: 'نشانهٔ صریح', similar: 'شباهت', none: 'بدون سرنخ' };

type ImportBlock = ParsedBlock & { done?: string };

interface Props {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  nodes?: TreeNode[];
  objects?: ContextObject[];
  onProposeContext: (p: { type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string; source: ObjectSource }) => Promise<boolean>;
  onUpdateDraft?: (objectId: string, p: { title: string; content: string; reason: string }) => Promise<boolean>;
  onSaveAsset: (asset: GeneratedDeliverable) => Promise<boolean>;
}

export const ImportAnswerDialog: React.FC<Props> = (props) => (props.open ? <Importer {...props} /> : null);
interface Choice { action: MapAction; nodeId: string }

const Importer: React.FC<Props> = ({ workspaceId, onClose, nodes = [], objects = [], onProposeContext, onUpdateDraft, onSaveAsset }) => {
  const [text, setText] = useState('');
  const [packs, setPacks] = useState<Array<{ id: string; title: string }>>([]);
  const [packId, setPackId] = useState('');
  const [busy, setBusy] = useState(false);
  const applyingRef = useRef(new Set<string>());
  const [applyingIds, setApplyingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<ImportParseResult | null>(null);
  const [blocks, setBlocks] = useState<ImportBlock[]>([]);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  useEffect(() => { dataApi.listPacks(workspaceId).then((p) => { setPacks(p); setPackId(p[0]?.id ?? ''); }).catch(() => setPacks([])); }, [workspaceId]);
  const maps = useMemo(() => (res ? mapAnswer(res.blocks, { objects, nodes, pack: res.packId ? res.usedContext : null }) : new Map<string, BlockMapping>()), [res, objects, nodes]);
  useEffect(() => { setChoice(Object.fromEntries([...maps].map(([id, m]) => [id, { action: m.action, nodeId: m.nodeId }]))); }, [maps]);
  const parse = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { const marked = text.match(PACK_MARKER_RE)?.[1]; const r = await dataApi.parseImport(workspaceId, { text, packId: marked ?? (packId || undefined) }); setRes(r); setBlocks(r.blocks); }
    catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); } finally { setBusy(false); }
  };
  const mark = (id: string, done: string) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, done } : b)));
  const at = () => new Date().toISOString();
  const titleOf = (id?: string) => objects.find((o) => o.id === id)?.title ?? '';
  const apply = async (b: ImportBlock): Promise<boolean> => {
    if (applyingRef.current.has(b.id) || b.done) return false;
    const m = maps.get(b.id); const c = choice[b.id];
    if (!m || !c || !isContextKind(b.kind)) return false;
    applyingRef.current.add(b.id); setApplyingIds(new Set(applyingRef.current));
    try {
      if (c.action === 'ignore' || c.action === 'duplicate') { mark(b.id, c.action === 'duplicate' ? 'تکراری بود؛ چیزی ثبت نشد' : 'نادیده گرفته شد'); return false; }
      if (c.action === 'update' && m.targetId && onUpdateDraft) {
        const target = objects.find((o) => o.id === m.targetId);
        if (!target || target.status !== 'Confirmed') { setError('دانشی که باید به‌روز شود دیگر تأییدشده نیست؛ «تازه» را انتخاب کن.'); return false; }
        const ok = await onUpdateDraft(m.targetId, { title: b.title || target.title, content: m.body, reason: `از پاسخ واردشدهٔ ابزار دیگر${res?.packTitle ? ` (بستهٔ «${res.packTitle}»)` : ''}` });
        if (ok) mark(b.id, `پیش‌نویس روی «${target.title}» ساخته شد؛ در «فکر» تأییدش کن`); return ok;
      }
      const ok = await onProposeContext({ type: contextTypeOf(b.kind), title: b.title, content: m.body, nodeId: c.nodeId, source: { kind: 'paste', label: res?.packTitle ?? undefined, at: at() } });
      if (ok) mark(b.id, 'به صندوق پیشنهادها رفت'); return ok;
    } finally { applyingRef.current.delete(b.id); setApplyingIds(new Set(applyingRef.current)); }
  };
  const ready = blocks.filter((b) => !b.done && isContextKind(b.kind) && (choice[b.id]?.action === 'new' || (choice[b.id]?.action === 'update' && onUpdateDraft)));
  const applyAll = async () => { if (busy) return; setBusy(true); try { for (const b of ready) await apply(b); } finally { setBusy(false); } };
  const [savingAsset, setSavingAsset] = useState<string | null>(null);
  const toAsset = async (b: ParsedBlock) => {
    if (savingAsset) return;
    const forOutput = b.kind === 'asset' && res?.packDeliverableId && res.packSpecId;
    const asset: GeneratedDeliverable = { id: clientId('del_paste'), workspaceId, workstreamId: forOutput ? res!.packSpecId! : 'external', deliverableId: forOutput ? res!.packDeliverableId! : `external_${Date.now()}`, title: b.title, content: b.markdown, executionMode: 'auto', usedContext: res?.usedContext ?? [], rebuildCount: 0, createdAt: at(), source: { kind: 'paste', label: res?.packTitle ?? undefined, at: at() }, ...(res?.packId ? { sourcePackId: res.packId } : {}) };
    setSavingAsset(b.id); try { if (await onSaveAsset(asset)) mark(b.id, 'در خروجی‌ها ذخیره شد'); } finally { setSavingAsset(null); }
  };
  const sectionOptions = [{ value: '', label: 'بدون بخش مشخص' }, ...flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${treeIndent(depth)}${n.label}` }))];
  const actionOptions = (m: BlockMapping) => [{ value: 'new', label: ACTION_FA.new }, ...(m.targetId ? [{ value: 'update', label: `${ACTION_FA.update} «${titleOf(m.targetId)}»` }, { value: 'duplicate', label: `${ACTION_FA.duplicate} «${titleOf(m.targetId)}»` }] : []), { value: 'ignore', label: ACTION_FA.ignore }];
  return <Dialog open onClose={onClose} size="xl" title="وارد کردن پاسخ ابزار دیگر" description="متن را همان‌طور که از ابزار گرفتی بچسبان. برای هر مورد می‌گوییم کجا می‌رود و چرا؛ تو تأیید یا عوضش می‌کنی. هیچ‌چیز خودکار ثبت نمی‌شود." footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}><div className="flex flex-col gap-stack-lg">
    <Textarea label="پاسخ ابزار" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'## Decision: …\n## Asset: …'} />
    <div className="flex flex-col gap-inline-sm sm:flex-row sm:items-end"><div className="sm:flex-1"><Select label="از کدام بستهٔ دانش؟ (اصالت)" value={packId} onChange={(e) => setPackId(e.target.value)} options={[{ value: '', label: 'بدون بسته (اصالت ثبت نمی‌شود)' }, ...packs.map((p) => ({ value: p.id, label: p.title }))]} hint="اگر پاسخ نشانهٔ بسته را دارد، همان بسته خودکار انتخاب می‌شود." /></div><Button variant="primary" loading={busy} disabled={!text.trim() || busy} iconStart="FolderInput" onClick={parse}>تبدیل به بلوک</Button></div>
    {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" disabled={busy} onClick={parse}>دوباره</Button>}>{error}</Alert>}
    {res && <div className="flex flex-col gap-stack-md"><div className="flex flex-wrap items-center gap-inline-sm"><Badge intent="neutral" icon={false}>{METHOD_FA[res.method]}</Badge><Badge intent="neutral" icon={false}>{formatNumber(blocks.length)} بلوک</Badge>{res.packId ? <Badge icon="Link2">اصالت: {formatNumber(res.usedContext.length)} حقیقت از «{res.packTitle}»</Badge> : <Caution>بدون بستهٔ مبدأ: شباهت در همهٔ دانش دیده می‌شود</Caution>}</div>{res.warning && <Alert intent="warning">{res.warning}</Alert>}
      {ready.length > 1 && <div className="flex flex-wrap items-center gap-inline-sm" data-testid="apply-all"><Button size="sm" variant="secondary" iconStart="Check" loading={busy} disabled={busy || applyingIds.size > 0} onClick={applyAll}>اعمال {formatNumber(ready.length)} مورد با همین انتخاب‌ها</Button><span className="body-sm text-text-subtle">مواردی که «تکراری» یا «نادیده» انتخاب شده‌اند ثبت نمی‌شوند.</span></div>}
      {blocks.map((b) => { const m = maps.get(b.id); const c = choice[b.id]; const ctx = isContextKind(b.kind); const applying = applyingIds.has(b.id); return <div key={b.id} className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg" data-testid="answer-block"><div className="flex flex-wrap items-center justify-between gap-inline-sm"><div className="flex flex-wrap items-center gap-inline-sm"><Badge icon={false}>{KIND_FA[b.kind]}</Badge><span className="label-md text-text-default">{b.title}</span></div>{b.done ? <Badge icon="Check">{b.done}</Badge> : <div className="flex flex-wrap items-center gap-inline-xs">{ctx && <Button size="sm" variant="secondary" iconStart="Check" loading={applying} disabled={applying || busy} onClick={() => void apply(b)}>{c?.action === 'update' ? 'ساخت پیش‌نویس' : c?.action === 'new' ? 'پیشنهاد بده' : 'تأیید انتخاب'}</Button>}{b.kind !== 'question' && <Button size="sm" variant="ghost" iconStart="Package" loading={savingAsset === b.id} disabled={!!savingAsset || applying || busy} onClick={() => toAsset(b)}>ذخیره به‌عنوان خروجی</Button>}<Button size="sm" variant="ghost" iconStart="X" disabled={applying || busy} onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}>حذف</Button></div>}</div>{ctx && m && c && !b.done && <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md" data-testid="block-mapping"><div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2"><Select label="کجا می‌رود؟" value={c.action} onChange={(e) => setChoice((s) => ({ ...s, [b.id]: { ...c, action: e.target.value as MapAction } }))} options={actionOptions(m)} />{c.action === 'new' && <Select label="در کدام بخش؟" value={c.nodeId} onChange={(e) => setChoice((s) => ({ ...s, [b.id]: { ...c, nodeId: e.target.value } }))} options={sectionOptions} />}</div><p className="body-sm text-text-subtle"><Badge intent="neutral" icon={false}>{BASIS_FA[m.basis]}</Badge> {m.reason}</p>{c.action === 'update' && <p className="body-sm text-text-subtle">متن موجود دست نمی‌خورد؛ یک پیش‌نویس ساخته می‌شود و در «فکر» تأییدش می‌کنی.</p>}</div>}<Markdown>{m?.body ?? b.markdown}</Markdown></div>; })}
    </div>}
  </div></Dialog>;
};
