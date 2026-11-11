/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ChatMessage, ChatSession, ContentBlock, GenerationResult, TreeNode } from '../../types';
import { EXCLUDE_REASON_FA, INCLUDE_REASON_FA, KIND_LABEL, REQUEST_KINDS } from '../../core/aiRequest';
import type { AiRequestResult, ExcludeReason, RequestKind } from '../../core/aiRequest';
import { flatten } from '../../core/nodeTree';
import { dataApi, DataApiError } from '../../services/dataApi';
import { track } from '../../services/usage';
import { asAiError, streamChat } from '../../services/apiClient';
import type { AiErrorInfo } from '../../types';
import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { useAiStatus } from '../../services/aiStatus';
import { AiErrorNotice } from '../shared/AiNotices';
import { ClosedSection } from '../shared/ClosedSection';
import { BlockView } from '../shared/BlockView';
import { Alert, Badge, Button, Checkbox, Dialog, IconButton, Menu, Select, Spinner, TextField, Textarea, ThinkingBadge, formatJalaliDate, formatNumber, useToast } from '../../ui';

type Result = AiRequestResult & { packId: string; recorded: boolean };
interface Props {
  open: boolean;
  workspaceId: string;
  nodes: TreeNode[];
  /** the node the work is about: the current node on a node page, empty on Home (the whole tree) */
  scopeNodeId?: string;
  /** opened with a kind and a text already written (e.g. «از AI نظر بخواه» on a decision's options): the person reads and edits it first */
  initialKind?: RequestKind;
  initialRequest?: string;
  initialThoughtIds?: string[];
  thoughts?: NoteThinkingItem[];
  onClose: () => void;
  onOpenImport: () => void;
  /** earlier answers (the old chat sessions): they stay reachable here, nothing is lost */
  sessions: ChatSession[];
  onSaveSession: (s: ChatSession) => void;
  /** counts the question and records its real usage (the same accounting as the old chat) */
  onAnswered: (result: GenerationResult) => void;
  /** «به دانش اضافه کن»: opens the knowledge dialog with a draft made from the block */
  onAddKnowledge: (block: ContentBlock) => void;
  onSaveAsThought?: (parentIds: string[], nodeId: string, text: string) => Promise<boolean>;
  /** «این خط قرمز را ببین / ویرایش کن»: the rule opens where its reach is decided */
  onOpenObject?: (id: string) => void;
}

const SHOWN = 40;
const THOUGHT_SECTIONS_SCOPE = '__selected_thought_sections__';
const newPackId = () => `rq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * «آماده‌سازی درخواست» (was «درخواست برای AI»): pick the kind of work (default: سؤال), write one line, copy. Mabda assembles the prompt
 * (src/core/aiRequest.ts); the preview is the exact text that is copied. Nothing is generated here — no AI is called.
 */
export const AiRequestDialog: React.FC<Props> = (props) => (props.open ? <Inner {...props} /> : null);

const MODE_OF: Record<RequestKind, 'discovery' | 'audit' | 'advisor'> = { question: 'discovery', audit: 'audit', draft: 'discovery', decision: 'advisor', change_review: 'audit', free: 'discovery' };

const Inner: React.FC<Props> = ({ workspaceId, nodes, scopeNodeId, initialKind, initialRequest, initialThoughtIds, thoughts = [], onClose, onOpenImport, sessions, onSaveSession, onAnswered, onAddKnowledge, onSaveAsThought, onOpenObject }) => {
  const toast = useToast();
  const ai = useAiStatus();
  const [answer, setAnswer] = useState<{ blocks: ContentBlock[]; text: string; streaming: boolean } | null>(null);
  const [answerError, setAnswerError] = useState<AiErrorInfo | null>(null);
  const [past, setPast] = useState<string | null>(null);
  const [kind, setKind] = useState<RequestKind>(initialKind ?? 'question');
  const [request, setRequest] = useState(initialRequest ?? '');
  const [scope, setScope] = useState(initialThoughtIds?.length ? THOUGHT_SECTIONS_SCOPE : scopeNodeId ?? '');
  /** the same switch as a saved pack's: the sub-sections of the section are read too (src/core/packScope.ts) */
  const [withChildren, setWithChildren] = useState(true);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [thoughtIds] = useState(initialThoughtIds ?? []);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'copy' | 'save' | 'answer' | null>(null);
  const [copied, setCopied] = useState(false);
  const [savingThought, setSavingThought] = useState(false);
  const [savedAsThought, setSavedAsThought] = useState(false);
  const packId = useMemo(newPackId, []);
  const meta = REQUEST_KINDS.find((k) => k.kind === kind)!;
  const hasKids = !!scope && nodes.some((n) => n.parentId === scope);
  const selectedThoughts = thoughts.filter((t) => t.id && thoughtIds.includes(t.id));
  const thoughtScopeNodeIds = [...new Set(selectedThoughts.map((t) => t.nodeId))];
  const usesThoughtSections = scope === THOUGHT_SECTIONS_SCOPE;
  const hasMissingThoughts = selectedThoughts.length !== thoughtIds.length;
  const options = useMemo(() => [
    ...(thoughtIds.length ? [{ value: THOUGHT_SECTIONS_SCOPE, label: `بخش‌های فکرهای انتخاب‌شده (${formatNumber(thoughtScopeNodeIds.length)})` }] : []),
    { value: '', label: 'کل کسب‌وکار' },
    ...flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` })),
  ], [nodes, thoughtIds.length, thoughtScopeNodeIds.length]);
  const requestScope = usesThoughtSections ? { scopeNodeIds: thoughtScopeNodeIds, withChildren: false } : { scopeNodeId: scope || undefined, withChildren };

  // the preview follows the choices; typing waits a moment so every key does not ask the server
  useEffect(() => {
    let live = true;
    setCopied(false);
    const t = setTimeout(() => {
      dataApi.aiRequest(workspaceId, { kind, request, ...requestScope, extraIds, thoughtIds, packId })
        .then((r) => { if (live) { setResult(r); setError(null); } })
        .catch((e) => { if (live) setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); });
    }, result ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, kind, request, scope, withChildren, extraIds, thoughtIds, packId]);

  const ready = request.trim().length > 0 && !hasMissingThoughts;
  const copy = async () => {
    setBusy('copy');
    try {
      const r = await dataApi.aiRequest(workspaceId, { kind, request, ...requestScope, extraIds, thoughtIds, packId, record: true });
      try { await navigator.clipboard.writeText(r.markdown); } catch { const ta = document.createElement('textarea'); ta.value = r.markdown; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      setResult(r); setCopied(true); track('action.ai-copy');
      toast.show({ intent: 'success', message: 'کپی شد. در هر ابزاری که می‌خواهی بچسبان؛ جوابش را که گرفتی، «وارد کردن متن آماده» را بزن.' });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'کپی نشد؛ دوباره.' }); } finally { setBusy(null); }
  };
  /** «همین‌جا جواب بده» uses Mabda's platform AI route; failures stay explicit and retryable. */
  const answerHere = async () => {
    if (!ready) return;
    if (!ai.available) { setAnswerError({ kind: 'disabled', message: 'هوش مصنوعی فعلاً در دسترس نیست. بعداً دوباره تلاش کن.', retryable: false } as AiErrorInfo); setAnswer(null); return; }
    setAnswerError(null); setSavedAsThought(false); setAnswer({ blocks: [], text: '', streaming: true }); setBusy('answer');
    let live: ContentBlock[] = [];
    try {
      const res = await streamChat(
        { message: request.trim(), workspaceId, scopeNodeId: usesThoughtSections ? undefined : scope || undefined, scopeNodeIds: usesThoughtSections ? thoughtScopeNodeIds : undefined, focusNodeIds: usesThoughtSections ? thoughtScopeNodeIds : [], chatMode: MODE_OF[kind], thoughtIds, deep: false },
        { onBlock: (b) => { live = [...live, b]; setAnswer({ blocks: live, text: '', streaming: true }); } },
      );
      setAnswer({ blocks: res.blocks, text: res.markdown, streaming: false });
      const now = new Date().toISOString();
      const user: ChatMessage = { id: `msg_u_${Date.now()}`, role: 'user', content: request.trim(), timestamp: now, executionMode: 'auto', creditCost: 0 };
      const asst: ChatMessage = { id: `msg_a_${Date.now()}`, role: 'assistant', content: res.markdown, timestamp: now, executionMode: 'auto', creditCost: 0, blocks: res.blocks, plan: res.plan, usage: res.usage, usedContext: res.usedContext };
      onSaveSession({ id: `sess_${Date.now()}`, workspaceId, title: request.trim().slice(0, 30), createdAt: now, updatedAt: now, chatMode: MODE_OF[kind], selectedNodeIds: usesThoughtSections ? thoughtScopeNodeIds : [], ...(!usesThoughtSections && scope ? { scopeNodeId: scope } : {}), messages: [user, asst] });
      onAnswered(res); track('action.ai-answer');
    } catch (e) { setAnswer(null); setAnswerError(asAiError(e)); } finally { setBusy(null); }
  };
  const saveAsThought = async () => {
    if (!answer?.text || !thoughtIds.length || !onSaveAsThought) return;
    const nodeId = selectedThoughts[0]?.nodeId ?? (scope || nodes[0]?.id);
    if (!nodeId) return;
    setSavingThought(true);
    try { if (await onSaveAsThought(thoughtIds, nodeId, answer.text)) setSavedAsThought(true); }
    finally { setSavingThought(false); }
  };
  const save = async () => {
    setBusy('save');
    try {
      await dataApi.createSavedPack(workspaceId, { name: `${KIND_LABEL[kind]} — ${request.trim().slice(0, 40)}`, instruction: '', selection: { nodeIds: scope ? [scope] : [], facets: [], statuses: [], includeAssumptions: true, withChildren }, kind, template: request.trim() });
      toast.show({ intent: 'success', message: 'درخواست ذخیره شد؛ در «بسته‌های دانش» هر بار با دانش روز ساخته می‌شود.' });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof DataApiError ? e.message : 'ذخیره نشد؛ دوباره.' }); } finally { setBusy(null); }
  };

  const left = useMemo(() => {
    const groups = new Map<ExcludeReason, AiRequestResult['excluded']>();
    for (const e of result?.excluded ?? []) groups.set(e.reason, [...(groups.get(e.reason) ?? []), e]);
    return [...groups.entries()];
  }, [result]);

  return (
    <Dialog
      open onClose={onClose} size="xl" title="آماده‌سازی درخواست" description={thoughtIds.length ? 'دانش تأییدشده جدا می‌آید؛ فکرهای انتخاب‌شده با برچسب «تأییدنشده» می‌آیند و هرگز واقعیت نیستند.' : 'نوع کار را انتخاب کن و یک خط بنویس؛ مبدأ پرامپت اصولی را از دانش تأییدشدهٔ تو می‌چیند.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>بستن</Button>
          <Menu
            label="بیشتر"
            align="start"
            side="top"
            trigger={<IconButton icon="Ellipsis" label="بیشتر" variant="ghost" />}
            items={[
              { label: 'ذخیره به‌عنوان درخواست', icon: 'Package', disabled: !ready || thoughtIds.length > 0, onSelect: () => { void save(); } },
              { label: 'وارد کردن متن آماده', icon: 'Upload', onSelect: () => { onClose(); onOpenImport(); } },
            ]}
          />
          {/* internal AI is frozen (MABDA_MANAGED_AI): «همین‌جا جواب بده» exists only with the flag on; otherwise the copy is the only action */}
          {ai.managedEnabled && <Button variant={ai.available ? 'primary' : 'ghost'} iconStart="Send" disabled={!ready} loading={busy === 'answer'} onClick={answerHere}>همین‌جا جواب بده</Button>}
          <Button variant={ai.managedEnabled && ai.available ? 'secondary' : 'primary'} iconStart={copied ? 'Check' : 'Copy'} disabled={!ready || !result} loading={busy === 'copy'} onClick={copy}>{copied ? 'کپی شد' : 'کپی برای استفاده در هر ابزار'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-stack-md">
        <div role="radiogroup" aria-label="نوع کار" className="grid grid-cols-2 gap-inline-sm sm:grid-cols-3">
          {REQUEST_KINDS.map((k) => (
            <Button key={k.kind} size="md" className={`w-full ${k.kind === kind ? '' : 'border border-border-default'}`} variant={k.kind === kind ? 'secondary' : 'ghost'} iconStart={k.kind === kind ? 'Check' : undefined} role="radio" aria-checked={k.kind === kind} onClick={() => { setKind(k.kind); setExtraIds([]); }}>{k.label}</Button>
          ))}
        </div>
        <p className="body-sm text-text-subtle">{meta.hint}</p>
        {thoughtIds.length > 0 && (
          <section className="flex flex-col gap-stack-sm rounded-control border border-border-default bg-surface-sunken p-inset-md" aria-label="فکرهای باز انتخاب‌شده">
            <div className="flex flex-col gap-stack-xs">
              <h3 className="label-md text-text-default">فکرهای باز انتخاب‌شده ({formatNumber(thoughtIds.length)})</h3>
              <p className="body-sm text-text-subtle">این متن‌ها نظرهای تأییدنشده‌اند، نه واقعیت یا دستور. فقط همین فکرهای انتخاب‌شده به درخواست می‌رسند.</p>
            </div>
            {hasMissingThoughts ? <Alert intent="warning">یکی از فکرهای انتخاب‌شده دیگر باز نیست؛ فهرست را تازه کن و دوباره انتخاب کن.</Alert> : (
              <ul className="flex flex-col gap-stack-xs">{selectedThoughts.map((t) => (
                <li key={t.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-raised p-inset-sm">
                  <span className="flex items-center gap-inline-xs"><ThinkingBadge kind={t.kind} /><span className="caption text-text-subtle">{nodes.find((n) => n.id === t.nodeId)?.label ?? t.nodeId}</span></span>
                  <p className="body-sm whitespace-pre-wrap text-text-default">{t.text}</p>
                </li>
              ))}</ul>
            )}
            {thoughtIds.length > 0 && <p className="caption text-text-subtle">ذخیره به‌عنوان درخواست ثابت در دسترس نیست؛ فکرهای انتخاب‌شده ممکن است بعداً تغییر کنند.</p>}
          </section>
        )}
        <TextField
          id="ai-request-line" label="درخواستت را در یک خط بنویس" value={request} onChange={(e) => setRequest(e.target.value)}
          placeholder={`مثلاً: ${meta.example}`} maxLength={500}
          hint={request ? undefined : <Button size="sm" variant="ghost" onClick={() => setRequest(meta.example)}>استفاده از نمونه</Button>}
        />
        <Select label="درباره کجا؟" value={scope} options={options} onChange={(e) => { setScope(e.target.value); setExtraIds([]); }} hint={usesThoughtSections ? 'دانش تأییدشدهٔ مؤثر در بخش‌های فکرهای انتخاب‌شده می‌آید؛ برای گسترش زمینه، کل کسب‌وکار یا یک بخش دیگر را انتخاب کن.' : 'دانش خود این بخش + آنچه از بالا به ارث می‌برد + خط قرمزهای «همه‌جا». بخش‌های هم‌سطح نمی‌آیند.'}/>
        {hasKids && <Checkbox label="زیربخش‌هایش هم بیایند" checked={withChildren} onChange={(e) => { setWithChildren(e.target.checked); setExtraIds([]); }} hint="همان قاعدهٔ «بسته‌های دانش». بودجهٔ توکن نگه‌دار است: اگر جا نشد، مرتبط‌ترین‌ها می‌آیند و بقیه با دلیل کنار می‌مانند." />}

        {ai.managedEnabled && answerError && <AiErrorNotice error={answerError} onRetry={answerHere} retrying={busy === 'answer'} />}
        {ai.managedEnabled && answer && (
          <section className="flex flex-col gap-stack-sm rounded-control border border-border-default bg-surface-sunken p-inset-lg" aria-label="پاسخ" aria-live="polite">
            <h3 className="label-md text-text-default">پاسخ</h3>
            {answer.blocks.length === 0 && answer.streaming && <div className="body-sm flex items-center gap-inline-sm text-text-subtle"><Spinner size="sm" label="در حال نوشتن" />در حال نوشتن…</div>}
            {answer.blocks.map((b) => <BlockView key={b.id} block={b} onAddToContext={answer.streaming ? undefined : onAddKnowledge} />)}
            {answer.blocks.length === 0 && !answer.streaming && answer.text && <p className="body-md whitespace-pre-line text-text-default">{answer.text}</p>}
            {thoughtIds.length > 0 && !answer.streaming && answer.text && onSaveAsThought && (
              <Button size="sm" variant="secondary" iconStart={savedAsThought ? 'Check' : 'Lightbulb'} loading={savingThought} disabled={savedAsThought} onClick={() => void saveAsThought()}>
                {savedAsThought ? 'به‌عنوان فکر باز ذخیره شد' : 'پاسخ را به‌عنوان فکر تازه نگه دار'}
              </Button>
            )}
          </section>
        )}
        {error && <Alert intent="danger">{error}</Alert>}
        {!result && !error && <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال ساخت" /><span className="body-md">در حال ساخت…</span></div>}
        {result && (
          <ClosedSection keepMounted title={<>با {formatNumber(result.included.length)} مورد از دانشت · حدود {formatNumber(result.tokens)} توکن — جزئیات</>}>
          <div className="mt-stack-md flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-center gap-inline-sm" aria-live="polite">
              <Badge intent="neutral" icon="FileText">حدود {formatNumber(result.tokens)} توکن</Badge>
              <Badge intent="success" icon={false}>شامل شد ({formatNumber(result.included.length)})</Badge>
              <Badge intent="neutral" icon={false}>خارج شد ({formatNumber(result.excluded.length)})</Badge>
              {result.counts.assumptions > 0 && <Badge intent="neutral" icon={false}>{formatNumber(result.counts.assumptions)} فرض (جدا)</Badge>}
              {result.counts.rejected > 0 && <Badge intent="neutral" icon={false}>{formatNumber(result.counts.rejected)} گزینهٔ ردشده</Badge>}
            </div>
            {result.overBudget && <Alert intent="warning">خط قرمزها و تصمیم‌های سراسری از بودجه بیشترند؛ همیشه می‌آیند. دامنه را کوچک‌تر کن.</Alert>}
            {result.longText && <p className="body-sm text-text-subtle">متن بلند است؛ در درخواست خواسته شده اول نقل‌قول‌های مرتبط بیاید.</p>}
            {result.counts.thoughts > 0 && <Badge intent="neutral" icon="Lightbulb">{formatNumber(result.counts.thoughts)} فکرِ انتخاب‌شده (تأییدنشده)</Badge>}
            <Textarea label="پیش‌نمایش (دقیقاً همین متن کپی می‌شود)" rows={10} readOnly value={result.markdown} className="code bidi-plain" />

            <ClosedSection title="شامل شد" count={result.included.length}>
              <ul className="mt-stack-sm flex flex-col gap-stack-xs" aria-label="شامل‌شده‌ها">
                {result.included.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-inline-sm">
                    <span className="body-sm text-text-default">{i.title} <span className="caption text-text-subtle">· {i.nodeLabel}</span></span>
                    <span className="flex items-center gap-inline-xs">
                      <span className="caption text-text-subtle" data-testid="included-from">{i.from} · {INCLUDE_REASON_FA[i.reason]}</span>
                      {i.type === 'Constraint' && onOpenObject && <Button size="sm" variant="ghost" iconStart="Pencil" aria-label={`ببین یا ویرایش خط قرمز «${i.title}»`} onClick={() => onOpenObject(i.id)}>ببین و ویرایش</Button>}
                      {i.reason === 'manual' && <Button size="sm" variant="ghost" onClick={() => setExtraIds((x) => x.filter((id) => id !== i.id))}>برداشتن</Button>}
                    </span>
                  </li>
                ))}
              </ul>
            </ClosedSection>
            {left.length > 0 && (
              <ClosedSection title="خارج شد — با دلیل و امکان افزودن" count={result.excluded.length}>
                <div className="mt-stack-sm flex flex-col gap-stack-md">
                  {left.map(([reason, items]) => (
                    <section key={reason} aria-label={EXCLUDE_REASON_FA[reason]}>
                      <h4 className="label-md text-text-default">{EXCLUDE_REASON_FA[reason]} ({formatNumber(items.length)})</h4>
                      <ul className="flex flex-col gap-stack-xs">
                        {items.slice(0, SHOWN).map((e) => (
                          <li key={e.id} className="flex flex-wrap items-center justify-between gap-inline-sm">
                            <span className="flex min-w-space-0 flex-1 flex-col"><span className="body-sm text-text-default">{e.title} <span className="caption text-text-subtle">· {e.nodeLabel}</span></span><span className="caption text-text-subtle">{e.why}</span></span>
                            {e.canAdd && <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => setExtraIds((x) => [...new Set([...x, e.id])])}>افزودن</Button>}
                          </li>
                        ))}
                      </ul>
                      {items.length > SHOWN && <p className="caption text-text-subtle">و {formatNumber(items.length - SHOWN)} مورد دیگر</p>}
                    </section>
                  ))}
                </div>
              </ClosedSection>
            )}
          </div>
          </ClosedSection>
        )}
        {ai.managedEnabled && sessions.length > 0 && (
          <ClosedSection title="پاسخ‌های قبلی" count={sessions.length}>
            <ul className="mt-stack-sm flex flex-col gap-stack-xs" aria-label="پاسخ‌های قبلی">
              {[...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((sess) => (
                <li key={sess.id} className="flex flex-col gap-stack-xs">
                  <Button size="sm" variant="ghost" aria-expanded={past === sess.id} onClick={() => setPast(past === sess.id ? null : sess.id)}>{sess.title || 'گفتگو'} · {formatJalaliDate(sess.updatedAt)}</Button>
                  {past === sess.id && (
                    <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                      {sess.messages.map((m) => (
                        <div key={m.id} className="flex flex-col gap-stack-xs">
                          {m.role === 'user' ? <p className="body-md text-text-default"><span className="label-sm text-text-subtle">پرسش: </span>{m.content}</p>
                            : m.blocks?.length ? m.blocks.map((b) => <BlockView key={b.id} block={b} onAddToContext={onAddKnowledge} />)
                            : m.content ? <p className="body-md whitespace-pre-line text-text-default">{m.content}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </ClosedSection>
        )}
        <p className="body-sm text-text-subtle">«کپی» فقط متن را آماده می‌کند؛ مبدأ جوابی نمی‌سازد. نمونه‌ها و پیشنهادی‌ها هرگز به‌عنوان واقعیت نمی‌آیند.</p>
      </div>
    </Dialog>
  );
};
