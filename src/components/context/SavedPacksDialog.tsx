/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContextObject, PackSelection, SavedPack, TreeNode } from '../../types';
import { dataApi, DataApiError } from '../../services/dataApi';
import { flatten } from '../../core/nodeTree';
import { KIND_LABEL } from '../../core/aiRequest';
import type { RequestKind } from '../../core/aiRequest';
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Spinner, TextField, Textarea, formatNumber, useToast } from '../../ui';
import type { Explain } from '../../core/scopeExplain';
import { ClosedSection } from '../shared/ClosedSection';
import { ScopeExplain } from './ScopeExplain';

type PackRow = SavedPack & { tokens: number; counts: { confirmed: number; proposed: number; assumptions: number; rejected: number } };
interface Props { open: boolean; workspaceId: string; nodes: TreeNode[]; objects: ContextObject[]; onClose: () => void; /** «این خط قرمز را ببین / ویرایش کن» from the preview */ onOpenObject?: (o: ContextObject) => void }

/** a new pack reads the sub-sections of what is picked (the rule of the node chat and of the audit's gaps); an old one keeps what it had */
const EMPTY: PackSelection = { nodeIds: [], facets: [], statuses: [], includeAssumptions: true, withChildren: true };

/** print-friendly copy: a new window with the Markdown as plain RTL text */
export function printPack(name: string, markdown: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const esc = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${name.replace(/</g, '&lt;')}</title><style>body{font:14px/1.9 system-ui,Tahoma,sans-serif;margin:24px}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><pre>${esc}</pre></body></html>`);
  w.document.close(); w.focus(); w.print();
  return true;
}

/** «بسته‌های دانش»: a named selection, built once and pasted into any outside tool in one click. The AI only gets Confirmed knowledge as fact; assumptions travel apart. */
export const SavedPacksDialog: React.FC<Props> = (props) => (props.open ? <Packs {...props} /> : null);

const Packs: React.FC<Props> = ({ workspaceId, nodes, objects, onClose, onOpenObject }) => {
  const toast = useToast();
  const [packs, setPacks] = useState<PackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; instruction: string; selection: PackSelection; kind?: RequestKind; template?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ markdown: string; tokens: number; counts: Record<string, number>; explain: Explain } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const facetNames = useMemo(() => [...new Set(objects.flatMap((o) => o.facets ?? []))].sort((a, b) => a.localeCompare(b)), [objects]);

  const load = useCallback(async () => {
    try { setPacks((await dataApi.listSavedPacks(workspaceId)).packs as PackRow[]); setError(null); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); }
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);

  // the live preview follows the choices (typing waits a moment); it is the same function that renders a saved pack — nothing is stored
  useEffect(() => {
    if (!editing) { setPreview(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      dataApi.previewSavedPack(workspaceId, { instruction: editing.instruction, selection: editing.selection, kind: editing.kind, template: editing.template })
        .then((r) => { if (live) { setPreview(r); setPreviewError(null); } })
        .catch((e) => { if (live) setPreviewError(e instanceof DataApiError ? e.message : 'پیش‌نمایش ساخته نشد؛ دوباره.'); });
    }, preview ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, editing?.instruction, editing?.selection, editing?.kind, editing?.template, !!editing]);
  const openObject = (id: string) => { const o = objects.find((x) => x.id === id); if (o && onOpenObject) onOpenObject(o); };

  const render = async (p: PackRow) => (await dataApi.renderSavedPack(workspaceId, p.id)).markdown;
  const copy = async (p: PackRow) => {
    setBusy(`c${p.id}`);
    try {
      const md = await render(p);
      try { await navigator.clipboard.writeText(md); } catch { const ta = document.createElement('textarea'); ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      toast.show({ intent: 'success', message: `«${p.name}» کپی شد؛ در هر ابزاری بچسبان.` });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'کپی نشد؛ دوباره.' }); } finally { setBusy(null); }
  };
  const print = async (p: PackRow) => { setBusy(`p${p.id}`); try { printPack(p.name, await render(p)); } finally { setBusy(null); } };
  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setBusy('save');
    try {
      if (editing.id) await dataApi.updateSavedPack(workspaceId, editing.id, editing); else await dataApi.createSavedPack(workspaceId, editing);
      setEditing(null); await load();
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'ذخیره نشد؛ دوباره.' }); } finally { setBusy(null); }
  };
  const toggle = <K extends 'nodeIds' | 'facets'>(key: K, v: string) => setEditing((e) => (e ? { ...e, selection: { ...e.selection, [key]: e.selection[key].includes(v) ? e.selection[key].filter((x) => x !== v) : [...e.selection[key], v] } } : e));

  return (
    <Dialog
      open onClose={onClose} size="xl" title="بسته‌های دانش"
      description="یک‌بار بساز، با یک کلیک در هر ابزاری بچسبان. فقط دانش تأییدشده «واقعیت» است؛ فرض‌ها و گزینه‌های ردشده جدا و با دستور صریح می‌روند."
      footer={editing
        ? <><Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button><Button variant="primary" loading={busy === 'save'} disabled={!editing.name.trim()} onClick={save}>ذخیرهٔ بسته</Button></>
        : <><Button variant="secondary" iconStart="Plus" onClick={() => setEditing({ name: '', instruction: '', selection: EMPTY })}>بستهٔ تازه</Button><Button variant="ghost" onClick={onClose}>بستن</Button></>}
    >
      {error && <Alert intent="danger">{error}</Alert>}
      {editing ? (
        <div className="grid grid-cols-1 gap-stack-lg md:grid-cols-2 md:items-start" role="group" aria-label="ویرایش بسته">
          <div className="flex flex-col gap-stack-md">
          <TextField label="نام بسته" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="مثلاً: برای نوشتن متن تبلیغ" />
          {editing.kind
            ? <TextField label={`درخواست (${KIND_LABEL[editing.kind]})`} value={editing.template ?? ''} onChange={(e) => setEditing({ ...editing, template: e.target.value })} hint="هر بار با دانش همان روز ساخته می‌شود؛ بخش اول دامنه است." />
            : <Textarea label="دستور کوتاه همراه بسته (اختیاری)" rows={2} value={editing.instruction} onChange={(e) => setEditing({ ...editing, instruction: e.target.value })} placeholder="مثلاً: فقط از همین بسته کار کن و اگر چیزی کم بود بپرس." />}
          <fieldset className="flex flex-col gap-stack-xs"><legend className="label-md text-text-default">برای کدام بخش‌ها؟ (هیچ‌کدام = کل درخت)</legend>
            <div className="grid grid-cols-1 gap-inline-xs">{flatten(nodes).map(({ node, depth }) => <Checkbox key={node.id} label={`${'— '.repeat(depth)}${node.label}`} checked={editing.selection.nodeIds.includes(node.id)} onChange={() => toggle('nodeIds', node.id)} />)}</div>
          </fieldset>
          {facetNames.length > 0 && (
            <fieldset className="flex flex-col gap-stack-xs"><legend className="label-md text-text-default">فقط این بُعدها (هیچ‌کدام = همه)</legend>
              <div className="flex flex-wrap gap-inline-md">{facetNames.map((f) => <Checkbox key={f} label={f} checked={editing.selection.facets.includes(f)} onChange={() => toggle('facets', f)} />)}</div>
            </fieldset>
          )}
          <fieldset className="flex flex-col gap-stack-xs"><legend className="label-md text-text-default">چه چیزی علاوه بر دانش تأییدشده بیاید؟</legend>
            <Checkbox label="فرض‌های فعال (جدا، با دستور «واقعیت نیست»)" checked={editing.selection.includeAssumptions} onChange={(e) => setEditing({ ...editing, selection: { ...editing.selection, includeAssumptions: e.target.checked } })} />
            <Checkbox label="پیشنهادی‌ها (برچسب «تأییدنشده»)" checked={editing.selection.statuses.includes('Proposed')} onChange={(e) => setEditing({ ...editing, selection: { ...editing.selection, statuses: e.target.checked ? [...new Set([...editing.selection.statuses, 'Proposed' as const])] : editing.selection.statuses.filter((x) => x !== 'Proposed') } })} />
            <Checkbox label="نیازمند بررسی (برچسب «تأییدنشده»)" checked={editing.selection.statuses.includes('Needs Review')} onChange={(e) => setEditing({ ...editing, selection: { ...editing.selection, statuses: e.target.checked ? [...new Set([...editing.selection.statuses, 'Needs Review' as const])] : editing.selection.statuses.filter((x) => x !== 'Needs Review') } })} />
          </fieldset>
          <Checkbox label="زیربخش‌های بخش‌های انتخاب‌شده هم بیایند" checked={editing.selection.withChildren === true} onChange={(e) => setEditing({ ...editing, selection: { ...editing.selection, withChildren: e.target.checked } })} hint="اگر «محصول» را تیک بزنی، «آفر و قیمت‌گذاری» و بقیهٔ زیربخش‌هایش هم می‌آیند. بدون تیک فقط خود بخش (و آنچه از بالا به ارث می‌برد). بخش‌های هم‌سطح هیچ‌وقت نمی‌آیند." />
          <p className="body-sm text-text-subtle">هر بخش می‌آورد: دانش خودش + آنچه از بخش‌های بالاتر به ارث می‌برد + خط قرمزهای «همه‌جا». آنچه در یک بخش کنار گذاشته شده، قدیمی‌شده‌ها، نمونه‌ها و یادداشت‌ها هرگز نمی‌آیند؛ فرض و پیشنهادی فقط با تیک و با برچسب «تأییدنشده».</p>

          </div>

          <section className="flex flex-col gap-stack-md rounded-control border border-border-default p-inset-lg" aria-label="پیش‌نمایش بسته" data-testid="pack-preview">
            <h3 className="title text-text-default">این بسته چه می‌آورد؟</h3>
            {previewError && <Alert intent="danger">{previewError}</Alert>}
            {!preview && !previewError && <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال ساخت" /><span className="body-sm">در حال ساخت…</span></div>}
            {preview && (
              <>
                <div className="flex flex-wrap items-center gap-inline-xs" aria-live="polite">
                  <Badge intent="neutral" icon="FileText">حدود {formatNumber(preview.tokens)} توکن</Badge>
                  <Badge icon={false}>{formatNumber(preview.explain.items.length)} مورد می‌آید</Badge>
                  <Badge intent="neutral" icon={false}>{formatNumber(preview.explain.skipped.length)} نمی‌آید</Badge>
                </div>
                {preview.tokens > 6000 && <Alert intent="warning">بسته بلند است (حدود {formatNumber(preview.tokens)} توکن). بخش‌ها را کمتر کن یا «زیربخش‌ها» را بردار.</Alert>}
                <ScopeExplain explain={preview.explain} onOpenObject={onOpenObject ? openObject : undefined} />
                <ClosedSection title="متن دقیقی که کپی می‌شود">
                  <Textarea label="متن بسته (فقط‌خواندنی)" rows={10} readOnly value={preview.markdown} className="code bidi-plain" />
                </ClosedSection>
              </>
            )}
          </section>
        </div>
      ) : packs === null ? (
        <div className="flex justify-center p-inset-xl"><Spinner /></div>
      ) : packs.length === 0 ? (
        <EmptyState icon="Package" title="هنوز بسته‌ای نساخته‌ای" description="یک بسته بساز: انتخاب بخش‌ها، بُعدها و یک دستور کوتاه؛ بعد فقط «کپی» را بزن." />
      ) : (
        <ul className="flex flex-col gap-stack-sm" aria-label="بسته‌های ذخیره‌شده">
          {packs.map((p) => (
            <li key={p.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="label-md text-text-default">{p.name}</span>
                <span className="flex flex-wrap items-center gap-inline-xs">
                  <Badge intent="neutral" icon={false}>{formatNumber(p.tokens)} توکن</Badge>
                  <Badge intent="neutral" icon={false}>{formatNumber(p.counts.confirmed)} واقعیت</Badge>
                  {p.counts.assumptions > 0 && <Badge intent="neutral" icon={false}>{formatNumber(p.counts.assumptions)} فرض</Badge>}
                </span>
              </div>
              {p.kind && <p className="body-sm text-text-subtle"><Badge intent="neutral" icon="PackageOpen">درخواست: {KIND_LABEL[p.kind]}</Badge> {p.template}</p>}
              {p.instruction && <p className="body-sm text-text-subtle">{p.instruction}</p>}
              <p className="caption text-text-subtle">{p.selection.nodeIds.length ? `${formatNumber(p.selection.nodeIds.length)} بخش${p.selection.withChildren ? ' + زیربخش‌ها' : ''}` : 'کل درخت'}{p.selection.facets.length ? ` · بُعد: ${p.selection.facets.join('، ')}` : ''}</p>
              <div className="flex flex-wrap gap-inline-xs">
                <Button size="sm" variant="secondary" iconStart="Copy" loading={busy === `c${p.id}`} onClick={() => copy(p)}>کپی</Button>
                <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => setEditing({ id: p.id, name: p.name, instruction: p.instruction, selection: p.selection, kind: p.kind, template: p.template })}>ویرایش</Button>
                <Button size="sm" variant="ghost" iconStart="FileText" loading={busy === `p${p.id}`} onClick={() => print(p)}>نسخهٔ چاپی</Button>
                <Button size="sm" variant="ghost" iconStart="Trash2" onClick={async () => { try { const r = await dataApi.deleteSavedPack(workspaceId, p.id); await load(); const gone = r.pack; toast.show({ intent: 'success', message: `بستهٔ «${p.name}» حذف شد.`, duration: 10000, ...(gone ? { action: { label: 'واگرد', onClick: () => { void dataApi.restoreSavedPack(workspaceId, gone).then(load); } } } : {}) }); } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'حذف نشد؛ دوباره.' }); } }}>حذف</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
};
