/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { tehranDay } from '../../core/tehranDate';
import React, { useEffect, useMemo, useState } from 'react';
import type { ContextChange, ContextObject, GeneratedDeliverable, TreeNode } from '../../types';
import { NodePickerField } from '../structure/NodePicker';
import { affectedOutputs, approvalMoments, compareDays, compareTruth, customRange, groupBySection, mostImportant, presetMoments, reasonFor, successionOf, summarySentence, toMarkdown, truthAt, truthIfApproved } from '../../core/truthCompare';
import type { ChangeKind, TruthDelta } from '../../core/truthCompare';
import { DateField, Alert, Badge, Button, Checkbox, Dialog, SegmentedControl, TextField, TypeBadge, formatJalaliDate, formatJalaliDateTime, formatNumber, useToast } from '../../ui';
import { BeforeAfter } from '../shared/BeforeAfter';

export type CompareMode = 'week' | 'approval' | 'pending' | 'custom';

interface Props {
  open: boolean;
  onClose: () => void;
  mode?: CompareMode;
  scopeNodeId?: string;
  objects: ContextObject[];
  changes: ContextChange[];
  nodes: TreeNode[];
  deliverables: GeneratedDeliverable[];
  onOpenObject: (o: ContextObject) => void;
  onOpenAssets?: () => void;
}

const KIND_FA: Record<ChangeKind, string> = { added: 'افزوده شد', removed: 'حذف شد', changed: 'تغییر کرد', moved: 'جابه‌جا شد', reach: 'جای اعمالش عوض شد' };
const KIND_INTENT: Record<ChangeKind, 'success' | 'danger' | 'info' | 'neutral' | 'warning'> = { added: 'success', removed: 'danger', changed: 'info', moved: 'neutral', reach: 'warning' };
const PER_GROUP = 8;

/**
 * «حقیقت در دو لحظه»: what the source of truth said then versus now (or «اگر همه را تأیید کنم»), grouped by section, with the
 * outputs that would need a look. The engine is src/core/truthCompare.ts; this only chooses the moments and shows the result.
 */
export const TruthCompareDialog: React.FC<Props> = (p) => {
  const toast = useToast();
  const whatIf = p.mode === 'pending';
  const [mode, setMode] = useState<CompareMode>(p.mode ?? 'week');
  const [scope, setScope] = useState(p.scopeNodeId ?? '');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  /** «اگر تأیید کنم»: the waiting items the person leaves OUT of this what-if */
  const [skip, setSkip] = useState<Set<string>>(new Set());
  /** a section the person opened (true) or folded (false); the first three are open until then */
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  useEffect(() => { if (p.open) { setMode(p.mode ?? 'week'); setScope(p.scopeNodeId ?? ''); setFold({}); setShown({}); setSkip(new Set()); setFrom(''); setTo(''); } }, [p.open, p.mode, p.scopeNodeId]);

  const now = useMemo(() => new Date(), [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const moments = useMemo(() => approvalMoments(p.changes, 8, p.objects), [p.changes, p.objects]);
  const preset = useMemo(() => presetMoments(now, moments), [now, moments]);
  const range = useMemo(() => {
    if (mode === 'week') return { a: preset.weekAgo, b: now.toISOString(), label: 'هفتهٔ پیش ← امروز' };
    if (mode === 'approval') return preset.lastApproval ? { a: preset.lastApproval, b: now.toISOString(), label: 'قبل از آخرین تأیید ← امروز' } : null;
    if (mode === 'custom') return from && to ? { ...customRange(from, to), label: `${formatJalaliDate(from)} ← ${formatJalaliDate(to)}` } : null;
    return { a: now.toISOString(), b: now.toISOString(), label: 'امروز ← اگر همه را تأیید کنم' };
  }, [mode, preset, now, from, to]);

  const result = useMemo(() => {
    if (!p.open || !range) return null;
    const A = truthAt({ objects: p.objects, changes: p.changes }, range.a);
    const B = mode === 'pending' ? truthIfApproved({ objects: p.objects }, { now: range.b }) : truthAt({ objects: p.objects, changes: p.changes }, range.b);
    return compareTruth(A, B, { nodes: p.nodes, scopeNodeId: scope || undefined, succession: successionOf(p.objects) });
  }, [p.open, range, mode, p.objects, p.changes, p.nodes, scope]);
  // the what-if without the items she unticked: the same engine with `only`
  const counted = useMemo(() => {
    if (!result || mode !== 'pending' || skip.size === 0 || !range) return result;
    const only = new Set(result.deltas.map((d) => d.id).filter((id) => !skip.has(id)));
    return compareTruth(truthAt({ objects: p.objects, changes: p.changes }, range.a), truthIfApproved({ objects: p.objects }, { now: range.b, only }), { nodes: p.nodes, scopeNodeId: scope || undefined, succession: successionOf(p.objects) });
  }, [result, mode, skip, range, p.objects, p.changes, p.nodes, scope]);

  const groups = useMemo(() => (result ? groupBySection(result, p.nodes) : []), [result, p.nodes]);
  const outputs = useMemo(() => (counted ? affectedOutputs(counted, p.deliverables, mode === 'pending' ? undefined : range?.b) : []), [counted, p.deliverables, mode, range]);
  const top = counted ? mostImportant(counted) : undefined;
  const byId = useMemo(() => new Map(p.objects.map((o) => [o.id, o])), [p.objects]);
  const scopeLabel = scope ? p.nodes.find((n) => n.id === scope)?.label : '';
  const title = `مقایسهٔ حقیقت${scopeLabel ? ` — ${scopeLabel}` : ''}: ${range?.label ?? ''}`;

  const copy = async () => {
    if (!counted) return;
    try { await navigator.clipboard.writeText(toMarkdown(counted, p.nodes, title, formatNumber, outputs)); toast.show({ intent: 'success', message: 'کپی شد؛ هر جا خواستی بچسبان.' }); }
    catch { toast.show({ intent: 'danger', message: 'کپی نشد. دوباره تلاش کن.' }); }
  };
  const open = (d: TruthDelta) => { const o = byId.get(d.id); if (o) { p.onClose(); p.onOpenObject(o); } };
  const days = compareDays(now);
  /** one chip per day (approvals are one per minute, so a busy day used to show twice) */
  const momentDays = useMemo(() => { const seen = new Set<string>(); return moments.filter((m) => { const d = tehranDay(m); if (seen.has(d)) return false; seen.add(d); return true; }).slice(0, 3); }, [moments]);
  /** «دلخواه» starts from the days of what she was looking at, so changing one end does not start from nothing */
  const choose = (m: CompareMode) => {
    if (m === 'custom' && !from && !to) {
      setFrom(mode === 'approval' && preset.lastApproval ? tehranDay(preset.lastApproval) : days.weekAgo);
      setTo(days.today);
    }
    setMode(m);
  };
  const rangeSentence = mode === 'week' ? `از ${formatJalaliDate(preset.weekAgo)} تا امروز، ${formatJalaliDate(now)}`
    : mode === 'approval' ? (preset.lastApproval ? `از پیش از آخرین تأیید (${formatJalaliDateTime(moments[0])}) تا امروز` : '')
    : mode === 'pending' ? 'امروز، در برابر وقتی همهٔ منتظرها تأیید شوند'
    : from && to ? `از آغاز ${formatJalaliDate(from)} تا پایان ${formatJalaliDate(to)}` : '';

  return (
    <Dialog
      open={p.open} onClose={p.onClose} size="xl" title={whatIf ? 'اگر همه را تأیید کنم' : 'حقیقت چه عوض شد؟'}
      description={whatIf ? 'حقیقت امروز در برابر وقتی همهٔ پیشنهادها و پیش‌نویس‌های منتظر تأیید شوند؛ هر کدام را می‌شود از این فرض بیرون گذاشت.' : 'دو لحظه را مقایسه کن؛ افزوده، حذف، تغییر و جابه‌جایی، بخش‌به‌بخش.'}
      footer={<><Button variant="ghost" data-cancel onClick={p.onClose}>بستن</Button><Button variant="secondary" iconStart="Copy" disabled={!counted || counted.counts.total === 0} onClick={() => void copy()}>کپی Markdown</Button></>}
    >
      <div className="flex flex-col gap-stack-lg">
        {/* two questions, two groups (decisions.md «مقایسهٔ منبع»): WHEN (one choice; the date fields exist only for «دلخواه», so a
            preset never sits next to empty or stale dates) and WHERE. The sentence under the choice always names the real days. */}
        <div className="flex flex-col gap-stack-md">
          <div className="flex flex-col gap-stack-sm">
            {/* «اگر تأیید کنم» is another question (a what-if, not two moments in time): it opens from «فکر», where the waiting items
                are, with no time choice (decisions.md §۲۵) */}
            {!whatIf && <SegmentedControl label="کدام دو لحظه؟" value={mode} onChange={(v) => choose(v as CompareMode)} items={[{ id: 'week', label: 'هفتهٔ پیش' }, { id: 'approval', label: 'آخرین تأیید' }, { id: 'custom', label: 'دلخواه' }]} />}
            {!whatIf && <p className="caption text-text-subtle" data-testid="compare-range">{rangeSentence}</p>}
            {mode === 'custom' && (
              <div className="flex flex-col gap-stack-sm rounded-control border border-border-subtle p-inset-md" data-testid="custom-dates">
                <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
                  <DateField label="از روز" hint="خود این روز هم حساب است." value={from} max={to || days.today} onValueChange={setFrom} />
                  <DateField label="تا روز" value={to} max={days.today} min={from || undefined} onValueChange={setTo} />
                </div>
                <div className="flex flex-wrap items-center gap-inline-xs">
                  <span className="caption text-text-subtle">زودتر:</span>
                  <Button size="sm" variant="ghost" onClick={() => { setFrom(days.monthStart); setTo(days.today); }}>از اول ماه</Button>
                  {momentDays.map((m) => <Button personal key={m} size="sm" variant="ghost" aria-label={`از روز تأیید ${formatJalaliDate(m)} تا امروز`} onClick={() => { setFrom(tehranDay(m)); setTo(days.today); }}>از تأیید {formatJalaliDate(m)}</Button>)}
                </div>
              </div>
            )}
          </div>
          <NodePickerField label="کجا؟" nodes={p.nodes} value={scope} onChange={setScope} extra={[{ value: '', label: 'همهٔ بخش‌ها' }]} />
        </div>

        {mode === 'approval' && !range && <Alert intent="info">هنوز تأییدی ثبت نشده که با آن مقایسه کنیم.</Alert>}
        {mode === 'custom' && !range && <p className="body-sm text-text-subtle">هر دو روز را انتخاب کن.</p>}

        {result && range && (
          <div className="flex flex-col gap-stack-lg" aria-live="polite">
            {result.counts.total === 0 ? (
              <div className="rounded-control border border-border-subtle bg-surface-sunken p-inset-lg" data-testid="compare-empty">
                <p className="body-md text-text-default">{mode === 'pending' ? 'چیزی در انتظار تأیید نیست؛ حقیقت همین است که هست.' : 'در این بازه چیزی عوض نشده است.'}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-stack-xs" data-testid="compare-summary">
                  <p className="heading-xs text-text-default">{summarySentence(counted ?? result, formatNumber)}</p>
                  {top && <p className="body-sm text-text-subtle">مهم‌ترین: «{(top.after ?? top.before)!.title}» — {top.kinds.map((k) => KIND_FA[k]).join('، ')}</p>}
                </div>
                {outputs.length > 0 && (
                  <section className="flex flex-col gap-stack-xs rounded-control border border-border-warning-subtle bg-bg-warning-subtle p-inset-md" aria-label="خروجی‌های اثرپذیر" data-testid="compare-outputs">
                    <h3 className="label-md text-text-default">{formatNumber(outputs.length)} خروجی از این تغییرها قدیمی می‌شود</h3>
                    <ul className="flex flex-col gap-stack-xs">{outputs.slice(0, 6).map((o) => <li key={o.id} className="body-sm text-text-default">{o.title} <span className="text-text-subtle">— از روی «{o.because.slice(0, 2).join('»، «')}»{o.because.length > 2 ? ` و ${formatNumber(o.because.length - 2)} مورد دیگر` : ''}</span></li>)}</ul>
                    {p.onOpenAssets && <div><Button size="sm" variant="ghost" iconStart="Package" onClick={() => { p.onClose(); p.onOpenAssets?.(); }}>باز کردن خروجی‌ها</Button></div>}
                  </section>
                )}
                <div className="flex flex-col gap-stack-md">
                  {groups.map((g, gi) => {
                    const isClosed = !(fold[g.nodeId] ?? gi < 3);
                    const limit = shown[g.nodeId] ?? PER_GROUP;
                    return (
                      <section key={g.nodeId} className="flex flex-col gap-stack-sm" aria-label={g.label}>
                        <Button personal size="sm" variant="ghost" className="self-start" iconStart={isClosed ? 'ChevronDown' : 'ChevronUp'} aria-expanded={!isClosed} onClick={() => setFold((f) => ({ ...f, [g.nodeId]: isClosed }))}>{g.label} ({formatNumber(g.deltas.length)})</Button>
                        {!isClosed && (
                          <>
                            <ul className="flex flex-col gap-stack-sm">
                              {g.deltas.slice(0, limit).map((d) => {
                                const it = (d.after ?? d.before)!;
                                return (
                                  <li key={d.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default bg-surface-raised p-inset-md">
                                    <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                                      <span className="flex min-w-space-0 flex-wrap items-center gap-inline-xs">
                                        {d.kinds.map((k) => <Badge key={k} icon={false}>{KIND_FA[k]}</Badge>)}
                                        <span className="label-md text-text-default">{it.title}</span><TypeBadge value={it.type} iconOnly />
                                      </span>
                                      {byId.has(d.id) && <Button size="sm" variant="ghost" onClick={() => open(d)}>جزئیات و تاریخچه</Button>}
                                    </div>
                                    {mode === 'pending' && <Checkbox label="در این فرض بیاید" checked={!skip.has(d.id)} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(d.id); else n.add(d.id); return n; })} />}
                                    {range && (() => { const why = reasonFor([d.id, d.before?.id ?? d.id, d.after?.id ?? d.id], p.changes, range.a, range.b); return why ? <p className="body-sm text-text-subtle" data-testid="change-reason">دلیل: {why}</p> : null; })()}
                                    {d.kinds.includes('moved') && d.before && d.after && <p className="body-sm text-text-subtle">از «{p.nodes.find((n) => n.id === d.before!.nodeId)?.label ?? '؟'}» به «{p.nodes.find((n) => n.id === d.after!.nodeId)?.label ?? '؟'}»</p>}
                                    {d.kinds.includes('reach') && d.before && d.after && <p className="body-sm text-text-subtle">{d.after.reach === 'global' ? 'حالا همه‌جا اعمال می‌شود.' : 'حالا فقط در همین بخش اعمال می‌شود.'}</p>}
                                    {d.diff && d.before && d.after && <BeforeAfter before={`${d.before.title}\n${d.before.content}`} after={`${d.after.title}\n${d.after.content}`} />}
                                    {d.kinds.includes('added') && d.after && <p className="body-sm line-clamp-3 text-text-default">{d.after.content}</p>}
                                    {d.kinds.includes('removed') && d.before && <p className="body-sm line-clamp-3 text-text-subtle line-through">{d.before.content}</p>}
                                  </li>
                                );
                              })}
                            </ul>
                            {g.deltas.length > limit && <div><Button size="sm" variant="ghost" onClick={() => setShown((s) => ({ ...s, [g.nodeId]: limit + 20 }))}>{formatNumber(g.deltas.length - limit)} مورد دیگر</Button></div>}
                          </>
                        )}
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};
