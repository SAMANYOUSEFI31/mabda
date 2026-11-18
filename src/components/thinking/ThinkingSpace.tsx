/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ContextObject, ContextRelationship, Note, ThoughtKind, TreeNode } from '../../types';
import { STRUCTURE_REASON } from '../../core/decisionOrder';
import { effectiveObjects } from '../../core/effectiveContext';
import { THINKING_FA, THOUGHT_KINDS } from '../../core/thoughts';
import { thinkingSpace } from '../../core/thinkingSpace';
import type { SpaceKind } from '../../core/thinkingSpace';
import { flatten, treeIndent, subtreeIds } from '../../core/nodeTree';
import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Menu, SegmentedControl, Select, Textarea, formatNumber, Nuqta, TYPE_META, sampleMark } from '../../ui';
import { BeforeAfter } from '../shared/BeforeAfter';
import { ProposalInbox } from '../knowledge/ProposalInbox';
import { ThinkingList } from './ThinkingList';

type ProposalProps = React.ComponentProps<typeof ProposalInbox>;
interface Props {
  /** «ببین چه عوض می‌شود»: the list of changes if everything waiting is approved (the same engine as the comparison) */
  onCompareIfApproved?: () => void;
  onOptions?: (item: NoteThinkingItem) => void;
  optionCount?: (item: NoteThinkingItem) => number;
  optionTitles?: (item: NoteThinkingItem) => string[];
  thoughts?: NoteThinkingItem[];
  objects: ContextObject[];
  notes: Note[];
  nodes: TreeNode[];
  relationships?: ContextRelationship[];
  /** open from a node's counter: only that node (and below) */
  nodeId?: string;
  onNodeChange: (nodeId: string | undefined) => void;
  /** the empty space's one action: open «افزودن» on «فکر» (in this section when one is picked) */
  onNewThought?: () => void;
  /** the truth map with the suggestions shown: «اگر همه را تأیید کنم؟» */
  onPreviewTruth?: () => void;
  /** a thought becomes a SECTION of the tree */
  onToSection?: (item: NoteThinkingItem) => void;
  onToKnowledge: (item: NoteThinkingItem, type: ContextObject['type']) => Promise<void>;
  onReviseThought?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  onDeriveThought?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  onSynthesizeThought?: (parentIds: string[], nodeId: string, kind: ThoughtKind, text: string) => Promise<boolean>;
  onThinkWithAi?: (thoughtIds: string[]) => void;
  onOpenObject: (o: ContextObject) => void;
  /** «هنوز درست است»: a truth that was flagged for review stays as it is, recorded in its history */
  onAcceptReview?: (id: string) => void;
  onApproveDraft: (id: string) => Promise<void>;
  onRejectDraft: (id: string) => Promise<void>;
  proposals: Omit<ProposalProps, 'objects' | 'nodes' | 'keepOrder' | 'hints'>;
}

const CHIPS: Array<{ id: SpaceKind | 'all'; label: string }> = [
  { id: 'all', label: 'همه' }, { id: 'waiting', label: 'منتظر تو' }, { id: 'idea', label: 'ایده' }, { id: 'question', label: 'سؤال' }, { id: 'assumption', label: 'فرض' }, { id: 'open_decision', label: 'تصمیم باز' },
];

/**
 * «فضای فکر»: one place for everything that is not truth yet. Truth stays clean; a thought becomes knowledge by a yes
 * (a status change, not a move): فکر ← پیشنهادی ← تأییدشده. «منتظر تصمیم تو» is on top: it is a passage, not a place.
 */
export const ThinkingSpace: React.FC<Props> = (p) => {
  const [kind, setKind] = useState<SpaceKind | 'all'>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [synthesis, setSynthesis] = useState<{ text: string; kind: ThoughtKind; nodeId: string } | null>(null);
  const [synthesisBusy, setSynthesisBusy] = useState(false);
  const view = useMemo(() => thinkingSpace({ objects: p.objects, notes: p.notes, thoughts: p.thoughts, nodes: p.nodes, relationships: p.relationships }, { kind: kind === 'all' ? undefined : kind, nodeId: p.nodeId }), [p.objects, p.notes, p.thoughts, p.nodes, p.relationships, kind, p.nodeId]);
  const selectedThoughts = view.thoughts.filter((t) => !!t.id && selectedIds.includes(t.id));
  const selectedThoughtIds = selectedThoughts.flatMap((t) => t.id ? [t.id] : []);
  const selectableCount = view.thoughts.filter((t) => !!t.id).length;
  const truthAnchors = useMemo(() => {
    if (!p.nodeId) return [];
    const anchors = new Map<string, ContextObject>();
    for (const id of subtreeIds(p.nodes, p.nodeId)) {
      for (const o of effectiveObjects(id, p.objects, p.nodes, p.relationships ?? [], new Date())) {
        if (o.status === 'Confirmed') anchors.set(o.id, o);
      }
    }
    return [...anchors.values()];
  }, [p.nodeId, p.objects, p.nodes, p.relationships]);
  useEffect(() => { setSelectMode(false); setSelectedIds([]); setAnchorsOpen(false); }, [kind, p.nodeId]);
  const toggleSelection = (id: string, selected: boolean) => setSelectedIds((ids) => selected ? [...new Set([...ids, id])] : ids.filter((x) => x !== id));
  const startSynthesis = () => {
    if (selectedThoughts.length < 2) return;
    setSynthesis({ text: '', kind: 'idea', nodeId: p.nodeId ?? selectedThoughts[0].nodeId });
  };
  const saveSynthesis = async () => {
    if (!synthesis || !p.onSynthesizeThought || selectedThoughts.length < 2 || !synthesis.text.trim()) return;
    setSynthesisBusy(true);
    try {
      if (await p.onSynthesizeThought(selectedThoughtIds, synthesis.nodeId, synthesis.kind, synthesis.text.trim())) {
        setSynthesis(null);
        setSelectedIds([]);
        setSelectMode(false);
      }
    } finally { setSynthesisBusy(false); }
  };
  const nodeLabel = (id: string) => p.nodes.find((n) => n.id === id)?.label ?? '';
  const proposalsHere = view.waiting.filter((w) => w.type === 'proposal').map((w) => w.object);
  const reviews = view.waiting.filter((w) => w.type === 'review').map((w) => w.object);
  const drafts = view.waiting.filter((w) => w.type === 'draft').map((w) => w.object);
  /** one line under an item whose sub-sections have waiting items too: a hint about the ORDER, never a lock */
  const reasonOf = (id: string) => (view.structure[id] ? `${STRUCTURE_REASON} (${formatNumber(view.structure[id])} مورد در زیربخش‌ها هم منتظر است)` : undefined);
  const proposalHints = Object.fromEntries(proposalsHere.map((o) => [o.id, reasonOf(o.id)]).filter(([, r]) => r)) as Record<string, string>;
  const empty = view.waiting.length + view.thoughts.length + view.assumptions.length === 0;
  const nothingYet = !p.nodeId && Object.values(view.counts).every((n) => !n);
  const count = (k: SpaceKind | 'all') => (k === 'all' ? Object.values(view.counts).reduce((a, b) => a + b, 0) : view.counts[k]);

  // patterns.md «نماها و «…»»: nothing here hides behind «…». Choosing several thoughts is a plain button; «if I approve them all»
  // sits on the «منتظر تصمیم تو» heading it is about, and only when something is waiting
  const previewItems = [
    ...(p.onPreviewTruth ? [{ label: 'نمای کلی حقیقت', icon: 'Workflow' as const, onSelect: p.onPreviewTruth }] : []),
    ...(p.onCompareIfApproved ? [{ label: 'فهرست تغییرها', icon: 'Layers' as const, onSelect: p.onCompareIfApproved }] : []),
  ];

  return (
    <div className="flex flex-col gap-stack-lg" data-testid="thinking-space">
      {/* a space with no thought at all: no filters to choose from yet, only the empty state and its one action */}
      {nothingYet ? null : <div className="flex flex-col gap-stack-sm sm:flex-row sm:items-end">
        {/* phone: one row that scrolls sideways (the chip cut at the edge says there is more), as filter chips do on Android and iOS;
            wider: they wrap, which never happens there in practice (decisions.md §۳۶) */}
        <div role="radiogroup" aria-label="نوع فکر" data-testid="thinking-kind-chips" data-scroll-x className="mb-chip-strip -mx-inset-lg flex gap-inline-xs overflow-x-auto px-inset-lg py-space-1 sm:mx-space-0 sm:flex-wrap sm:overflow-visible sm:px-space-0">
          {/* a kind with nothing in it is not offered (decisions.md §۳۰): a filter that can only show «nothing» is noise, and on a phone
              six chips took two rows. The chosen one stays even at zero, so she can see where she is */}
          {CHIPS.filter((c) => c.id === 'all' || c.id === kind || count(c.id) > 0).map((c) => (
            <Button key={c.id} size="sm" className="shrink-0" variant={kind === c.id ? 'secondary' : 'ghost'} role="radio" aria-checked={kind === c.id} onClick={() => setKind(c.id)}>
              {c.label}{count(c.id) ? ` (${formatNumber(count(c.id))})` : ''}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-inline-xs sm:ms-auto">
          {selectMode && <Button size="sm" variant="ghost" iconStart="X" onClick={() => { setSelectMode(false); setSelectedIds([]); }}>پایان انتخاب</Button>}
          {selectableCount > 0 && !selectMode && <Button size="sm" variant="ghost" iconStart="ListChecks" onClick={() => { setSelectMode(true); setSelectedIds([]); }}>انتخاب</Button>}
          <div className="w-overlay-xs max-w-full"><Select label="کدام بخش؟" value={p.nodeId ?? ''} onChange={(e) => p.onNodeChange(e.target.value || undefined)} options={[{ value: '', label: 'همهٔ بخش‌ها' }, ...flatten(p.nodes).map(({ node, depth }) => ({ value: node.id, label: `${treeIndent(depth)}${node.label}` }))]} /></div>
        </div>
      </div>}

      {empty && (nothingYet || (kind === 'all' && !p.nodeId)
        ? <EmptyState title="اینجا هنوز فکری نیست" description="یک ایده، سؤال یا تصمیم باز را همین‌جا بنویس؛ لازم نیست چیزی بلد باشی." action={p.onNewThought && <Button variant="secondary" iconStart="Plus" onClick={p.onNewThought}>افزودن فکر</Button>} />
        : empty && <EmptyState kind="filtered" title={kind === 'all' ? 'در این بخش فکری نیست' : 'با این فیلتر فکری نیست'} action={<Button variant="secondary" onClick={() => { setKind('all'); p.onNodeChange(undefined); }}>پاک‌کردن فیلترها</Button>} />)}

      {view.waiting.length > 0 && (
        <section className="flex flex-col gap-stack-md" aria-label="منتظر تصمیم تو">
          <div className="flex flex-wrap items-center justify-between gap-inline-sm">
            <h2 className="title text-text-default">منتظر تصمیم تو ({formatNumber(view.waiting.length)})</h2>
            {previewItems.length > 0 && <Menu label="اگر همه را تأیید کنم" align="end" trigger={<Button size="sm" variant="ghost" iconStart="Eye">اگر همه را تأیید کنم</Button>} items={previewItems} />}
          </div>
          {drafts.map((o) => (
            <Card key={o.id} padding="md" knowledge="proposed" className="flex flex-col gap-stack-sm" aria-label={`تغییر در انتظار تأیید: ${o.title}`}>
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="flex flex-col gap-stack-xs"><span className="headline text-text-default">{o.title}</span><span className="body-sm text-text-subtle">تغییرِ {TYPE_META[o.type].label} · {nodeLabel(o.nodeId)}{sampleMark(o)}</span></span>
              </div>
              {reasonOf(o.id) && <p className="body-sm text-text-subtle">{reasonOf(o.id)}</p>}
              <BeforeAfter before={o.content} after={o.draft!.content} />
              {o.draft!.reason && <p className="body-sm text-text-default"><span className="label-sm text-text-subtle">دلیل: </span>{o.draft!.reason}</p>}
              <p className="body-sm text-text-subtle">تا تأیید نشود، خروجی‌ها و بسته‌ها همان متن تأییدشده را می‌بینند.</p>
              <div className="flex flex-wrap gap-inline-sm">
                <Button size="sm" variant="secondary" iconStart="Check" onClick={() => void p.onApproveDraft(o.id)}>تأیید و جایگزین کن</Button>
                <Button size="sm" variant="ghost" iconStart="X" onClick={() => void p.onRejectDraft(o.id)}>رد کن</Button>
                <Button size="sm" variant="ghost" onClick={() => p.onOpenObject(o)}>باز کردن</Button>
              </div>
            </Card>
          ))}
          {proposalsHere.length > 0 && <ProposalInbox {...p.proposals} objects={proposalsHere} nodes={p.nodes} keepOrder hints={proposalHints} />}
          {reviews.length > 0 && (
            <ul className="flex flex-col gap-stack-xs" aria-label="نیاز به بازبینی">
              {reviews.map((o) => (
                <li key={o.id}>
                  {/* a review waits for a DECISION, like a draft (decisions.md §۲۹): it says why and offers both ways out. A bare
                      clickable card opened the truth and left it waiting, so acting on it seemed to change nothing */}
                  <Card padding="md" knowledge="stale" className="flex flex-col gap-stack-xs">
                    <span className="headline text-text-default">{o.title}</span>
                    <span className="body-sm text-text-default">{reasonOf(o.id) || 'چیزی که این حقیقت به آن تکیه دارد عوض شده است.'}</span>
                    <span className="body-sm text-text-subtle">{TYPE_META[o.type].label} · {nodeLabel(o.nodeId)}{sampleMark(o)}</span>
                    <div className="flex flex-wrap gap-inline-sm">
                      {p.onAcceptReview && <Button size="sm" variant="secondary" iconStart="Check" onClick={() => p.onAcceptReview!(o.id)}>هنوز درست است</Button>}
                      <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => p.onOpenObject(o)}>ویرایش</Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view.thoughts.length > 0 && (
        <section className="flex flex-col gap-stack-sm" aria-label="فکرهای باز">
          <h2 className="title text-text-default">فکرهای باز ({formatNumber(view.thoughts.length)})</h2>
          {selectMode && selectedThoughts.length > 0 && (
            <Card padding="md" className="flex flex-wrap items-center gap-inline-sm" aria-label="عملیات فکرهای انتخاب‌شده">
              <span className="body-sm text-text-subtle">{formatNumber(selectedThoughts.length)} فکر انتخاب شده؛ همه تأییدنشده‌اند.</span>
              <Button size="sm" variant="secondary" iconStart="Layers" disabled={selectedThoughts.length < 2} onClick={startSynthesis}>ساخت فکر ترکیبی</Button>
              {p.onThinkWithAi && <Button size="sm" variant="secondary" iconStart="PackageOpen" disabled={selectedThoughts.length > 12} onClick={() => { if (p.onThinkWithAi) p.onThinkWithAi(selectedThoughtIds); }}>درخواست برای ابزار دیگر</Button>}
            </Card>
          )}
          {selectMode && selectedThoughts.length === 0 && <p className="body-sm text-text-subtle">یک یا چند فکر را انتخاب کن تا بتوانی آن‌ها را ترکیب کنی یا برایشان درخواست آماده کنی.</p>}
          <ThinkingList
            items={view.thoughts}
            objects={p.objects}
            nodes={p.nodes}
            workspaceId={p.objects[0]?.workspaceId}
            onConvert={p.onToKnowledge}
            onRevise={p.onReviseThought}
            onDerive={p.onDeriveThought}
            onToSection={p.onToSection}
            onOptions={p.onOptions}
            optionCount={p.optionCount}
            optionTitles={p.optionTitles}
            selectedIds={selectedIds}
            onToggleSelection={selectMode ? toggleSelection : undefined}
          />
        </section>
      )}

      {view.assumptions.length > 0 && (
        <section className="flex flex-col gap-stack-sm" aria-label="فرض‌های فعال">
          <h2 className="title text-text-default">فرض‌های فعال ({formatNumber(view.assumptions.length)})</h2>
          <p className="body-sm text-text-subtle">تأییدشده‌اند و در خروجی‌ها در بخش جدای «فرض» می‌آیند؛ واقعیت نیستند.</p>
          <ul className="flex flex-col gap-stack-xs">
            {view.assumptions.map((o) => (
              <li key={o.id}>
                {/* a knowledge item shown as itself opens by itself, the same as in «منبع حقیقت»: the whole card, with its hover */}
                <Card padding="md" knowledge="truth" onClick={() => p.onOpenObject(o)} className="flex flex-col gap-stack-xs">
                  <span className="headline text-text-default">{o.title}</span><span className="body-sm text-text-subtle">فرض · {nodeLabel(o.nodeId)}{sampleMark(o)}</span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* the section's truth, for reference only: it is NOT part of «فکر», so it is not counted in the chips, sits after the lists
          and stays folded until asked for (with «همهٔ بخش‌ها» it would be the whole source, so it is offered for one section only) */}
      {p.nodeId && kind === 'all' && truthAnchors.length > 0 && (
        <section className="flex flex-col gap-stack-sm border-t border-border-subtle pt-stack-md" aria-label="حقیقتِ این بخش، برای مرجع">
          <div>
            <Button size="sm" variant="ghost" iconEnd={anchorsOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={anchorsOpen} aria-controls="thinking-anchors" onClick={() => setAnchorsOpen((v) => !v)}>
              حقیقتِ این بخش، برای مرجع ({formatNumber(truthAnchors.length)})
            </Button>
          </div>
          {anchorsOpen && <div id="thinking-anchors" className="flex flex-col gap-stack-sm">
            <p className="body-sm text-text-subtle">دانش تأییدشدهٔ این بخش، زیربخش‌ها و قواعدی که از بالا به آن می‌رسند؛ فکر نیستند و در شمارش بالا نمی‌آیند، فقط برای فکر کردن کنار دستت‌اند.</p>
            <ul className="flex flex-col gap-stack-xs">
              {truthAnchors.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <Card padding="md" knowledge="truth" onClick={() => p.onOpenObject(o)} className="flex flex-col gap-stack-xs">
                    <span className="headline text-text-default">{o.title}</span>
                    <p className="body-md whitespace-pre-wrap text-text-default">{o.content}</p>
                    <span className="body-sm text-text-subtle">{TYPE_META[o.type].label}{o.assumption ? ' · فرض' : ''}{o.nodeId !== p.nodeId ? ` · از بخش «${nodeLabel(o.nodeId)}»` : ''}</span>
                  </Card>
                </li>
              ))}
            </ul>
            {truthAnchors.length > 8 && <p className="caption text-text-subtle">۸ مورد نخست از {formatNumber(truthAnchors.length)} مورد مؤثر نمایش داده شده‌اند.</p>}
          </div>}
        </section>
      )}
      {synthesis && (
        <Dialog
          open
          onClose={() => { if (!synthesisBusy) setSynthesis(null); }}
          size="md"
          title="ساخت فکر ترکیبی"
          description={`یک نتیجهٔ تازه بنویس. ${formatNumber(selectedThoughts.length)} فکر مبدأ دست‌نخورده می‌مانند و فقط پیوند مشتق‌سازی ثبت می‌شود.`}
          footer={<><Button variant="ghost" disabled={synthesisBusy} onClick={() => setSynthesis(null)}>انصراف</Button><Button variant="primary" loading={synthesisBusy} disabled={!synthesis.text.trim()} onClick={() => void saveSynthesis()}>ساخت فکر تازه</Button></>}
        >
          <div className="flex flex-col gap-stack-md">
            <Textarea label="نتیجهٔ تازه" rows={4} value={synthesis.text} onChange={(e) => setSynthesis({ ...synthesis, text: e.target.value })} />
            <SegmentedControl label="نوع فکر" value={synthesis.kind} onChange={(value) => setSynthesis({ ...synthesis, kind: value as ThoughtKind })} items={THOUGHT_KINDS.map((k) => ({ id: k, label: THINKING_FA[k] }))} />
            <Select label="بخش فکر تازه" value={synthesis.nodeId} onChange={(e) => setSynthesis({ ...synthesis, nodeId: e.target.value })} options={flatten(p.nodes).map(({ node, depth }) => ({ value: node.id, label: `${treeIndent(depth)}${node.label}` }))} />
          </div>
        </Dialog>
      )}
    </div>
  );
};
