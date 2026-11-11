/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, ThoughtHistoryReport, ThoughtKind, TreeNode } from '../../types';
import { convertedTo } from '../../core/thinkingMarkers';
import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { promotionTypesForThought, THINKING_FA, THOUGHT_KINDS } from '../../core/thoughts';
import { aboutTargets, stripAbout } from '../../core/thoughtAbout';
import { Badge, Button, Checkbox, Dialog, Menu, SegmentedControl, Spinner, Textarea, ThinkingBadge, formatNumber } from '../../ui';
import { formatJalaliDate } from '../../ui/format';
import { dataApi } from '../../services/dataApi';

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
  onRevise?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  onDerive?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  selectedIds?: string[];
  onToggleSelection?: (id: string, selected: boolean) => void;
  /** an open decision: its options side by side (the count is how many it has) */
  onOptions?: (item: NoteThinkingItem) => void;
  optionCount?: (item: NoteThinkingItem) => number;
  empty?: string;
}

/**
 * Persisted Thoughts are presented in the existing compact list; promotion always requires an explicit Knowledge type.
 */
export const ThinkingList: React.FC<Props> = ({ items, objects, nodes, workspaceId, onConvert, onGoToNode, onToSection, onRevise, onDerive, onOptions, optionCount, empty, selectedIds = [], onToggleSelection }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [manage, setManage] = useState<{ item: NoteThinkingItem; mode: 'revise' | 'derive' } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftKind, setDraftKind] = useState<ThoughtKind>('idea');
  const [historyItem, setHistoryItem] = useState<NoteThinkingItem | null>(null);
  const [historyReport, setHistoryReport] = useState<ThoughtHistoryReport | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const label = (id: string) => nodes?.find((n) => n.id === id)?.label ?? id;
  const run = async (item: NoteThinkingItem, type: ContextObject['type']) => { setBusy(item.key); try { await onConvert(item, type); } finally { setBusy(null); } };
  const runManage = async () => {
    if (!manage || !manage.item.id || !draftText.trim()) return;
    setBusy(manage.item.key);
    try {
      const saved = manage.mode === 'revise'
        ? await onRevise?.(manage.item, draftText, draftKind)
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

  if (items.length === 0) return empty ? <p className="body-sm text-text-subtle">{empty}</p> : null;
  return (
    <ul className="flex flex-col gap-stack-xs" aria-label="مورد فکری">
      {items.map((it) => {
        const done = !!convertedTo(it, objects);
        return (
          <li key={it.key} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
            <span className="flex min-w-space-0 flex-1 flex-wrap items-center gap-inline-sm">
              <ThinkingBadge kind={it.kind} />
              <span className="body-md whitespace-pre-wrap text-text-default">{stripAbout(it.text) || it.text}</span>
              {nodes && <span className="caption text-text-subtle">· {label(it.nodeId)}</span>}
              {nodes && (() => { const t = aboutTargets(it.text, objects, nodes, it); return t.length ? <span className="caption text-text-subtle">· دربارهٔ {t.map((x) => x.label).join('، ')}</span> : null; })()}
              {done && <Badge intent="success" icon="Check">تبدیل شد ✓</Badge>}
              {it.sourceState === 'line_deleted' && <Badge intent="neutral" icon="Info">خط از یادداشت حذف شد؛ فکر می‌ماند</Badge>}
              {it.sourceState === 'note_deleted' && <Badge intent="neutral" icon="Info">یادداشتش حذف شد؛ فکر می‌ماند</Badge>}
              {it.resolvedRemoved && <Badge intent="neutral" icon="Archive">منبع حذف‌شده</Badge>}
            </span>
            <span className="flex flex-wrap items-center gap-inline-xs">
              {onToggleSelection && it.id && <Checkbox label={`انتخاب فکر «${stripAbout(it.text).slice(0, 40)}»`} checked={selectedIds.includes(it.id)} onChange={(e) => { if (it.id) onToggleSelection(it.id, e.target.checked); }} />}
              {onGoToNode && <Button size="sm" variant="ghost" onClick={() => onGoToNode(it.nodeId)}>رفتن به گره</Button>}
              {!done && onOptions && it.kind === 'open_decision' && it.noteId && <Button size="sm" variant="secondary" iconStart="Layers" onClick={() => onOptions(it)}>{optionCount?.(it) ? `گزینه‌ها (${formatNumber(optionCount(it))})` : 'گزینه‌ها'}</Button>}
              {!done && onToSection && it.noteId && <Button size="sm" variant="ghost" iconStart="Network" onClick={() => onToSection(it)}>ساخت بخش</Button>}
              {!done && promotionTypesForThought(it.kind).length > 0 && (
                <Menu
                  label="انتقال فکر به دانش"
                  align="end"
                  trigger={<Button size="sm" variant="secondary" iconStart="Wand2" loading={busy === it.key}>به دانش ببر</Button>}
                  items={promotionTypesForThought(it.kind).map((type) => ({
                    label: `قلم پیشنهادی: ${type === 'Fact' ? 'واقعیت' : type === 'Decision' ? 'تصمیم' : 'خط قرمز'}`,
                    icon: type === 'Fact' ? 'FileText' : type === 'Decision' ? 'Target' : 'Shield',
                    onSelect: () => void run(it, type),
                  }))}
                />
              )}
              {it.id && (
                <Menu
                  label="کارهای بیشتر برای فکر"
                  align="end"
                  trigger={<Button size="sm" variant="ghost">بیشتر</Button>}
                  items={[
                    { label: 'دیدن تاریخچه', icon: 'Clock' as const, onSelect: () => void openHistory(it) },
                    ...(!done && onRevise ? [{ label: 'بازنگری متن یا نوع', icon: 'Pencil' as const, onSelect: () => { setDraftText(it.text); setDraftKind(it.kind); setManage({ item: it, mode: 'revise' }); } }] : []),
                    ...(!done && onDerive ? [{ label: 'ساخت فکر تازه از این', icon: 'Network' as const, onSelect: () => { setDraftText(''); setDraftKind('idea'); setManage({ item: it, mode: 'derive' }); } }] : []),
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
          footer={<><Button variant="ghost" disabled={busy !== null} onClick={() => setManage(null)}>انصراف</Button><Button variant="primary" loading={busy === manage.item.key} disabled={!draftText.trim()} onClick={() => void runManage()}>{manage.mode === 'revise' ? 'ذخیرهٔ بازنگری' : 'ساخت فکر مشتق'}</Button></>}
        >
          <div className="flex flex-col gap-stack-md">
            <Textarea label="متن فکر" rows={4} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
            <SegmentedControl label="نوع فکر" value={draftKind} onChange={(value) => setDraftKind(value as ThoughtKind)} items={THOUGHT_KINDS.map((kind) => ({ id: kind, label: THINKING_FA[kind] }))} />
          </div>
        </Dialog>
      )}

      {historyItem && (
        <Dialog
          open
          onClose={() => setHistoryItem(null)}
          size="md"
          title="تاریخچهٔ فکر"
          description="مسیر تغییرات، بازنگری‌ها و منشأ این فکر؛ بدون اثر روی حقیقت کسب‌وکار."
          footer={<Button variant="ghost" onClick={() => setHistoryItem(null)}>بستن</Button>}
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
                              : 'به‌روزرسانی'}
                          </span>
                          <span className="caption text-text-subtle">{formatJalaliDate(entry.at)}</span>
                        </span>
                        {entry.kind === 'revision' && entry.details.beforeText && (
                          <div className="body-sm text-text-subtle">
                            <span className="caption text-text-subtle">متن قبلی: </span>
                            <span className="line-through">{entry.details.beforeText}</span>
                            {entry.details.afterText && <><br /><span className="caption text-text-subtle">متن تازه: </span><span>{entry.details.afterText}</span></>}
                          </div>
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
