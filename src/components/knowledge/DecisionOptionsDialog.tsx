/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ContextObject, ContextRelationship, TreeNode } from '../../types';
import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { addOption, askText, optionConflicts, optionsOf, removeOption } from '../../core/decisionOptions';
import type { DecisionOption } from '../../core/decisionOptions';
import { aboutTargets, stripAbout } from '../../core/thoughtAbout';
import { Alert, Badge, Button, Dialog, IconButton, Textarea, formatNumber } from '../../ui';
import { MentionTextarea } from '../shared/MentionTextarea';

interface Props {
  open: boolean;
  onClose: () => void;
  /** the open-decision thought; the options are the bullet lines right under it in its note */
  item: NoteThinkingItem | null;
  noteContent: string;
  objects: ContextObject[];
  nodes: TreeNode[];
  relationships: ContextRelationship[];
  /** saves the changed note text (an option added or taken away) */
  onChangeNote: (content: string) => Promise<void>;
  /** «این را انتخاب کن»: a PROPOSED decision with the record; the others stay with their reasons */
  onChoose: (p: { question: string; chosen: DecisionOption; others: Array<{ title: string; reason: string }> }) => Promise<void>;
  /** opens the AI request (kind: decision) with this text, for the person to read and edit first */
  onAskAi: (text: string) => void;
}

/**
 * «گزینه‌های این تصمیم»: the options side by side (stacked on a phone). Each shows what it rests on and — by the deterministic
 * rules only — a guardrail it contradicts. Choosing asks one short thing: why each of the others was set aside; then it becomes
 * a PROPOSED decision and the rest stay in its record. Nothing here is knowledge until the person approves it.
 */
export const DecisionOptionsDialog: React.FC<Props> = (p) => {
  const [draft, setDraft] = useState('');
  const [chosen, setChosen] = useState<DecisionOption | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (p.open) { setDraft(''); setChosen(null); setReasons({}); setError(null); } }, [p.open, p.item?.key]);

  const item = p.item;
  const options = useMemo(() => (item ? optionsOf(p.noteContent, item.endLine ?? item.line, p.objects, p.nodes) : []), [item, p.noteContent, p.objects, p.nodes]);
  const conflicts = useMemo(() => (item ? options.map((o) => optionConflicts(o, item.nodeId, p.objects, p.nodes, p.relationships, new Date())) : []), [item, options, p.objects, p.nodes, p.relationships]);
  if (!item) return null;
  const question = stripAbout(item.text) || item.text;
  const title = (id: string) => p.objects.find((o) => o.id === id)?.title ?? id;

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch { setError('این کار انجام نشد. دوباره تلاش کن.'); } finally { setBusy(false); } };
  const add = () => run(async () => { await p.onChangeNote(addOption(p.noteContent, item.endLine ?? item.line, draft, p.objects, p.nodes)); setDraft(''); });
  const others = chosen ? options.filter((o) => o.line !== chosen.line) : [];
  const ready = !!chosen && others.every((o) => (reasons[o.line] ?? '').trim());
  const confirm = () => chosen && run(async () => { await p.onChoose({ question, chosen, others: others.map((o) => ({ title: o.title, reason: reasons[o.line] ?? '' })) }); p.onClose(); });

  return (
    <Dialog
      open={p.open} onClose={p.onClose} size="xl" title={chosen ? 'چرا بقیه کنار رفتند؟' : 'گزینه‌های این تصمیم'}
      description={chosen ? `«${chosen.title}» انتخاب می‌شود. برای هر گزینهٔ دیگر یک دلیل کوتاه بنویس؛ با تصمیم می‌ماند.` : question}
      footer={chosen
        ? <><Button variant="ghost" onClick={() => setChosen(null)}>برگشت</Button><Button variant="primary" loading={busy} disabled={!ready} onClick={confirm}>ثبت تصمیم</Button></>
        : <><Button variant="ghost" iconStart="Sparkles" disabled={options.length < 2} onClick={() => p.onAskAi(askText(question, options))}>آماده‌سازی درخواست نظر</Button><Button variant="secondary" onClick={p.onClose}>بستن</Button></>}
    >
      <div className="flex flex-col gap-stack-lg">
        {error && <Alert intent="danger" action={<Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={() => void (chosen ? confirm() : add())}>دوباره</Button>}>{error}</Alert>}
        {!chosen && (
          <>
            {options.length === 0 && <p className="body-md text-text-subtle">هنوز گزینه‌ای ننوشته‌ای. هر گزینه یک جملهٔ کوتاه است؛ دست‌کم دو تا بنویس تا بشود مقایسه کرد.</p>}
            {options.length > 0 && (
              <ul className="grid grid-cols-1 gap-inline-lg md:grid-cols-2 xl:grid-cols-3" data-testid="decision-options">
                {options.map((o, i) => (
                  <li key={o.line} className="flex flex-col gap-stack-sm rounded-control border border-border-default bg-surface-raised p-inset-lg">
                    <div className="flex items-start justify-between gap-inline-sm">
                      <p className="title min-w-space-0 flex-1 text-text-default">{o.title}</p>
                      <IconButton icon="X" label={`برداشتن گزینه «${o.title}»`} size="sm" onClick={() => void run(() => p.onChangeNote(removeOption(p.noteContent, o.line)))} />
                    </div>
                    {o.restsOn.length > 0 && <p className="body-sm text-text-subtle">تکیه دارد بر: {o.restsOn.map((id) => `«${title(id)}»`).join('، ')}</p>}
                    {aboutTargets(o.text, p.objects, p.nodes).filter((t) => t.kind === 'node').length > 0 && <p className="body-sm text-text-subtle">دربارهٔ: {aboutTargets(o.text, p.objects, p.nodes).filter((t) => t.kind === 'node').map((t) => t.label).join('، ')}</p>}
                    {conflicts[i].length > 0
                      ? <div className="flex flex-col gap-stack-xs" data-testid="option-conflict">{conflicts[i].map((c) => <Badge key={c.constraint.id} intent="warning" icon="TriangleAlert">با «{c.constraint.title}» تناقض دارد</Badge>)}<p className="body-sm text-text-subtle">{conflicts[i][0].reason}</p></div>
                      : <p className="caption text-text-subtle">تناقض قطعی با خط قرمزهای این بخش پیدا نشد.</p>}
                    <div className="mt-stack-xs"><Button size="sm" variant="secondary" iconStart="Check" onClick={() => setChosen(o)}>این را انتخاب کن</Button></div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-stack-xs">
              <MentionTextarea label="گزینهٔ تازه" rows={2} value={draft} onValueChange={setDraft} objects={p.objects} placeholder="مثلاً: فروش از راه اینستاگرام" hint="با @ نام دانشی را بیاور که این گزینه روی آن تکیه دارد." />
              <div><Button size="sm" variant="secondary" iconStart="Plus" loading={busy} disabled={!draft.trim()} onClick={add}>افزودن گزینه</Button></div>
            </div>
          </>
        )}
        {chosen && (
          <ul className="flex flex-col gap-stack-md">
            {others.length === 0 && <li className="body-md text-text-subtle">گزینهٔ دیگری نیست؛ تصمیم همین‌طور ثبت می‌شود.</li>}
            {others.map((o) => (
              <li key={o.line} className="flex flex-col gap-stack-xs rounded-control border border-border-default bg-surface-raised p-inset-lg">
                <p className="title text-text-default">{o.title}</p>
                {(conflicts[options.findIndex((x) => x.line === o.line)] ?? []).length > 0 && <p className="body-sm text-text-subtle">با «{conflicts[options.findIndex((x) => x.line === o.line)][0].constraint.title}» تناقض دارد.</p>}
                <Textarea label="چرا کنار رفت؟" rows={2} value={reasons[o.line] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [o.line]: e.target.value }))} />
              </li>
            ))}
          </ul>
        )}
        {!chosen && options.length > 0 && <p className="body-sm text-text-subtle">{formatNumber(options.length)} گزینه. با «این را انتخاب کن»، یک تصمیم پیشنهادی ساخته می‌شود و بقیه با دلیلشان در سابقهٔ تصمیم می‌مانند.</p>}
      </div>
    </Dialog>
  );
};
