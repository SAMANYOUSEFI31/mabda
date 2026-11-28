/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BeforeAfter } from '../shared/BeforeAfter';
import type { ContextObject, ThoughtHistoryReport, ThoughtKind, TreeNode } from '../../types';
import { convertedTo } from '../../core/thinkingMarkers';
import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { promotionTypesForThought, THINKING_FA, THOUGHT_KINDS } from '../../core/thoughts';
import { aboutTargets, stripAbout } from '../../core/thoughtAbout';
import type { AboutTarget } from '../../core/thoughtAbout';
import { AboutPicker } from './AboutPicker';
import { Badge, Button, Checkbox, Dialog, IconButton, Menu, SegmentedControl, Spinner, Textarea, ThinkingBadge, THINKING_LABEL, formatNumber, Nuqta, cx, useLeaving } from '../../ui';
import { formatJalaliDate } from '../../ui/format';
import { dataApi } from '../../services/dataApi';
import { DELETED_SECTION } from '../../core/nodeTree';

interface Props {
  items: NoteThinkingItem[];
  objects: ContextObject[];
  /** show the node an item lives in (home) */
  nodes?: TreeNode[];
  workspaceId?: string;
  onConvert: (item: NoteThinkingItem, type: ContextObject['type']) => Promise<void>;
  onGoToNode?: (nodeId: string) => void;
  /** «ساخت بخش»: the thought becomes a section of the tree (she picks the name and the parent) */
  onToSection?: (item: NoteThinkingItem) => void;
  /** `about`: what the thought is about, when she changed it (§۵۳ ۱۱: it was set only when the thought was made) */
  onRevise?: (item: NoteThinkingItem, text: string, kind: ThoughtKind, about?: AboutTarget[]) => Promise<boolean>;
  onDerive?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  selectedIds?: string[];
  onToggleSelection?: (id: string, selected: boolean) => void;
  /** an open decision: its options side by side (the count is how many it has) */
  onOptions?: (item: NoteThinkingItem) => void;
  optionCount?: (item: NoteThinkingItem) => number;
  /** the titles of an open decision's options (shown under it) */
  optionTitles?: (item: NoteThinkingItem) => string[];
  empty?: string;
}

/**
 * Persisted Thoughts are presented in the existing compact list; promotion always requires an explicit Knowledge type.
 */
export const ThinkingList: React.FC<Props> = ({ items, objects, nodes, workspaceId, onConvert, onGoToNode, onToSection, onRevise, onDerive, onOptions, optionCount, optionTitles, empty, selectedIds = [], onToggleSelection }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [manage, setManage] = useState<{ item: NoteThinkingItem; mode: 'revise' | 'derive' } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftKind, setDraftKind] = useState<ThoughtKind>('idea');
  const [draftAbout, setDraftAbout] = useState<AboutTarget[]>([]);
  const [historyItem, setHistoryItem] = useState<NoteThinkingItem | null>(null);
  const [historyReport, setHistoryReport] = useState<ThoughtHistoryReport | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const label = (id: string) => nodes?.find((n) => n.id === id)?.label ?? DELETED_SECTION;
  const run = async (item: NoteThinkingItem, type: ContextObject['type']) => { setBusy(item.key); try { await onConvert(item, type); } finally { setBusy(null); } };
  // only a change she made is sent: an untouched picker must not turn the words of the text into stored links
  const aboutChanged = (it: NoteThinkingItem) => { const was = nodes ? aboutTargets(it.text, objects, nodes, it) : []; const k = (l: AboutTarget[]) => l.map((t) => `${t.kind}:${t.id}`).sort().join('|'); return k(was) !== k(draftAbout); };
  const runManage = async () => {
    if (!manage || !manage.item.id || !draftText.trim()) return;
    setBusy(manage.item.key);
    try {
      const saved = manage.mode === 'revise'
        ? await onRevise?.(manage.item, draftText, draftKind, aboutChanged(manage.item) ? draftAbout : undefined)
        : await onDerive?.(manage.item, draftText, draftKind);
      if (saved) setManage(null);
    } finally { setBusy(null); }
  };

  const openHistory = async (it: NoteThinkingItem) => {
    if (!it.id) return;
    setHistoryItem(it);
    setHistoryReport(null);
    setHistoryLoading(true);
    try {
      const wid = workspaceId || objects[0]?.workspaceId || '';
      if (wid) {
        const report = await dataApi.thoughtHistory(wid, it.id);
        setHistoryReport(report);
      }
    } catch {
      // Fallback: report remains null and simple card is shown
    } finally {
      setHistoryLoading(false);
    }
  };

  // a thought that leaves this list (made into a proposal, deleted, moved) fades and its gap closes; one just captured comes in
  const { rows, rowRef } = useLeaving(items, (it) => it.key);
  if (rows.length === 0) return empty ? <p className="body-sm text-text-subtle">{empty}</p> : null;
  return (
    <ul className="flex flex-col gap-stack-xs" aria-label="مورد فکری" data-selecting={selectedIds.length > 0 || undefined}>
      {rows.map(({ item: it, entering }) => {
        const done = !!convertedTo(it, objects);
        return (
          <li key={it.key} ref={rowRef(it.key)} data-knowledge={done ? 'past' : 'thought'} className={cx(entering && 'mb-appear', 'mb-knowledge flex flex-col gap-stack-sm p-inset-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-inline-sm')}>
            <Nuqta state={done ? 'past' : 'thought'} className="mb-knowledge__nuqta" />
            <span className="flex min-w-space-0 flex-1 flex-col gap-stack-xs">
              <span className={`body-md whitespace-pre-wrap ${done ? 'text-text-subtle line-through' : 'text-text-default'}`}>{stripAbout(it.text) || it.text}</span>
              <span className="body-sm text-text-subtle">
                {THINKING_LABEL[it.kind]}{done ? ' · حقیقت شد' : ''}{nodes ? ` · ${label(it.nodeId)}` : ''}
                {nodes && (() => { const t = aboutTargets(it.text, objects, nodes, it); return t.length ? ` · دربارهٔ ${t.map((x) => x.label).join('، ')}` : ''; })()}
              </span>
              {/* UX-STR-01: an open decision shows what it is choosing between, not only how many */}
              {!done && it.kind === 'open_decision' && (optionTitles?.(it).length ?? 0) > 0 && (
                <ul className="flex flex-col gap-stack-xs" aria-label="گزینه‌ها">
                  {optionTitles!(it).slice(0, 4).map((t, i) => <li key={i} className="body-sm flex items-start gap-inline-xs text-text-default"><span aria-hidden className="text-text-subtle">–</span><span className="line-clamp-1">{t}</span></li>)}
                  {optionTitles!(it).length > 4 && <li className="caption text-text-subtle">و {formatNumber(optionTitles!(it).length - 4)} گزینهٔ دیگر</li>}
                </ul>
              )}
              {it.sourceState === 'line_deleted' && <Badge intent="neutral" icon="Info">خط از یادداشت حذف شد؛ فکر می‌ماند</Badge>}
              {it.sourceState === 'note_deleted' && <Badge intent="neutral" icon="Info">یادداشتش حذف شد؛ فکر می‌ماند</Badge>}
              {it.resolvedRemoved && <Badge intent="neutral" icon="FileX">منبع حذف‌شده</Badge>}
            </span>
            <span className="flex flex-wrap items-center gap-inline-xs">
              {/* §۵۴ ۱۵: a box on every open thought, no «انتخاب» mode first. Quiet on a desk until the row is pointed at or focused, or
                  something is ticked; always visible on touch (nothing is hover-only) */}
              {onToggleSelection && it.id && !done && <span className="think-pick"><Checkbox aria-label={`انتخاب فکر «${stripAbout(it.text).slice(0, 40)}»`} label={<span className="sr-only">{`انتخاب فکر «${stripAbout(it.text).slice(0, 40)}»`}</span>} checked={selectedIds.includes(it.id)} onChange={(e) => { if (it.id) onToggleSelection(it.id, e.target.checked); }} /></span>}
              {onGoToNode && <Button size="sm" variant="ghost" onClick={() => onGoToNode(it.nodeId)}>رفتن به بخش</Button>}
              {!done && onOptions && it.kind === 'open_decision' && it.noteId && <Button size="sm" variant="secondary" iconStart="ListTree" onClick={() => onOptions(it)}>{optionCount?.(it) ? `گزینه‌ها (${formatNumber(optionCount(it))})` : 'گزینه‌ها'}</Button>}
              {!done && promotionTypesForThought(it.kind).length > 0 && (
                <Menu
                  label="انتقال فکر به دانش"
                  align="end"
                  trigger={<Button size="sm" variant="secondary" iconStart="BookUp" loading={busy === it.key}>پیشنهاد به حقیقت</Button>}
                  items={promotionTypesForThought(it.kind).map((type) => ({
                    // where it lands is said, not assumed: the proposal goes to the thought's section (it is changeable when approving)
                    label: `پیشنهاد ${type === 'Fact' ? (it.kind === 'assumption' ? 'فرض' : 'واقعیت') : type === 'Decision' ? 'تصمیم' : 'خط قرمز'}${nodes ? ` در «${label(it.nodeId)}»` : ''}`,
                    icon: type === 'Fact' ? 'FileText' : type === 'Decision' ? 'Target' : 'Ban',
                    onSelect: () => void run(it, type),
                  }))}
                />
              )}
              {(it.id || (!done && onToSection && it.noteId)) && (
                <Menu
                  label="کارهای بیشتر برای فکر"
                  align="end"
                  trigger={<IconButton icon="Ellipsis" size="sm" label="کارهای بیشتر برای فکر" />}
                  items={[
                    // «ساخت بخش» is used now and then: under «بیشتر», not on every row
                    ...(!done && onToSection && it.noteId ? [{ label: 'ساخت بخش از این فکر', icon: 'FolderPlus' as const, onSelect: () => onToSection(it) }] : []),
                    ...(it.id ? [{ label: 'باز کردن تاریخچه', icon: 'History' as const, onSelect: () => void openHistory(it) }] : []),
                    ...(!done && onRevise ? [{ label: 'بازنگری متن، نوع یا «دربارهٔ»', icon: 'Pencil' as const, onSelect: () => { setDraftText(it.text); setDraftKind(it.kind); setDraftAbout(nodes ? aboutTargets(it.text, objects, nodes, it) : []); setManage({ item: it, mode: 'revise' }); } }] : []),
                    ...(!done && onDerive ? [{ label: 'ساخت فکر تازه از این', icon: 'CopyPlus' as const, onSelect: () => { setDraftText(''); setDraftKind('idea'); setManage({ item: it, mode: 'derive' }); } }] : []),
                  ]}
                />
              )}
            </span>
          </li>
        );
      })}
      {manage && (
        <Dialog
          open
          onClose={() => setManage(null)}
          size="md"
          title={manage.mode === 'revise' ? 'بازنگری فکر' : 'ساخت فکر تازه از این'}
          description={manage.mode === 'revise' ? 'تغییر متن یا نوع، شناسهٔ همین فکر را نگه می‌دارد؛ فقط تغییر معنایی متن در تاریخچه می‌آید.' : 'فکر تازه شناسهٔ جدا دارد و به فکر مبدأ پیوند می‌خورد؛ فکر مبدأ دست‌نخورده می‌ماند.'}
          footer={<><Button variant="ghost" data-cancel disabled={busy !== null} onClick={() => setManage(null)}>انصراف</Button><Button variant="primary" loading={busy === manage.item.key} disabled={!draftText.trim()} onClick={() => void runManage()}>{manage.mode === 'revise' ? 'ذخیرهٔ بازنگری' : 'ساخت فکر مشتق'}</Button></>}
        >
          <div className="flex flex-col gap-stack-md">
            <Textarea label="متن فکر" rows={4} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
            <SegmentedControl label="نوع فکر" value={draftKind} onChange={(value) => setDraftKind(value as ThoughtKind)} items={THOUGHT_KINDS.map((kind) => ({ id: kind, label: THINKING_FA[kind] }))} />
            {manage.mode === 'revise' && manage.item.id && nodes && <AboutPicker objects={objects} nodes={nodes} value={draftAbout} onChange={setDraftAbout} />}
          </div>
        </Dialog>
      )}

      {historyItem && (
        <Dialog
          open
          onClose={() => setHistoryItem(null)}
          size="md"
          title="تاریخچهٔ فکر"
          description="مسیر تغییرات، بازنگری‌ها و منشأ این فکر؛ بدون اثر روی حقیقت."
          footer={<Button variant="ghost" data-cancel onClick={() => setHistoryItem(null)}>بستن</Button>}
        >
          {historyLoading ? (
            <div className="flex justify-center p-inset-lg"><Spinner size="md" /></div>
          ) : (
            <div className="flex flex-col gap-stack-md">
              <div className="flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
                <span className="flex items-center gap-inline-xs">
                  <ThinkingBadge kind={historyReport?.thought.kind ?? historyItem.kind} />
                  <span className="caption text-text-subtle">وضعیت: {historyReport?.thought.status === 'resolved' ? 'به نتیجه رسیده' : 'باز'}</span>
                </span>
                <p className="body-md text-text-default">{historyReport?.thought.text ?? historyItem.text}</p>
              </div>

              {historyReport?.entries && historyReport.entries.length > 0 && (
                <div className="flex flex-col gap-stack-xs">
                  <h4 className="label-sm text-text-default">رخدادهای ثبت‌شده ({formatNumber(historyReport.entries.length)})</h4>
                  <ul className="flex flex-col gap-stack-xs">
                    {historyReport.entries.map((entry, idx) => (
                      <li key={idx} className="flex flex-col gap-stack-xxs rounded-control-sm border border-border-subtle bg-surface-page p-inset-sm">
                        <span className="flex items-center justify-between gap-inline-xs">
                          <span className="label-xs text-text-subtle">
                            {entry.kind === 'created' ? 'ایجاد اولیه'
                              : entry.kind === 'revision' ? 'بازنگری متن'
                              : entry.kind === 'reclassification' ? 'تغییر نوع'
                              : entry.kind === 'resolved' ? 'به نتیجه رسیدن'
                              : entry.kind === 'derived' ? 'اشتقاق'
                              : entry.kind === 'source_line_deleted' ? 'خط از یادداشت حذف شد'
                              : entry.kind === 'source_note_deleted' ? 'یادداشت حذف شد'
                              : entry.kind === 'moved' ? 'جابه‌جایی بخش'
                              : 'به‌روزرسانی'}
                          </span>
                          <span className="caption text-text-subtle">{formatJalaliDate(entry.at)}</span>
                        </span>
                        {/* the same «قبل / بعد» as a truth's versions: only the words that changed are marked (decisions.md §۵۱) */}
                        {entry.kind === 'revision' && entry.details.beforeText && (
                          <BeforeAfter before={entry.details.beforeText} after={entry.details.afterText ?? ''} />
                        )}
                        {entry.kind === 'moved' && entry.details.beforeNodeId && entry.details.afterNodeId && (
                          <p className="body-sm text-text-subtle">از «{label(entry.details.beforeNodeId)}» به «{label(entry.details.afterNodeId)}»</p>
                        )}
                        {entry.kind === 'reclassification' && entry.details.beforeKind && entry.details.afterKind && (
                          <p className="body-sm text-text-subtle">
                            از {THINKING_FA[entry.details.beforeKind]} به {THINKING_FA[entry.details.afterKind]}
                          </p>
                        )}
                        {entry.kind === 'created' && entry.details.sourceQuote && (
                          <p className="body-sm text-text-subtle">
                            برگرفته از نقل یادداشت: «{entry.details.sourceQuote}»
                          </p>
                        )}
                        {entry.kind === 'resolved' && (
                          <p className="body-sm text-text-subtle">
                            تبدیل به پیشنهاد یا بخش در درخت
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {historyReport?.derivedThoughts && historyReport.derivedThoughts.length > 0 && (
                <div className="flex flex-col gap-stack-xs">
                  <h4 className="label-sm text-text-default">فکرهای مشتق‌شده ({formatNumber(historyReport.derivedThoughts.length)})</h4>
                  <ul className="flex flex-col gap-stack-xs">
                    {historyReport.derivedThoughts.map((dt) => (
                      <li key={dt.id} className="flex items-center justify-between gap-inline-xs rounded-control-sm border border-border-subtle bg-surface-page p-inset-sm">
                        <span className="body-sm text-text-default">{dt.text}</span>
                        {dt.kind && <ThinkingBadge kind={dt.kind} />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {historyReport?.proposedObject && (
                <div className="flex flex-col gap-stack-xxs rounded-control-sm border border-border-subtle bg-surface-raised p-inset-sm">
                  <span className="label-xs text-text-subtle">دانش پیشنهادی ایجادشده:</span>
                  <span className="body-md text-text-default">{historyReport.proposedObject.title}</span>
                </div>
              )}
            </div>
          )}
        </Dialog>
      )}
    </ul>
  );
};
