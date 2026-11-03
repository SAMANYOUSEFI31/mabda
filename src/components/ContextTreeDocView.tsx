/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ContextObject, Note, StoredFile, TreeNode } from '../types';
import { childrenOf } from '../core/nodeTree';
import { Badge, Button, Card, EmptyState, Menu, IconButton, AssumptionBadge, PROVENANCE_LABEL, ReachBadge, SampleBadge, StatusBadge, TypeBadge, formatNumber } from '../ui';
import type { NodeDialogState } from './NodeDialogs';
import { NodeNotes } from './NodeNotes';
import { ThinkingList } from './ThinkingList';
import type { NoteThinkingItem } from '../core/thinkingMarkers';

interface ContextTreeDocViewProps {
  objects: ContextObject[];
  nodes: TreeNode[];
  notes: Note[];
  files: StoredFile[];
  extractingNoteId: string | null;
  onSelectObject: (obj: ContextObject) => void;
  onAddNewToNode: (nodeId: string) => void;
  onNodeAction: (state: NonNullable<NodeDialogState>) => void;
  onChatWithNode: (nodeId: string) => void;
  onReadNode: (nodeId: string) => void;
  onShowEffect: (nodeId: string) => void;
  /** thinking items derived from every note (src/core/thinkingMarkers.ts) */
  thinking: NoteThinkingItem[];
  onConvertItem: (item: NoteThinkingItem, opts?: { as?: 'fact' | 'decision' }) => Promise<void>;
  onSplitNote: (noteId: string) => Promise<void>;
  /** grey examples (starter / template): displayed, never part of knowledge */
  samples: ContextObject[];
  onDeleteSamples: (nodeIds?: string[]) => Promise<void>;
  onSaveAsTemplate: (nodeId: string) => void;
  onOpenStarters: () => void;
  onOpenThread: (nodeId: string) => void;
  onOpenAiRequest: (nodeId: string) => void;
  /** the global search asks to show a node's notes (`n` makes a repeated request count) */
  openNotesFor?: { nodeId: string; n: number } | null;
  onAddNote: (nodeId: string, content: string) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onExtractNote: (noteId: string) => Promise<void>;
}

export const ContextTreeDocView: React.FC<ContextTreeDocViewProps> = (props) => {
  const { objects, nodes } = props;
  const activeObjects = objects.filter((o) => o.status !== 'Archived' && o.status !== 'Superseded');
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  useEffect(() => { if (props.openNotesFor) setOpenNotes((s) => new Set(s).add(props.openNotesFor!.nodeId)); }, [props.openNotesFor]);
  const toggleNotes = (id: string) => setOpenNotes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const card = (obj: ContextObject) => (
    <Card key={obj.id} padding="lg" onClick={() => props.onSelectObject(obj)} className="flex flex-col gap-stack-sm">
      <div className="flex items-start justify-between gap-inline-sm">
        <h4 className="title min-w-space-0 flex-1 text-text-default">{obj.title}</h4>
        <div className="flex max-w-1/2 flex-wrap justify-end gap-inline-xs">
          <TypeBadge value={obj.type} />
          <AssumptionBadge object={obj} />
          <ReachBadge object={obj} />
          <StatusBadge value={obj.status} />
        </div>
      </div>
      <p className="body-md line-clamp-3 text-text-default">{obj.content}</p>
      <div className="mt-stack-xs flex items-center justify-between gap-inline-sm border-t border-border-subtle pt-inset-sm caption text-text-subtle">
        <span>منبع: {PROVENANCE_LABEL[obj.provenance]} · نسخهٔ {formatNumber(obj.version)}</span>
        <span className="inline-flex items-center gap-inline-xs">ویرایش یا مشاهده</span>
      </div>
    </Card>
  );

  const sampleCard = (obj: ContextObject) => (
    <Card key={obj.id} padding="lg" onClick={() => props.onSelectObject(obj)} className="flex flex-col gap-stack-sm border-dashed opacity-70">
      <div className="flex items-start justify-between gap-inline-sm">
        <h4 className="title min-w-space-0 flex-1 text-text-subtle">{obj.title}</h4>
        <div className="flex max-w-1/2 flex-wrap justify-end gap-inline-xs"><SampleBadge /><TypeBadge value={obj.type} /></div>
      </div>
      <p className="body-md line-clamp-3 text-text-subtle">{obj.content}</p>
      <p className="caption text-text-subtle">با نوشتن متن خودت روی این مثال، مال خودت می‌شود.</p>
    </Card>
  );

  const renderNode = (node: TreeNode, path: string, depth: number): React.ReactNode => {
    const nodeObjects = activeObjects.filter((o) => o.nodeId === node.id);
    const nodeNotes = props.notes.filter((n) => n.nodeId === node.id);
    const nodeFiles = props.files.filter((f) => f.nodeId === node.id);
    const kids = childrenOf(nodes, node.id);
    const notesOpen = openNotes.has(node.id);
    const established = nodeObjects.filter((o) => o.status === 'Confirmed' && !o.assumption);
    const notThinkingYet = nodeObjects.filter((o) => !(o.status === 'Confirmed' && !o.assumption));
    const thinking = props.thinking.filter((i) => i.nodeId === node.id);
    const nodeSamples = props.samples.filter((o) => o.nodeId === node.id);
    const sources = [...nodeObjects.filter((o) => o.source).reduce((m, o) => m.set(o.source!.label ?? 'ورودی', (m.get(o.source!.label ?? 'ورودی') ?? 0) + 1), new Map<string, number>())];

    return (
      <section key={node.id} className={`flex flex-col gap-stack-md ${depth > 0 ? 'ps-inset-lg border-s border-border-subtle' : ''}`} aria-labelledby={`node-${node.id}`}>
        <div className="flex flex-col gap-inline-sm border-b border-border-subtle pb-inset-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-space-0 flex-wrap items-baseline gap-x-inline-sm">
            <span className="label-md tabular-nums text-text-subtlest">{path}</span>
            <h3 id={`node-${node.id}`} tabIndex={-1} className="doc-anchor heading-xs text-text-default">{node.label}</h3>
            {node.isSystem ? <Badge intent="neutral" icon="Lock">سیستمی</Badge> : null}
            {node.description && <span className="body-sm hidden text-text-subtle sm:inline">({node.description})</span>}
          </div>
          <div className="flex flex-wrap items-center gap-inline-xs">
            <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => props.onAddNewToNode(node.id)}>افزودن دانش</Button>
            <Button size="sm" variant="ghost" iconStart="BookOpen" onClick={() => props.onReadNode(node.id)}>خواندن سند</Button>
            <Button size="sm" variant="ghost" iconStart="MessageSquare" onClick={() => props.onChatWithNode(node.id)}>گفتگو با این گره</Button>
            <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => props.onOpenThread(node.id)}>گفتگوی متمرکز</Button>
            <Button size="sm" variant="ghost" iconStart="Sparkles" onClick={() => props.onOpenAiRequest(node.id)}>درخواست برای AI</Button>
            <Menu
              label={`عملیات گرهٔ ${node.label}`}
              align="end"
              trigger={<IconButton icon="Ellipsis" label={`عملیات گرهٔ ${node.label}`} size="sm" />}
              items={[
                { label: 'زیرگرهٔ جدید', icon: 'Plus', onSelect: () => props.onNodeAction({ kind: 'create', parentId: node.id }) },
                { label: 'مربی دانش', icon: 'Brain', onSelect: () => props.onNodeAction({ kind: 'coach', nodeId: node.id }) },
                { label: 'ذخیره به‌عنوان قالب', icon: 'Package', onSelect: () => props.onSaveAsTemplate(node.id) },
                { label: 'تغییر نام', icon: 'Pencil', onSelect: () => props.onNodeAction({ kind: 'rename', nodeId: node.id }) },
                { label: 'جابه‌جایی', icon: 'Network', disabled: !!node.isSystem, onSelect: () => props.onNodeAction({ kind: 'move', nodeId: node.id }) },
                { divider: true },
                { label: 'حذف', icon: 'Trash2', intent: 'danger', disabled: !!node.isSystem, onSelect: () => props.onNodeAction({ kind: 'delete', nodeId: node.id }) },
              ]}
            />
          </div>
        </div>

        {nodeObjects.length === 0 && nodeNotes.length === 0 && kids.length === 0 && nodeSamples.length === 0 && !notesOpen ? (
          <EmptyState
            icon="Inbox"
            title="هنوز موردی در این شاخه ثبت نشده"
            action={<div className="flex flex-wrap justify-center gap-inline-sm"><Button variant="secondary" size="sm" onClick={() => props.onAddNewToNode(node.id)}>ثبت اولین مورد</Button><Button variant="ghost" size="sm" iconStart="FileText" onClick={() => toggleNotes(node.id)}>یادداشت‌ها</Button></div>}
          />
        ) : (
          <>
            {/* وضعیت فعلی: what is established here */}
            {(established.length > 0 || nodeObjects.length > 0) && (
              <section className="flex flex-col gap-stack-sm" aria-label="وضعیت فعلی">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <h4 className="label-md text-text-default">وضعیت فعلی</h4>
                  <Button size="sm" variant="ghost" iconStart="Layers" onClick={() => props.onShowEffect(node.id)}>آنچه اینجا اثر دارد</Button>
                </div>
                {established.length === 0 ? <p className="body-sm text-text-subtle">هنوز چیزی در این گره تأیید نشده.</p> : <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">{established.map(card)}</div>}
              </section>
            )}

            {/* در حال فکر: proposals, assumptions, thinking items from notes, the notes themselves */}
            {(thinking.length > 0 || notThinkingYet.length > 0 || nodeNotes.length > 0 || notesOpen) && (
              <section className="flex flex-col gap-stack-sm" aria-label="در حال فکر">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <h4 className="label-md text-text-default">در حال فکر</h4>
                  <Button size="sm" variant="ghost" iconStart="FileText" aria-expanded={notesOpen} onClick={() => toggleNotes(node.id)}>یادداشت‌ها ({formatNumber(nodeNotes.length)})</Button>
                </div>
                {notThinkingYet.length > 0 && <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">{notThinkingYet.map(card)}</div>}
                <ThinkingList items={thinking} objects={objects} onConvert={(item, opts) => props.onConvertItem(item, opts)} />
                {notesOpen && (
                  <NodeNotes
                    nodeId={node.id}
                    notes={nodeNotes}
                    objects={activeObjects}
                    extractingId={props.extractingNoteId}
                    onAdd={props.onAddNote}
                    onUpdate={props.onUpdateNote}
                    onDelete={props.onDeleteNote}
                    onExtract={props.onExtractNote}
                    onSplit={props.onSplitNote}
                  />
                )}
              </section>
            )}

            {/* نمونه‌ها: grey examples that came with a starter or a template — they are not knowledge and no AI sees them */}
            {nodeSamples.length > 0 && (
              <section className="flex flex-col gap-stack-sm" aria-label="نمونه‌ها">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <h4 className="label-md text-text-subtle">نمونه‌ها (به AI نمی‌رسند)</h4>
                  <Button size="sm" variant="ghost" iconStart="Trash2" onClick={() => props.onDeleteSamples([node.id])}>حذف نمونه‌های این گره</Button>
                </div>
                <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">{nodeSamples.map(sampleCard)}</div>
              </section>
            )}

            {/* منابع: files and where the proposals came from */}
            {(nodeFiles.length > 0 || sources.length > 0) && (
              <section className="flex flex-col gap-stack-xs" aria-label="منابع">
                <h4 className="label-md text-text-default">منابع</h4>
                {nodeFiles.length > 0 && <p className="caption text-text-subtle">فایل‌های این گره: {nodeFiles.map((f) => f.name).join('، ')}</p>}
                {sources.length > 0 && <p className="caption text-text-subtle">ورودی‌ها: {sources.map(([label, n]) => `${label} (${formatNumber(n)})`).join('، ')}</p>}
              </section>
            )}
          </>
        )}

        {kids.length > 0 && <div className="flex flex-col gap-stack-xl">{kids.map((k, i) => renderNode(k, `${path}${formatNumber(i + 1)}.`, depth + 1))}</div>}
      </section>
    );
  };

  const roots = childrenOf(nodes, undefined);
  return (
    <Card padding="xl" className="flex flex-col gap-stack-xl">
      <div className="flex flex-col gap-inline-md border-b border-border-default pb-inset-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="heading-sm text-text-default">ساختار منبع حقیقت</h2>
          <p className="body-sm mt-stack-xs text-text-subtle">
            هر بخش یک گره است و هر کارت یک قلم دانش. برای خواندن به‌صورت یک سند زیبا، «خواندن سند» را بزن.
          </p>
        </div>
        <Badge intent="neutral" icon={false}>{formatNumber(activeObjects.length)} قلم دانش فعال</Badge>
      </div>
      <div className="flex flex-col gap-stack-xl">{roots.map((r, i) => renderNode(r, `${formatNumber(i + 1)}.`, 0))}</div>
    </Card>
  );
};
