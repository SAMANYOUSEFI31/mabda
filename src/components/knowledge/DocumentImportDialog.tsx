/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { dataApi, DataApiError } from '../../services/dataApi';
import type { DocumentImportResult, DocumentPreviewInfo } from '../../services/dataApi';
import { mergeWithNext, splitAt } from '../../core/docImportEdit';
import type { ImportChunk } from '../../core/docImportEdit';
import { Alert, Badge, Button, Checkbox, Dialog, Switch, Textarea, formatJalaliDate, formatNumber, useToast, Caution } from '../../ui';

interface Props {
  workspaceId: string;
  onClose: () => void;
  /** the notes are saved: the page reloads what it shows */
  onImported: () => void;
  /** the other way in of this dialog (memory of another tool) */
  onSwitch: () => void;
}

/** a few lines of a long chunk, the rest behind «بیشتر» */
const PREVIEW_CHARS = 420;

/**
 * Import a document of your own (pasted text, .txt, .md, .docx, text .pdf) as notes. No AI: headings, bullets, blank lines and length
 * only. Step 1 pick → step 2 PREVIEW (merge two chunks, split one, leave one out; headings as suggested sections only if you ask)
 * → step 3 saved. By default everything lands in the default place («تازه‌ها»). The whole text stays as a source file.
 */
export const DocumentImportDialog: React.FC<Props> = ({ workspaceId, onClose, onImported, onSwitch }) => {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentPreviewInfo | null>(null);
  const [chunks, setChunks] = useState<ImportChunk[]>([]);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [withSections, setWithSections] = useState(false);
  const [splitting, setSplitting] = useState<{ id: string; caret: number } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<DocumentImportResult | null>(null);

  const fail = (e: unknown) => setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته. دوباره تلاش کن.');
  const kept = chunks.filter((c) => !left.has(c.id));
  const sectionNames = [...new Set(kept.flatMap((c) => (c.sectionHint ? [c.sectionHint] : [])))];

  const runPreview = async () => {
    setBusy(true); setError(null);
    try {
      const p = await dataApi.previewDocument(workspaceId, file ? { file } : { text });
      setPreview(p); setChunks(p.chunks); setLeft(new Set()); setSplitting(null); setExpanded(new Set());
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const r = await dataApi.importDocument(workspaceId, { name: preview.name, text: preview.text, chunks: kept.map((c) => ({ text: c.text, ...(withSections && c.sectionHint ? { section: c.sectionHint } : {}) })) });
      setDone(r);
      onImported();
      if (!r.duplicate) toast.show({ intent: 'success', message: `${formatNumber(r.notes.length)} یادداشت ساخته شد.` });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const reset = () => { setPreview(null); setChunks([]); setDone(null); setError(null); };

  const footer = done
    ? <Button variant="primary" onClick={onClose}>بستن</Button>
    : preview
      ? <><Button variant="ghost" onClick={reset} disabled={busy}>برگشت</Button><Button variant="primary" iconStart="Check" loading={busy} disabled={!!preview.duplicate || kept.length === 0} onClick={save}>{kept.length ? `ساخت ${formatNumber(kept.length)} یادداشت` : 'ساخت یادداشت'}</Button></>
      : <><Button variant="ghost" onClick={onClose}>بستن</Button><Button variant="primary" iconStart="Eye" loading={busy} disabled={!file && !text.trim()} onClick={runPreview}>پیش‌نمایش</Button></>;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="وارد کردن سند"
      description={done ? undefined : 'متن یا فایل خودت را بیاور؛ مبدأ آن را به یادداشت‌های جدا تبدیل می‌کند. پیش از ساخت، تکه‌ها را می‌بینی و می‌توانی درستشان کنی. چیزی دانش یا واقعیت نمی‌شود.'}
      footer={footer}
    >
      <div className="flex flex-col gap-stack-lg">
        {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={preview ? save : runPreview}>دوباره</Button>}>{error}</Alert>}

        {!preview && !done && (
          <div className="flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <input ref={fileInput} type="file" accept=".txt,.md,.pdf,.docx" className="sr-only" aria-label="انتخاب فایل سند" tabIndex={-1} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
              <Button variant="secondary" iconStart="Upload" onClick={() => fileInput.current?.click()}>انتخاب فایل</Button>
              <span className="body-sm text-text-subtle">{file ? file.name : 'txt، md، docx یا pdf متنی، تا ۲۵ مگابایت'}</span>
              {file && <Button size="sm" variant="ghost" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}>برداشتن فایل</Button>}
            </div>
            <Textarea label={file ? 'یا متن را بچسبان (با فایل انتخاب‌شده کاری ندارد)' : 'یا متن را بچسبان'} dir="auto" rows={9} value={text} disabled={!!file} onChange={(e) => setText(e.target.value)} hint="متن بی‌تیتر و نامرتب هم درست وارد می‌شود." />
            <div><Button size="sm" variant="ghost" iconStart="FolderInput" onClick={onSwitch}>به‌جای این، حافظهٔ ابزار دیگر را وارد کن</Button></div>
          </div>
        )}

        {preview && !done && (
          <div className="flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <Badge intent="neutral" icon={false}>{preview.name}</Badge>
              <Badge icon={false}>{formatNumber(chunks.length)} تکه از {formatNumber(preview.chars)} نویسه</Badge>
              {left.size > 0 && <Caution>{formatNumber(left.size)} تکه کنار گذاشته شد</Caution>}
            </div>
            {preview.duplicate && (
              <Alert intent="warning" title="این سند قبلاً وارد شده است">
                «{preview.duplicate.name}» در {formatJalaliDate(preview.duplicate.importedAt)} با {formatNumber(preview.duplicate.noteCount)} یادداشت وارد شد؛ دوباره نمی‌سازم. برای وارد کردن دوباره، فایل قبلی را از «فایل‌ها» حذف کن.
              </Alert>
            )}
            <p className="body-sm text-text-subtle">همه به «تازه‌ها» می‌روند. متن کامل سند به‌عنوان منبع در «فایل‌ها» می‌ماند و هر یادداشت جای خودش را در آن نشان می‌دهد؛ پس کنار گذاشتن یا ادغام کردن چیزی را گم نمی‌کند.</p>

            {sectionNames.length > 0 && (
              <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                <Switch checked={withSections} onChange={(e) => setWithSections(e.target.checked)} label="تیترها را بخش کن" />
                <p className="body-sm text-text-subtle">
                  {withSections ? `بخش‌های تازه (یا هم‌نام موجود) زیر بخش پیش‌فرض: ${sectionNames.join('، ')}` : `تیترها فقط پیشنهادند: ${sectionNames.slice(0, 6).join('، ')}${sectionNames.length > 6 ? '…' : ''}. تا نخواهی بخشی ساخته نمی‌شود.`}
                </p>
              </div>
            )}

            <ol className="flex flex-col gap-stack-sm">
              {chunks.map((c, i) => {
                const off = left.has(c.id);
                const long = c.text.length > PREVIEW_CHARS && !expanded.has(c.id);
                return (
                  <li key={c.id} className={`flex flex-col gap-stack-xs rounded-control-sm border border-border-default p-inset-md ${off ? 'bg-surface-sunken opacity-60' : 'bg-surface-raised'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                      <Checkbox checked={!off} onChange={(e) => setLeft((p) => { const n = new Set(p); if (e.target.checked) n.delete(c.id); else n.add(c.id); return n; })} label={`تکهٔ ${formatNumber(i + 1)}`} />
                      <span className="flex flex-wrap items-center gap-inline-xs">
                        {withSections && c.sectionHint && <Badge icon={false}>بخش: {c.sectionHint}</Badge>}
                        {c.suggestions?.map((sg, k) => <Badge key={k} intent="neutral" icon={false}>پیشنهاد: {sg.label}</Badge>)}
                      </span>
                    </div>
                    {splitting?.id === c.id ? (
                      <div className="flex flex-col gap-stack-xs">
                        <Textarea
                          label="مکان‌نما را جایی بگذار که تکه از آنجا دو تا شود" dir="auto" rows={6} defaultValue={c.text}
                          onSelect={(e) => setSplitting({ id: c.id, caret: e.currentTarget.selectionStart })}
                          onClick={(e) => setSplitting({ id: c.id, caret: e.currentTarget.selectionStart })}
                        />
                        <div className="flex gap-inline-sm">
                          <Button size="sm" variant="secondary" onClick={() => { setChunks((p) => splitAt(p, c.id, splitting.caret)); setSplitting(null); }}>جدا کن</Button>
                          <Button size="sm" variant="ghost" onClick={() => setSplitting(null)}>انصراف</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p dir="auto" className="body-md whitespace-pre-wrap text-text-default">{long ? `${c.text.slice(0, PREVIEW_CHARS)}…` : c.text}</p>
                        <div className="flex flex-wrap gap-inline-sm">
                          {c.text.length > PREVIEW_CHARS && <Button size="sm" variant="ghost" onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}>{long ? 'بیشتر' : 'کمتر'}</Button>}
                          <Button size="sm" variant="ghost" onClick={() => setSplitting({ id: c.id, caret: 0 })}>دو تکه کن</Button>
                          {i < chunks.length - 1 && <Button size="sm" variant="ghost" onClick={() => { setChunks((p) => mergeWithNext(p, c.id)); setLeft((p) => { const n = new Set(p); n.delete(c.id); return n; }); }}>ادغام با بعدی</Button>}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {done && (
          <div className="flex flex-col gap-stack-sm">
            {done.duplicate
              ? <Alert intent="info" title="این سند از قبل وارد شده بود">چیز تازه‌ای ساخته نشد؛ {formatNumber(done.notes.length)} یادداشت قبلی سر جایش است.</Alert>
              : <Alert intent="success" title={`${formatNumber(done.notes.length)} یادداشت ساخته شد`}>{withSections && sectionNames.length ? 'در بخش‌های پیشنهادی و زیر بخش پیش‌فرض. ' : 'در «تازه‌ها»، بخش پیش‌فرض. '}متن کامل سند در «فایل‌ها» نگه داشته شد.</Alert>}
            <p className="body-sm text-text-subtle">جملهٔ پرسشی هر یادداشت خودش «سؤال» می‌شود؛ بقیه فقط یادداشت‌اند تا خودت مرتب‌شان کنی.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
};
