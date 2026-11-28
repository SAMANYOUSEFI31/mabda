/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AboutTarget } from '../../core/thoughtAbout';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContextObject, ContextRelationship, Note, ThoughtKind, TreeNode } from '../../types';
import { STRUCTURE_REASON } from '../../core/decisionOrder';
import { effectiveObjects } from '../../core/effectiveContext';
import { THINKING_FA, THOUGHT_KINDS } from '../../core/thoughts';
import { thinkingSpace } from '../../core/thinkingSpace';
import type { SpaceKind } from '../../core/thinkingSpace';
import { subtreeIds } from '../../core/nodeTree';
import type { NoteThinkingItem } from '../../core/thinkingMarkers';
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, IconButton, Menu, SegmentedControl,  Textarea, formatNumber, Nuqta, TYPE_META, sampleMark } from '../../ui';
import { NodePickerField } from '../structure/NodePicker';
import { BeforeAfter } from '../shared/BeforeAfter';
import { ProposalInbox } from '../knowledge/ProposalInbox';
import { ThinkingList } from './ThinkingList';

type ProposalProps = React.ComponentProps<typeof ProposalInbox>;
interface Props {
  /** what heads the reading column (the scope chip, contradictions): beside the filters on a wide page, under them on a narrow one */
  lead?: React.ReactNode;
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
  onReviseThought?: (item: NoteThinkingItem, text: string, kind: ThoughtKind, about?: AboutTarget[]) => Promise<boolean>;
  onDeriveThought?: (item: NoteThinkingItem, text: string, kind: ThoughtKind) => Promise<boolean>;
  onSynthesizeThought?: (parentIds: string[], nodeId: string, kind: ThoughtKind, text: string) => Promise<boolean>;
  onThinkWithAi?: (thoughtIds: string[]) => void;
  onOpenObject: (o: ContextObject) => void;
  /** «هنوز درست است»: a truth that was flagged for review stays as it is, recorded in its history */
  onAcceptReview?: (id: string) => void;
  onApproveDraft: (id: string) => Promise<unknown>;
  onRejectDraft: (id: string) => Promise<void>;
  proposals: Omit<ProposalProps, 'objects' | 'nodes' | 'keepOrder' | 'hints'>;
}

/** what the list holds, one facet: the decisions waiting for her and the four kinds of thought. Several at once (OR), none = all */
const KINDS: Array<{ id: SpaceKind; label: string }> = [
  { id: 'waiting', label: 'منتظر تو' }, { id: 'idea', label: 'ایده' }, { id: 'question', label: 'سؤال' }, { id: 'assumption', label: 'فرض' }, { id: 'open_decision', label: 'تصمیم باز' },
];

/**
 * «فضای فکر»: one place for everything that is not truth yet. Truth stays clean; a thought becomes knowledge by a yes
 * (a status change, not a move): فکر ← پیشنهادی ← تأییدشده. «منتظر تصمیم تو» is on top: it is a passage, not a place.
 */
export const ThinkingSpace: React.FC<Props> = (p) => {
  const [kinds, setKinds] = useState<SpaceKind[]>([]);
  const kind = kinds.length ? kinds.join() : 'all'; // a key: what is chosen, for the effects and the empty state
  const toggleKind = (k: SpaceKind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const [filtersOpen, setFiltersOpen] = useState(false);
  // the page's title row holds the filter button (PageHead `tools`); the slot is there once the head is on screen
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById('thinking-filter-slot')); }, []);
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // selecting is not a mode (§۵۴ ۱۵): each open thought has its own box, and the actions appear once one is ticked
  const selectMode = selectedIds.length > 0;
  const [synthesis, setSynthesis] = useState<{ text: string; kind: ThoughtKind; nodeId: string } | null>(null);
  const [synthesisBusy, setSynthesisBusy] = useState(false);
  const view = useMemo(() => thinkingSpace({ objects: p.objects, notes: p.notes, thoughts: p.thoughts, nodes: p.nodes, relationships: p.relationships }, { kinds, nodeId: p.nodeId }), [p.objects, p.notes, p.thoughts, p.nodes, p.relationships, kinds, p.nodeId]);
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
  useEffect(() => { setSelectedIds([]); setAnchorsOpen(false); }, [kind, p.nodeId]);
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
  const count = (k: SpaceKind) => view.counts[k];
  const shownCount = view.waiting.length + view.thoughts.length + view.assumptions.length;
  const activeFilters = kinds.length + (p.nodeId ? 1 : 0);
  const clearFilters = () => { setKinds([]); p.onNodeChange(undefined); };
  // a kind with nothing in it is not offered (decisions.md §۳۰); a chosen one stays even at zero, so she can see where she is
  const offered = KINDS.filter((c) => kinds.includes(c.id) || count(c.id) > 0);

  // patterns.md «نماها و «…»»: nothing here hides behind «…». Choosing several thoughts is a plain button; «if I approve them all»
  // sits on the «منتظر تصمیم تو» heading it is about, and only when something is waiting
  const previewItems = [
    ...(p.onPreviewTruth ? [{ label: 'نمای کلی حقیقت', icon: 'Workflow' as const, onSelect: p.onPreviewTruth }] : []),
    ...(p.onCompareIfApproved ? [{ label: 'فهرست تغییرها', icon: 'GitCompareArrows' as const, onSelect: p.onCompareIfApproved }] : []),
  ];

  return (
    // one reading column at every width (the page frame, decisions.md §۵۳ ۹; 680, the reading measure): on a wide frame a row's
    // action stayed ~600px from its title (Gestalt proximity, Fitts) once the filter margin was gone; its filters are the title row's «فیلترها (n)»
    <div className="flex w-full max-w-reading flex-col gap-stack-lg" data-testid="thinking-space">
      {/* a space with no thought at all: no filters to choose from yet, only the empty state and its one action */}
      {/* the filters are filters (round 3, «نقش‌کور»): one facet «what» with several at once (OR, faceted search, NN/g) and the
          section (AND), behind ONE control in the title's row, «فیلترها (n)», at every width (round 4, the user on a computer: the
          wide margin column was a second way to the same thing, and a facet column is for catalogues with many facets, not six).
          It opens the facets in a sheet with the live count (iOS Mail and Files; Android Gmail; Divar, Digikala on a phone). What
          waits for her is the first group of the list under its own heading, so no «منتظر تو» shortcut beside it */}
      {!nothingYet && <>
        {slot && createPortal(
          <Button size="sm" variant={activeFilters ? 'secondary' : 'ghost'} iconStart="Filter" aria-haspopup="dialog" data-testid="thinking-filter-button" onClick={() => setFiltersOpen(true)}>
            {activeFilters ? `فیلترها (${formatNumber(activeFilters)})` : 'فیلترها'}
          </Button>, slot)}
        <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} side size="md" title="فیلتر فکرها"
          footer={<><Button variant="primary" onClick={() => setFiltersOpen(false)}>{`نمایش ${formatNumber(shownCount)} مورد`}</Button>{activeFilters > 0 && <Button variant="ghost" onClick={clearFilters}>پاک‌کردن فیلترها</Button>}</>}>
          <div className="flex flex-col gap-stack-lg">
            <fieldset className="flex flex-col gap-stack-sm">
              <legend className="label-md mb-stack-sm text-text-default">چه چیزی؟</legend>
              {offered.map((c) => <Checkbox key={c.id} label={`${c.label} (${formatNumber(count(c.id))})`} checked={kinds.includes(c.id)} onChange={() => toggleKind(c.id)} />)}
            </fieldset>
            <NodePickerField label="کدام بخش؟" nodes={p.nodes} value={p.nodeId ?? ''} onChange={(v) => p.onNodeChange(v || undefined)} extra={[{ value: '', label: 'همهٔ بخش‌ها' }]} />
          </div>
        </Dialog>
      </>}

      <div className="flex flex-col gap-stack-lg">
      {p.lead}
      {empty && (nothingYet || (kind === 'all' && !p.nodeId)
        ? <EmptyState title="اینجا هنوز فکری نیست" description="یک ایده، سؤال یا تصمیم باز را همین‌جا بنویس؛ لازم نیست چیزی بلد باشی." action={p.onNewThought && <Button variant="secondary" iconStart="Plus" onClick={p.onNewThought}>افزودن فکر</Button>} />
        : empty && <EmptyState kind="filtered" title={kind === 'all' ? 'در این بخش فکری نیست' : 'با این فیلتر فکری نیست'} action={<Button variant="secondary" onClick={clearFilters}>پاک‌کردن فیلترها</Button>} />)}

      {view.waiting.length > 0 && (
        <section className="flex flex-col gap-stack-md" aria-label="منتظر تو">
          <div className="flex flex-wrap items-center justify-between gap-inline-sm">
            <h2 className="heading-sm text-text-default">منتظر تو ({formatNumber(view.waiting.length)})</h2>
            {previewItems.length > 0 && <Menu label="اگر همه را تأیید کنم" align="end" trigger={<Button size="sm" variant="ghost" iconStart="Eye">اگر همه را تأیید کنم</Button>} items={previewItems} />}
          </div>
          {/* three kinds of decision wait here, each under its own sub-heading in the same style («پیشنهادها» had one, the
              rewrites and the reviews did not; decisions.md §۴۹). The name «منتظر تو» stays: it holds more than proposals */}
          {drafts.length > 0 && (
            <div className="flex flex-col gap-stack-xs">
              <h3 className="headline text-text-default">تغییرها ({formatNumber(drafts.length)})</h3>
              <p className="body-sm text-text-subtle">متن تازه برای حقیقتی که هست. تا تأیید نشود، خروجی‌ها و بسته‌ها همان متن تأییدشده را می‌بینند.</p>
            </div>
          )}
          {drafts.map((o) => (
            <Card key={o.id} padding="md" knowledge="proposed" className="flex flex-col gap-stack-sm" aria-label={`تغییر در انتظار تأیید: ${o.title}`}>
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="flex flex-col gap-stack-xs"><span className="headline text-text-default">{o.title}</span><span className="body-sm text-text-subtle">تغییرِ {TYPE_META[o.type].label} · {nodeLabel(o.nodeId)}{sampleMark(o)}</span></span>
              </div>
              {reasonOf(o.id) && <p className="body-sm text-text-subtle">{reasonOf(o.id)}</p>}
              <BeforeAfter before={o.content} after={o.draft!.content} />
              {o.draft!.reason && <p className="body-sm text-text-default"><span className="label-sm text-text-subtle">دلیل: </span>{o.draft!.reason}</p>}
              <div className="flex flex-wrap gap-inline-sm">
                <Button size="sm" variant="secondary" iconStart="Check" onClick={() => void p.onApproveDraft(o.id)}>جایگزینی</Button>
                {/* the same three, in the same order, as every waiting proposal: decide, change, refuse (§۳۸) */}
                <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => p.onOpenObject(o)}>ویرایش</Button>
                <Button size="sm" variant="ghost" iconStart="X" onClick={() => void p.onRejectDraft(o.id)}>رد</Button>
              </div>
            </Card>
          ))}
          {proposalsHere.length > 0 && <ProposalInbox {...p.proposals} objects={proposalsHere} nodes={p.nodes} keepOrder nested hints={proposalHints} />}
          {reviews.length > 0 && <h3 className="headline text-text-default">نیاز به بازبینی ({formatNumber(reviews.length)})</h3>}
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
          <h2 className="heading-sm text-text-default">فکرهای باز ({formatNumber(view.thoughts.length)})</h2>
          {selectMode && selectedThoughts.length > 0 && (
            <Card padding="none" className="think-bar flex items-center gap-inline-sm p-inset-sm shadow-overlay" aria-label="عملیات فکرهای انتخاب‌شده">
              {/* one row at every width (a phone too): the count, the main thing to do, the rest under ⋯, and a way out */}
              <span className="body-sm min-w-space-0 flex-1 text-text-subtle">{formatNumber(selectedThoughts.length)} فکر انتخاب شده{selectedThoughts.length < 2 ? '؛ برای ترکیب، یکی دیگر هم انتخاب کن' : ''}</span>
              <Button size="sm" variant="secondary" iconStart="Combine" disabled={selectedThoughts.length < 2} onClick={startSynthesis}>ساخت فکر ترکیبی</Button>
              {p.onThinkWithAi && <Menu label="کارهای دیگر با فکرهای انتخاب‌شده" align="end" trigger={<IconButton icon="Ellipsis" label="کارهای دیگر با فکرهای انتخاب‌شده" size="sm" />}
                items={[{ label: selectedThoughts.length > 12 ? `درخواست برای ابزار دیگر (تا ${formatNumber(12)} فکر)` : 'درخواست برای ابزار دیگر', text: 'درخواست برای ابزار دیگر', icon: 'PackageOpen', disabled: selectedThoughts.length > 12, onSelect: () => { if (p.onThinkWithAi) p.onThinkWithAi(selectedThoughtIds); } }]} />}
              <IconButton icon="X" label="لغو انتخاب" size="sm" onClick={() => setSelectedIds([])} />
            </Card>
          )}
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
            onToggleSelection={selectableCount > 0 ? toggleSelection : undefined}
          />
        </section>
      )}

      {view.assumptions.length > 0 && (
        <section className="flex flex-col gap-stack-sm" aria-label="فرض‌های فعال">
          <div className="flex flex-col gap-stack-xs">
            <h2 className="heading-sm text-text-default">فرض‌های فعال ({formatNumber(view.assumptions.length)})</h2>
            <p className="body-sm text-text-subtle">تأییدشده‌اند و در خروجی‌ها در بخش جدای «فرض» می‌آیند؛ واقعیت نیستند.</p>
          </div>
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
      </div>
      {synthesis && (
        <Dialog
          open
          onClose={() => { if (!synthesisBusy) setSynthesis(null); }}
          size="md"
          title="ساخت فکر ترکیبی"
          description={`یک نتیجهٔ تازه بنویس. ${formatNumber(selectedThoughts.length)} فکر مبدأ دست‌نخورده می‌مانند و فقط پیوند مشتق‌سازی ثبت می‌شود.`}
          footer={<><Button variant="ghost" data-cancel disabled={synthesisBusy} onClick={() => setSynthesis(null)}>انصراف</Button><Button variant="primary" loading={synthesisBusy} disabled={!synthesis.text.trim()} onClick={() => void saveSynthesis()}>ساخت فکر تازه</Button></>}
        >
          <div className="flex flex-col gap-stack-md">
            <Textarea label="نتیجهٔ تازه" rows={4} value={synthesis.text} onChange={(e) => setSynthesis({ ...synthesis, text: e.target.value })} />
            <SegmentedControl label="نوع فکر" value={synthesis.kind} onChange={(value) => setSynthesis({ ...synthesis, kind: value as ThoughtKind })} items={THOUGHT_KINDS.map((k) => ({ id: k, label: THINKING_FA[k] }))} />
            <NodePickerField label="بخش فکر تازه" nodes={p.nodes} value={synthesis.nodeId} onChange={(v) => setSynthesis({ ...synthesis, nodeId: v })} />
          </div>
        </Dialog>
      )}
    </div>
  );
};
