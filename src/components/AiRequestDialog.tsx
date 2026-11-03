/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { TreeNode } from '../types';
import { EXCLUDE_REASON_FA, INCLUDE_REASON_FA, KIND_LABEL, REQUEST_KINDS } from '../core/aiRequest';
import type { AiRequestResult, ExcludeReason, RequestKind } from '../core/aiRequest';
import { flatten } from '../core/nodeTree';
import { dataApi, DataApiError } from '../services/dataApi';
import { Alert, Badge, Button, Dialog, Select, Spinner, TextField, Textarea, formatNumber, useToast } from '../ui';

type Result = AiRequestResult & { packId: string; recorded: boolean };
interface Props {
  open: boolean;
  workspaceId: string;
  nodes: TreeNode[];
  /** the node the work is about: the current node on a node page, empty on Home (the whole tree) */
  scopeNodeId?: string;
  onClose: () => void;
  onOpenImport: () => void;
}

const SHOWN = 40;
const newPackId = () => `rq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * «درخواست برای AI»: pick the kind of work (default: سؤال), write one line, copy. Mabda assembles the prompt
 * (src/core/aiRequest.ts); the preview is the exact text that is copied. Nothing is generated here — no AI is called.
 */
export const AiRequestDialog: React.FC<Props> = (props) => (props.open ? <Inner {...props} /> : null);

const Inner: React.FC<Props> = ({ workspaceId, nodes, scopeNodeId, onClose, onOpenImport }) => {
  const toast = useToast();
  const [kind, setKind] = useState<RequestKind>('question');
  const [request, setRequest] = useState('');
  const [scope, setScope] = useState(scopeNodeId ?? '');
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'copy' | 'save' | null>(null);
  const [copied, setCopied] = useState(false);
  const packId = useMemo(newPackId, []);
  const meta = REQUEST_KINDS.find((k) => k.kind === kind)!;
  const options = useMemo(() => [{ value: '', label: 'کل درخت' }, ...flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }))], [nodes]);

  // the preview follows the choices; typing waits a moment so every key does not ask the server
  useEffect(() => {
    let live = true;
    setCopied(false);
    const t = setTimeout(() => {
      dataApi.aiRequest(workspaceId, { kind, request, scopeNodeId: scope || undefined, extraIds, packId })
        .then((r) => { if (live) { setResult(r); setError(null); } })
        .catch((e) => { if (live) setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); });
    }, result ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, kind, request, scope, extraIds, packId]);

  const ready = request.trim().length > 0;
  const copy = async () => {
    setBusy('copy');
    try {
      const r = await dataApi.aiRequest(workspaceId, { kind, request, scopeNodeId: scope || undefined, extraIds, packId, record: true });
      try { await navigator.clipboard.writeText(r.markdown); } catch { const ta = document.createElement('textarea'); ta.value = r.markdown; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      setResult(r); setCopied(true);
      toast.show({ intent: 'success', message: 'کپی شد. در Claude یا ChatGPT بچسبان؛ پاسخ را که گرفتی، «پاسخ AI را وارد کن».' });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'کپی نشد؛ دوباره.' }); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    try {
      await dataApi.createSavedPack(workspaceId, { name: `${KIND_LABEL[kind]} — ${request.trim().slice(0, 40)}`, instruction: '', selection: { nodeIds: scope ? [scope] : [], facets: [], statuses: [], includeAssumptions: true }, kind, template: request.trim() });
      toast.show({ intent: 'success', message: 'درخواست ذخیره شد؛ در «بسته‌های Context» هر بار با دانش روز ساخته می‌شود.' });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'ذخیره نشد؛ دوباره.' }); } finally { setBusy(null); }
  };

  const left = useMemo(() => {
    const groups = new Map<ExcludeReason, AiRequestResult['excluded']>();
    for (const e of result?.excluded ?? []) groups.set(e.reason, [...(groups.get(e.reason) ?? []), e]);
    return [...groups.entries()];
  }, [result]);

  return (
    <Dialog
      open onClose={onClose} size="xl" title="درخواست برای AI" description="نوع کار را انتخاب کن و یک خط بنویس؛ مبدأ پرامپت اصولی را از دانش تأییدشدهٔ تو می‌چیند."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>بستن</Button>
          <Button variant="ghost" iconStart="Upload" onClick={() => { onClose(); onOpenImport(); }}>پاسخ AI را وارد کن</Button>
          <Button variant="secondary" iconStart="Package" disabled={!ready} loading={busy === 'save'} onClick={save}>ذخیره به‌عنوان درخواست</Button>
          <Button variant="primary" iconStart={copied ? 'Check' : 'Copy'} disabled={!ready || !result} loading={busy === 'copy'} onClick={copy}>{copied ? 'کپی شد' : 'کپی'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-stack-md">
        <div role="radiogroup" aria-label="نوع کار" className="flex flex-wrap gap-inline-xs">
          {REQUEST_KINDS.map((k) => (
            <Button key={k.kind} size="sm" variant={k.kind === kind ? 'secondary' : 'ghost'} iconStart={k.kind === kind ? 'Check' : undefined} role="radio" aria-checked={k.kind === kind} onClick={() => { setKind(k.kind); setExtraIds([]); }}>{k.label}</Button>
          ))}
        </div>
        <p className="body-sm text-text-subtle">{meta.hint}</p>
        <TextField
          id="ai-request-line" label="درخواستت را در یک خط بنویس" value={request} onChange={(e) => setRequest(e.target.value)}
          placeholder={`مثلاً: ${meta.example}`} maxLength={500}
          hint={request ? undefined : <Button size="sm" variant="ghost" onClick={() => setRequest(meta.example)}>استفاده از نمونه</Button>}
        />
        <Select label="دامنه" value={scope} options={options} onChange={(e) => { setScope(e.target.value); setExtraIds([]); }} hint="فقط دانشی که در این گره و بالاتر از آن اثر دارد می‌آید؛ قیدها همیشه."/>

        {error && <Alert intent="danger">{error}</Alert>}
        {!result && !error && <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال ساخت" /><span className="body-md">در حال ساخت…</span></div>}
        {result && (
          <>
            <div className="flex flex-wrap items-center gap-inline-sm" aria-live="polite">
              <Badge intent="neutral" icon="FileText">حدود {formatNumber(result.tokens)} توکن</Badge>
              <Badge intent="success" icon={false}>شامل شد ({formatNumber(result.included.length)})</Badge>
              <Badge intent="neutral" icon={false}>خارج شد ({formatNumber(result.excluded.length)})</Badge>
              {result.counts.assumptions > 0 && <Badge intent="neutral" icon={false}>{formatNumber(result.counts.assumptions)} فرض (جدا)</Badge>}
              {result.counts.rejected > 0 && <Badge intent="neutral" icon={false}>{formatNumber(result.counts.rejected)} گزینهٔ ردشده</Badge>}
            </div>
            {result.overBudget && <Alert intent="warning">قیدها و تصمیم‌های سراسری از بودجه بیشترند؛ همیشه می‌آیند. دامنه را کوچک‌تر کن.</Alert>}
            {result.longText && <p className="caption text-text-subtle">متن بلند است؛ از AI خواسته شده اول نقل‌قول‌های مرتبط را بیاورد.</p>}
            <Textarea label="پیش‌نمایش (دقیقاً همین متن کپی می‌شود)" rows={10} readOnly value={result.markdown} className="code" />

            <details className="rounded-control border border-border-default p-inset-md">
              <summary className="label-md cursor-pointer text-text-default">شامل شد ({formatNumber(result.included.length)})</summary>
              <ul className="mt-stack-sm flex flex-col gap-stack-xs" aria-label="شامل‌شده‌ها">
                {result.included.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-inline-sm">
                    <span className="body-sm text-text-default">{i.title} <span className="caption text-text-subtle">· {i.nodeLabel}</span></span>
                    <span className="flex items-center gap-inline-xs">
                      <span className="caption text-text-subtle">{INCLUDE_REASON_FA[i.reason]}</span>
                      {i.reason === 'manual' && <Button size="sm" variant="ghost" onClick={() => setExtraIds((x) => x.filter((id) => id !== i.id))}>برداشتن</Button>}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            {left.length > 0 && (
              <details className="rounded-control border border-border-default p-inset-md">
                <summary className="label-md cursor-pointer text-text-default">خارج شد ({formatNumber(result.excluded.length)}) — با دلیل و امکان افزودن</summary>
                <div className="mt-stack-sm flex flex-col gap-stack-md">
                  {left.map(([reason, items]) => (
                    <section key={reason} aria-label={EXCLUDE_REASON_FA[reason]}>
                      <h4 className="label-md text-text-default">{EXCLUDE_REASON_FA[reason]} ({formatNumber(items.length)})</h4>
                      <ul className="flex flex-col gap-stack-xs">
                        {items.slice(0, SHOWN).map((e) => (
                          <li key={e.id} className="flex flex-wrap items-center justify-between gap-inline-sm">
                            <span className="body-sm text-text-default">{e.title} <span className="caption text-text-subtle">· {e.nodeLabel}</span></span>
                            {e.canAdd && <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => setExtraIds((x) => [...new Set([...x, e.id])])}>افزودن</Button>}
                          </li>
                        ))}
                      </ul>
                      {items.length > SHOWN && <p className="caption text-text-subtle">و {formatNumber(items.length - SHOWN)} مورد دیگر</p>}
                    </section>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        <p className="caption text-text-subtle">هیچ AI‌ای اینجا صدا زده نمی‌شود. نمونه‌ها و پیشنهادی‌ها هرگز به‌عنوان واقعیت نمی‌آیند.</p>
      </div>
    </Dialog>
  );
};
