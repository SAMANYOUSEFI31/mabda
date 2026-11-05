/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import type { AiErrorInfo, ContextDraft, ContextObject, GeneratedDeliverable, LedgerEntry } from '../types';
import type { PackInfo } from '../types/state';
import { dataApi, DataApiError } from '../services/dataApi';
import { asAiError, generateDeliverableApi } from '../services/apiClient';
import { useAiStatus } from '../services/aiStatus';
import { AiErrorNotice } from './AiNotices';
import { quickStartSummary } from '../core/quickStartSummary';
import { Alert, Badge, Button, Checkbox, Dialog, Markdown, OptionCard, Progress, Select, Spinner, TextField, Textarea, TypeBadge, formatNumber, useToast } from '../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onImported: (created: ContextObject[], ledger: LedgerEntry[]) => void;
  onCreateObjects: (drafts: ContextDraft[]) => Promise<ContextObject[]>;
  onConfirmMany: (ids: string[]) => Promise<void>;
  onSampleDone: (d: GeneratedDeliverable) => void;
  /** the workspace's nodes: the summary names where things went */
  nodes: Array<{ id: string; label: string }>;
  /** «ببین»: close and open that node in the structure */
  onGoToNode: (nodeId: string) => void;
  /** the suggestions that are not approved yet wait in the thinking space */
  onOpenThinking: () => void;
}

type Path = 'text' | 'memory' | 'questions';
const SOURCES = ['ChatGPT', 'Claude', 'Gemini', 'AI دیگر'];
const QUESTIONS: Array<{ key: string; label: string; type: ContextDraft['type']; title: string; nodeId: string; multiline?: boolean }> = [
  { key: 'domain', label: 'روی چه کاری کار می‌کنی؟', type: 'Fact', title: 'حوزهٔ کسب‌وکار و تخصص', nodeId: 'business' },
  { key: 'audience', label: 'مخاطب اصلی تو کیست؟', type: 'Decision', title: 'مخاطب اصلی', nodeId: 'business' },
  { key: 'problem', label: 'بزرگ‌ترین دردِ مشتری‌ات چیست؟', type: 'Fact', title: 'معضل اصلی مخاطب', nodeId: 'business', multiline: true },
  { key: 'value', label: 'چطور آن درد را حل می‌کنی؟', type: 'Decision', title: 'پیشنهاد ارزش و راه‌حل', nodeId: 'product', multiline: true },
  { key: 'difference', label: 'چه چیزی تو را از بقیه جدا می‌کند؟', type: 'Fact', title: 'تمایز کلیدی', nodeId: 'brand' },
];

/**
 * «شروع سریع»: the shortest road from nothing to a first better AI answer — paste text, paste another AI's memory, or answer up to
 * five questions → confirm what Mabda understood → a Context pack ready to paste into ANY AI, plus a sample output made from it.
 * No canned content anywhere: errors are shown as errors, with «دوباره».
 */
export const QuickStartDialog: React.FC<Props> = (props) => (props.open ? <Wizard {...props} /> : null);

const Wizard: React.FC<Props> = ({ onClose, workspaceId, onImported, onCreateObjects, onConfirmMany, onSampleDone, nodes, onGoToNode, onOpenThinking }) => {
  const ai = useAiStatus();
  const toast = useToast();
  const [step, setStep] = useState<'choose' | 'input' | 'review' | 'pack'>('choose');
  const [path, setPath] = useState<Path>('text');
  const [text, setText] = useState('');
  const [source, setSource] = useState(SOURCES[0]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ContextObject[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pack, setPack] = useState<PackInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [sample, setSample] = useState<GeneratedDeliverable | null>(null);
  const [sampleError, setSampleError] = useState<AiErrorInfo | null>(null);
  const [sampling, setSampling] = useState(false);
  const saved = useRef<ContextObject[] | null>(null); // a retry must not create the answers twice

  // what this quick start left behind: the answers (approved) or the extracted items (approved if picked, else still suggestions)
  const made = quickStartSummary(path === 'questions' ? (saved.current ?? []) : created.map((o) => ({ nodeId: o.nodeId, status: picked.has(o.id) ? 'Confirmed' : o.status })), nodes);
  const answered = QUESTIONS.filter((q) => answers[q.key]?.trim());
  const fail = (e: unknown) => setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته. دوباره تلاش کن.');

  const extract = async () => {
    setBusy(true); setError(null);
    try {
      const r = await dataApi.importMemory(workspaceId, { text, sourceLabel: source, mode: path === 'text' ? 'text' : 'memory' });
      onImported(r.created, r.ledger);
      setCreated(r.created);
      setPicked(new Set(r.created.map((o) => o.id)));
      setStep('review');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const saveAnswers = async () => {
    setBusy(true); setError(null);
    try {
      saved.current ??= await onCreateObjects(answered.map((q) => ({ workspaceId, type: q.type, status: 'Confirmed', provenance: 'Onboarding', title: q.title, content: answers[q.key].trim(), nodeId: q.nodeId })));
      setStep('pack');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setError(null);
    try { await onConfirmMany([...picked]); setStep('pack'); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (step !== 'pack') return;
    let live = true;
    setPack(null); setError(null);
    dataApi.createPack(workspaceId, {}).then((p) => { if (live) setPack(p); }).catch((e) => { if (live) fail(e); });
    return () => { live = false; };
  }, [step, workspaceId]);

  const copy = async () => {
    if (!pack) return;
    try { await navigator.clipboard.writeText(pack.markdown); } catch {
      const ta = document.createElement('textarea'); ta.value = pack.markdown; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(true);
    toast.show({ intent: 'success', message: 'کپی شد. آن را اول گفتگوی هر AI بچسبان.' });
  };

  const makeSample = async () => {
    setSampling(true); setSampleError(null);
    try {
      const r = await generateDeliverableApi({
        deliverableId: 'del_positioning_statement', deliverableTitle: 'جملهٔ موقعیت‌یابی اختصاصی', deliverableType: 'Asset',
        acceptanceCriteria: ['عدم وجود ادعاهای عمومی و کلیشه‌ای', 'اشاره صریح به مخاطب هدف و معضل محوری'], workspaceId, targetNodeId: '*', executionMode: 'auto',
      });
      const d: GeneratedDeliverable = {
        id: `del_first_${Date.now()}`, workspaceId, workstreamId: 'main_positioning', deliverableId: 'del_positioning_statement', title: 'جملهٔ موقعیت‌یابی اختصاصی', content: r.markdown,
        blocks: r.blocks, plan: r.plan, usage: r.usage, validationFailed: r.validationFailed, executionMode: 'auto', creditCost: 0, usedContext: r.usedContext, usedFileChunks: r.usedFileChunks,
        critiqueFeedback: r.critiqueFeedback, rebuildCount: 0, createdAt: new Date().toISOString(),
      };
      setSample(d);
      onSampleDone(d);
    } catch (e) { setSampleError(asAiError(e)); } finally { setSampling(false); }
  };

  const stepNo = step === 'choose' ? 1 : step === 'input' ? 2 : step === 'review' ? 3 : 4;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="شروع سریع"
      description="از هر جا که دانشت هست شروع کن؛ در چند دقیقه یک بستهٔ آمادهٔ چسباندن در هر AI داری."
      footer={
        step === 'choose' ? <Button variant="ghost" onClick={onClose}>بعداً</Button>
        : step === 'input' ? (
          <>
            <Button variant="ghost" onClick={() => { setStep('choose'); setError(null); }}>بازگشت</Button>
            {path === 'questions'
              ? <Button variant="primary" loading={busy} disabled={answered.length < 2} onClick={saveAnswers}>ثبت و ساخت بسته</Button>
              : <Button variant="primary" iconStart="Wand2" loading={busy} disabled={text.trim().length < 20} onClick={extract}>استخراج دانش</Button>}
          </>
        )
        : step === 'review' ? (
          <><Button variant="ghost" onClick={() => setStep('pack')}>بدون تأیید ادامه بده</Button><Button variant="primary" loading={busy} disabled={!picked.size} onClick={confirm}>تأیید {formatNumber(picked.size)} مورد و ساخت بسته</Button></>
        ) : (
          <Button variant="primary" onClick={onClose}>تمام شد</Button>
        )
      }
    >
      <div className="flex flex-col gap-stack-lg">
        <Progress value={stepNo} max={4} label={`گام ${formatNumber(stepNo)} از ۴`} showValue={false} />

        {step === 'choose' && (
          <div className="flex flex-col gap-stack-sm">
            <OptionCard title="متن یا یادداشت‌هایم را می‌چسبانم" description="هر متنی دربارهٔ کسب‌وکارت" onClick={() => { setPath('text'); setStep('input'); }} />
            <OptionCard title="حافظهٔ ChatGPT یا Claude را می‌چسبانم" description="هرچه دربارهٔ تو یاد گرفته‌اند" onClick={() => { setPath('memory'); setStep('input'); }} />
            <OptionCard title="به چند سؤال کوتاه جواب می‌دهم" description="حداکثر پنج سؤال کوتاه" onClick={() => { setPath('questions'); setStep('input'); }} />
          </div>
        )}

        {step === 'input' && path !== 'questions' && (
          <div className="flex flex-col gap-stack-md">
            {path === 'memory' && <Select label="این حافظه از کجاست؟" value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES.map((s) => ({ value: s, label: s }))} />}
            {path === 'memory' && <p className="body-sm text-text-subtle">در آن AI بنویس: «هر چیزی که دربارهٔ من و کسب‌وکارم یاد گرفته‌ای را به‌صورت فهرست مرتب بنویس؛ حدس نزن.» و پاسخش را اینجا بچسبان.</p>}
            <Textarea label={path === 'memory' ? 'حافظه' : 'متن'} rows={9} value={text} onChange={(e) => setText(e.target.value)} hint="هرچه استخراج شود «پیشنهادی» است و با نقل همان بخش از متن می‌آید؛ تا تأیید نکنی واقعیت نیست." />
          </div>
        )}

        {step === 'input' && path === 'questions' && (
          <div className="flex flex-col gap-stack-md">
            {QUESTIONS.map((q) => (q.multiline
              ? <Textarea key={q.key} label={q.label} rows={2} value={answers[q.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
              : <TextField key={q.key} label={q.label} value={answers[q.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />))}
            <p className="body-sm text-text-subtle">به دست‌کم دو سؤال جواب بده؛ بقیه را می‌توانی بعداً در «چه چیزی به تو نیاز دارد؟» کامل کنی.</p>
          </div>
        )}

        {step === 'review' && (
          <div className="flex flex-col gap-stack-md">
            {created.length === 0 ? <p className="body-md text-text-subtle">چیزی که به کسب‌وکار مربوط باشد در این متن پیدا نشد؛ بازگرد و متن دیگری بچسبان.</p> : (
              <>
                <p className="body-md text-text-default">مبدأ این‌ها را فهمید. هرکدام را که درست است نگه دار؛ باقی را بردار.</p>
                <ul className="flex flex-col gap-stack-sm">
                  {created.map((o) => (
                    <li key={o.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                      <Checkbox label={<span className="flex flex-wrap items-center gap-inline-sm"><TypeBadge value={o.type} /><span className="label-md text-text-default">{o.title}</span></span>} checked={picked.has(o.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n; })} />
                      <p className="body-md text-text-default">{o.content}</p>
                      {o.source?.quote && <p className="body-sm text-text-subtle">نقل از متن: «{o.source.quote}»</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {step === 'pack' && (
          <div className="flex flex-col gap-stack-lg">
            {!pack && !error && <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال ساخت بسته" /><span className="body-md">در حال ساخت بسته…</span></div>}
            {made.rows.length > 0 && (
              <section className="flex flex-col gap-stack-sm" aria-label="چه ساخته شد" data-testid="quickstart-made">
                <h3 className="title text-text-default">چه ساخته شد</h3>
                <ul className="flex flex-col gap-stack-xs">
                  {made.rows.map((r) => (
                    <li key={r.nodeId} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle p-inset-md">
                      <span className="body-md text-text-default">«{r.label}»: {r.confirmed > 0 ? `${formatNumber(r.confirmed)} تأییدشده` : ''}{r.confirmed > 0 && r.proposed > 0 ? '، ' : ''}{r.proposed > 0 ? `${formatNumber(r.proposed)} پیشنهادی` : ''}</span>
                      <Button size="sm" variant="ghost" onClick={() => { onClose(); onGoToNode(r.nodeId); }}>ببین</Button>
                    </li>
                  ))}
                </ul>
                {made.proposed > 0 && (
                  <Alert intent="info" title={`${formatNumber(made.proposed)} مورد پیشنهادی است`} action={<Button size="sm" variant="secondary" onClick={() => { onClose(); onOpenThinking(); }}>رفتن به فضای فکر</Button>}>
                    پیشنهادی‌ها هنوز جزو حقیقت نیستند و به AI نمی‌رسند. در «فضای فکر» هرکدام را تأیید یا رد کن.
                  </Alert>
                )}
              </section>
            )}
            {pack && (
              <section className="flex flex-col gap-stack-sm" aria-label="بستهٔ دانش">
                <h3 className="title text-text-default">بستهٔ دانش تو آماده است</h3>
                <div className="flex flex-wrap items-center gap-inline-sm">
                  <Badge intent="success" icon={false}>{formatNumber(pack.counts.confirmed)} واقعیت تأییدشده</Badge>
                  <Badge intent="neutral" icon={false}>حدود {formatNumber(pack.tokens)} توکن</Badge>
                </div>
                <ol className="body-md flex list-persian list-decimal flex-col gap-stack-xs ps-inset-xl text-text-default">
                  <li>کپی کن.</li>
                  <li>اول یک گفتگوی تازه در ChatGPT، Claude یا هر AI دیگر بچسبان.</li>
                  <li>بعد سؤالت را بپرس؛ پاسخ را با قبل مقایسه کن.</li>
                </ol>
                <div><Button variant="secondary" iconStart={copied ? 'Check' : 'Copy'} onClick={copy}>{copied ? 'کپی شد' : 'کپی بسته'}</Button></div>
              </section>
            )}
            <section className="flex flex-col gap-stack-sm" aria-label="خروجی نمونه">
              <h3 className="title text-text-default">یک خروجی نمونه از همین دانش</h3>
              {!ai.available && <AiErrorNotice error={{ kind: 'disabled', message: 'هوش مصنوعی فعلاً در دسترس نیست؛ بستهٔ بالا همچنان آماده است.', retryable: false }} />}
              {sampleError && <AiErrorNotice error={sampleError} onRetry={makeSample} retrying={sampling} />}
              {sample ? (
                <div className="flex flex-col gap-stack-sm">
                  <div className="rounded-control border border-border-default bg-surface-sunken p-inset-lg"><Markdown>{sample.content}</Markdown></div>
                  <p className="body-sm text-text-subtle">این خروجی از {formatNumber(sample.usedContext.length)} قلم دانش ساخته شد؛ اگر یکی را عوض کنی، خروجی «نیاز به بازبینی» می‌گیرد.</p>
                </div>
              ) : (
                <div><Button variant="secondary" iconStart="Sparkles" loading={sampling} disabled={!ai.available || !pack} onClick={makeSample}>ساخت جملهٔ موقعیت‌یابی</Button></div>
              )}
            </section>
          </div>
        )}

        {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={step === 'input' ? (path === 'questions' ? saveAnswers : extract) : step === 'review' ? confirm : () => setStep('pack')}>دوباره</Button>}>{error}</Alert>}
      </div>
    </Dialog>
  );
};
