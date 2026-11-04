/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import type { ContextObject, Note, TreeNode } from '../types';
import { thinkingSpace } from '../core/thinkingSpace';
import type { SpaceKind } from '../core/thinkingSpace';
import { flatten } from '../core/nodeTree';
import type { NoteThinkingItem } from '../core/thinkingMarkers';
import { Badge, Button, Card, EmptyState, Select, StatusBadge, TypeBadge, ThinkingBadge, formatNumber } from '../ui';
import { BeforeAfter } from './BeforeAfter';
import { ProposalInbox } from './ProposalInbox';
import { ThinkingList } from './ThinkingList';

type ProposalProps = React.ComponentProps<typeof ProposalInbox>;
interface Props {
  objects: ContextObject[];
  notes: Note[];
  nodes: TreeNode[];
  /** open from a node's counter: only that node (and below) */
  nodeId?: string;
  onNodeChange: (nodeId: string | undefined) => void;
  /** the truth map with the suggestions shown: «اگر همه را تأیید کنم؟» */
  onPreviewTruth?: () => void;
  /** a thought becomes a SECTION of the tree */
  onToSection?: (item: NoteThinkingItem) => void;
  onToKnowledge: (item: NoteThinkingItem) => void;
  onOpenObject: (o: ContextObject) => void;
  onApproveDraft: (id: string) => Promise<void>;
  onRejectDraft: (id: string) => Promise<void>;
  proposals: Omit<ProposalProps, 'objects' | 'nodes'>;
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
  const view = useMemo(() => thinkingSpace({ objects: p.objects, notes: p.notes, nodes: p.nodes }, { kind: kind === 'all' ? undefined : kind, nodeId: p.nodeId }), [p.objects, p.notes, p.nodes, kind, p.nodeId]);
  const nodeLabel = (id: string) => p.nodes.find((n) => n.id === id)?.label ?? '';
  const proposalsHere = view.waiting.filter((w) => w.type === 'proposal').map((w) => w.object);
  const reviews = view.waiting.filter((w) => w.type === 'review').map((w) => w.object);
  const drafts = view.waiting.filter((w) => w.type === 'draft').map((w) => w.object);
  const empty = view.waiting.length + view.thoughts.length + view.assumptions.length === 0;
  const count = (k: SpaceKind | 'all') => (k === 'all' ? Object.values(view.counts).reduce((a, b) => a + b, 0) : view.counts[k]);

  return (
    <div className="flex flex-col gap-stack-lg" data-testid="thinking-space">
      <div className="flex flex-col gap-stack-sm sm:flex-row sm:items-end">
        <div role="radiogroup" aria-label="نوع فکر" className="flex flex-wrap gap-inline-xs">
          {CHIPS.map((c) => (
            <Button key={c.id} size="sm" variant={kind === c.id ? 'secondary' : 'ghost'} iconStart={kind === c.id ? 'Check' : undefined} role="radio" aria-checked={kind === c.id} onClick={() => setKind(c.id)}>
              {c.label}{count(c.id) ? ` (${formatNumber(count(c.id))})` : ''}
            </Button>
          ))}
        </div>
        <div className="sm:ms-auto sm:w-overlay-xs">
          <Select label="بخش" value={p.nodeId ?? ''} onChange={(e) => p.onNodeChange(e.target.value || undefined)} options={[{ value: '', label: 'همهٔ بخش‌ها' }, ...flatten(p.nodes).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }))]} />
        </div>
      </div>

      {view.waiting.length > 0 && p.onPreviewTruth && (
        <div className="flex flex-wrap items-center gap-inline-sm">
          <Button size="sm" variant="secondary" iconStart="Workflow" className="h-auto max-w-full whitespace-normal py-inset-xs text-start" onClick={p.onPreviewTruth}>اگر همه را تأیید کنم، نقشهٔ حقیقت چه می‌شود؟</Button>
          <span className="body-sm text-text-subtle">نقشه را با «نشان بده چه در راه است» باز می‌کند؛ چیزی تأیید نمی‌شود.</span>
        </div>
      )}

      {empty && <EmptyState icon="Lightbulb" title="اینجا هنوز فکری نیست" description="یک ایده، سؤال یا تصمیم باز را همین‌جا بنویس؛ لازم نیست چیزی بلد باشی." />}

      {view.waiting.length > 0 && (
        <section className="flex flex-col gap-stack-md" aria-label="منتظر تصمیم تو">
          <h3 className="title text-text-default">منتظر تصمیم تو ({formatNumber(view.waiting.length)})</h3>
          {drafts.map((o) => (
            <Card key={o.id} padding="lg" className="flex flex-col gap-stack-sm" aria-label={`تغییر در انتظار تأیید: ${o.title}`}>
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <span className="flex flex-wrap items-center gap-inline-xs"><span className="label-md text-text-default">{o.title}</span><TypeBadge value={o.type} /><Badge intent="warning" icon={false}>۱ تغییر در انتظار تأیید</Badge><span className="caption text-text-subtle">{nodeLabel(o.nodeId)}</span></span>
              </div>
              <BeforeAfter before={o.content} after={o.draft!.content} />
              {o.draft!.reason && <p className="body-sm text-text-default"><span className="label-sm text-text-subtle">دلیل: </span>{o.draft!.reason}</p>}
              <p className="body-sm text-text-subtle">تا تأیید نشود، AI و خروجی‌ها همان متن تأییدشده را می‌بینند.</p>
              <div className="flex flex-wrap gap-inline-sm">
                <Button size="sm" variant="secondary" iconStart="Check" onClick={() => void p.onApproveDraft(o.id)}>تأیید و جایگزین کن</Button>
                <Button size="sm" variant="ghost" iconStart="X" onClick={() => void p.onRejectDraft(o.id)}>رد کن</Button>
                <Button size="sm" variant="ghost" onClick={() => p.onOpenObject(o)}>باز کردن</Button>
              </div>
            </Card>
          ))}
          {proposalsHere.length > 0 && <ProposalInbox {...p.proposals} objects={proposalsHere} nodes={p.nodes} />}
          {reviews.length > 0 && (
            <ul className="flex flex-col gap-stack-xs" aria-label="نیاز به بازبینی">
              {reviews.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
                  <span className="flex flex-wrap items-center gap-inline-xs"><span className="body-md text-text-default">{o.title}</span><TypeBadge value={o.type} /><StatusBadge value={o.status} /></span>
                  <Button size="sm" variant="secondary" onClick={() => p.onOpenObject(o)}>باز کردن</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view.thoughts.length > 0 && (
        <section className="flex flex-col gap-stack-sm" aria-label="فکرهای باز">
          <h3 className="title text-text-default">فکرهای باز ({formatNumber(view.thoughts.length)})</h3>
          <ThinkingList items={view.thoughts} objects={p.objects} nodes={p.nodes} onConvert={async () => undefined} onPrefill={p.onToKnowledge} onToSection={p.onToSection} />
        </section>
      )}

      {view.assumptions.length > 0 && (
        <section className="flex flex-col gap-stack-sm" aria-label="فرض‌های فعال">
          <h3 className="title text-text-default">فرض‌های فعال ({formatNumber(view.assumptions.length)})</h3>
          <p className="body-sm text-text-subtle">تأییدشده‌اند و AI آن‌ها را در بخش جدای «فرض» می‌بیند؛ واقعیت نیستند.</p>
          <ul className="flex flex-col gap-stack-xs">
            {view.assumptions.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
                <span className="flex flex-wrap items-center gap-inline-xs"><ThinkingBadge kind="assumption" /><span className="body-md text-text-default">{o.title}</span><span className="caption text-text-subtle">· {nodeLabel(o.nodeId)}</span></span>
                <Button size="sm" variant="ghost" onClick={() => p.onOpenObject(o)}>باز کردن</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
