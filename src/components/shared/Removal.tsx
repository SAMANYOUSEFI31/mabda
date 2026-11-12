/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { ContextObject } from '../../types';
import { dataApi, DataApiError } from '../../services/dataApi';
import type { PurgeImpactInfo } from '../../services/dataApi';
import { Alert, Badge, Button, Checkbox, Dialog, Spinner, TextField, formatNumber } from '../../ui';

/**
 * ONE confirm for the big removals (docs/removal.md): what will happen, said in plain words; a tick («می‌فهمم برنمی‌گردد») or typed
 * words for the biggest; a danger button that says exactly what it does. Small removals do not use this: they happen at once and
 * offer «واگرد».
 */
export const DangerDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  /** the user must type these exact words (a workspace name, the words of «حذف همهٔ داده‌ها») */
  typed?: { phrase: string; label: string };
  /** a tick the user must give: «می‌فهمم که برنمی‌گردد» */
  ack?: string;
  cancelLabel?: string;
}> = ({ open, onClose, title, description, children, confirmLabel, onConfirm, typed, ack, cancelLabel = 'انصراف' }) => {
  const [text, setText] = useState('');
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setText(''); setTicked(false); } }, [open]);
  const ready = (!typed || text.trim() === typed.phrase) && (!ack || ticked);
  return (
    <Dialog
      alert size="sm" open={open} onClose={onClose} title={title} description={description}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
          <Button variant="danger" iconStart="Trash2" disabled={!ready} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-stack-md">
        {children}
        {typed && <TextField label={typed.label} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" hint={<span>برای تأیید دقیقاً بنویس: <b className="text-text-default">{typed.phrase}</b></span>} />}
        {ack && <Checkbox label={ack} checked={ticked} onChange={(e) => setTicked(e.target.checked)} />}
      </div>
    </Dialog>
  );
};

/**
 * «حذف دائمی» of one piece of knowledge — two steps. 1) what it touches (versions, changes, outputs built from it, the places that say
 * the same words, with a tick for each copy she wants cleaned); 2) the last word, with a tick. The text is gone from every table.
 */
export const PurgeDialog: React.FC<{ workspaceId: string; object: ContextObject | null; onClose: () => void; onDone: (r: Awaited<ReturnType<typeof dataApi.purgeObject>>) => void }> = ({ workspaceId, object, onClose, onDone }) => {
  const [impact, setImpact] = useState<PurgeImpactInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<{ notes: string[]; thoughts: string[]; sessions: string[]; deliverables: string[] }>({ notes: [], thoughts: [], sessions: [], deliverables: [] });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!object) return undefined;
    let live = true;
    setImpact(null); setError(null); setStep(1); setAck(false);
    dataApi.purgeImpact(workspaceId, object.id).then((r) => {
      if (!live) return;
      setImpact(r.impact);
      // what she wrote herself and may have pasted twice is ticked; an output she made keeps its text unless she says so
      setPicked({ notes: r.impact.copies.notes.map((n) => n.id), thoughts: r.impact.copies.thoughts.map((t) => t.id), sessions: r.impact.copies.sessions.map((c) => c.id), deliverables: [] });
    }).catch((e) => { if (live) setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته؛ دوباره تلاش کن.'); });
    return () => { live = false; };
  }, [workspaceId, object?.id]);
  if (!object) return null;
  const toggle = (k: 'notes' | 'thoughts' | 'sessions' | 'deliverables', id: string) => setPicked((p) => ({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] }));
  const run = async () => {
    setBusy(true);
    try { onDone(await dataApi.purgeObject(workspaceId, object.id, picked)); } catch (e) { setError(e instanceof DataApiError ? e.message : 'حذف نشد؛ دوباره تلاش کن.'); } finally { setBusy(false); }
  };
  const copies = impact?.copies;
  return (
    <Dialog
      alert size="md" open onClose={onClose} title={step === 1 ? `حذف دائمی «${object.title}»` : 'آخرین تأیید'}
      description={step === 1 ? 'متن این مورد از همهٔ جاهای برنامه پاک می‌شود و برنمی‌گردد. اول ببین چه چیزی را لمس می‌کند.' : 'بعد از این، هیچ ردّی از متنش نمی‌ماند؛ فقط یک ردّ بی‌محتوا: «یک مورد حذف دائمی شد».'}
      footer={step === 1
        ? <><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="secondary" disabled={!impact} onClick={() => setStep(2)}>ادامه</Button></>
        : <><Button variant="ghost" onClick={() => setStep(1)}>برگشت</Button><Button variant="danger" iconStart="Trash2" disabled={!ack} loading={busy} onClick={run}>حذف دائمی</Button></>}
    >
      <div className="flex flex-col gap-stack-md">
        {error && <Alert intent="danger">{error}</Alert>}
        {!impact && !error && <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال بررسی" /><span className="body-sm">در حال بررسی…</span></div>}
        {impact && step === 1 && (
          <>
            <ul className="body-md flex list-disc flex-col gap-stack-xs ps-inset-lg text-text-default" data-testid="purge-effects">
              <li>{formatNumber(impact.versions)} نسخه و {formatNumber(impact.changes)} ردّ تغییر (قبل و بعد) پاک می‌شود.</li>
              {impact.relationships > 0 && <li>{formatNumber(impact.relationships)} رابطه با دانش‌های دیگر برداشته می‌شود.</li>}
              <li>اگر پیش‌نویسی دارد، همراهش می‌رود.</li>
              {impact.pointers.thoughtsAbout + impact.pointers.thoughtsConverted > 0 && <li>{formatNumber(impact.pointers.thoughtsAbout + impact.pointers.thoughtsConverted)} فکر دربارهٔ آن بوده یا به آن تبدیل شده؛ می‌مانند ولی منبعشان «حذف‌شده» نشان داده می‌شود.</li>}
              {impact.usedIn.length > 0 && <li>در {formatNumber(impact.usedIn.length)} خروجی استفاده شده ({impact.usedIn.slice(0, 3).map((d) => `«${d.title}»`).join('، ')}{impact.usedIn.length > 3 ? ' و …' : ''}). آن خروجی‌ها متن خودشان را نگه می‌دارند و منبعش «حذف‌شده» نشان داده می‌شود.</li>}
            </ul>
            {copies && (copies.notes.length + copies.thoughts.length + copies.sessions.length + copies.deliverables.length + copies.files.length) > 0 && (
              <section className="flex flex-col gap-stack-sm rounded-control border border-border-default p-inset-lg" aria-label="جاهای دیگری که همین متن هست" data-testid="purge-copies">
                <h3 className="label-md text-text-default">همین متن جاهای دیگر هم هست</h3>
                {copies.notes.map((n) => <Checkbox key={n.id} label={`خط‌های یادداشتِ بخش «${n.nodeLabel}» که این را می‌گویند (${formatNumber(n.lines)} خط) پاک شود`} checked={picked.notes.includes(n.id)} onChange={() => toggle('notes', n.id)} />)}
                {copies.thoughts.map((t) => <Checkbox key={t.id} label={`${t.status === 'open' ? 'فکرِ باز' : 'فکرِ حل‌شده'} در بخش «${t.nodeLabel}» که این را می‌گوید (با همهٔ بازنگری‌هایش) پاک شود`} checked={picked.thoughts.includes(t.id)} onChange={() => toggle('thoughts', t.id)} />)}
                {copies.sessions.map((c) => <Checkbox key={c.id} label={`گفتگوی «${c.title}» حذف شود`} checked={picked.sessions.includes(c.id)} onChange={() => toggle('sessions', c.id)} />)}
                {copies.deliverables.map((d) => <Checkbox key={d.id} label={`خروجی «${d.title}» که همین متن را دارد حذف شود`} checked={picked.deliverables.includes(d.id)} onChange={() => toggle('deliverables', d.id)} />)}
                {copies.files.map((f) => <p key={f.id} className="body-sm text-text-subtle">فایل «{f.name}» هم این متن را دارد؛ از اینجا پاک نمی‌شود، آن را از بخش فایل‌ها حذف کن.</p>)}
              </section>
            )}
          </>
        )}
        {impact && step === 2 && (
          <ul className="body-md flex list-disc flex-col gap-stack-xs ps-inset-lg text-text-default" data-testid="purge-summary">
            <li>«{object.title}»، با همهٔ نسخه‌ها و تاریخچه‌اش، پاک می‌شود.</li>
            {picked.notes.length + picked.thoughts.length + picked.sessions.length + picked.deliverables.length > 0
              ? <li>همین متن از {[picked.notes.length && `${formatNumber(picked.notes.length)} یادداشت`, picked.thoughts.length && `${formatNumber(picked.thoughts.length)} فکر`, picked.sessions.length && `${formatNumber(picked.sessions.length)} گفتگو`, picked.deliverables.length && `${formatNumber(picked.deliverables.length)} خروجی`].filter(Boolean).join('، ')} هم پاک می‌شود.</li>
              : <li>جای دیگری را برای پاک شدن انتخاب نکرده‌ای.</li>}
          </ul>
        )}
        {impact && step === 2 && <Checkbox label="می‌فهمم که این کار برنمی‌گردد" checked={ack} onChange={(e) => setAck(e.target.checked)} />}
      </div>
    </Dialog>
  );
};

/** the one phrase for a removal that can be undone, so every «واگرد» toast reads the same */
export const undoMessage = (what: string, verb: 'حذف' | 'بایگانی' = 'حذف') => `${what} ${verb} شد.`;
export const BadgeRemoved: React.FC = () => <Badge intent="neutral" icon="Archive">بایگانی‌شده</Badge>;
