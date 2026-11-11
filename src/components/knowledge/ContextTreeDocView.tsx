/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ContextObject, ContextRelationship, Note, StoredFile, TreeNode } from '../../types';
import { abbreviate, childSummaries, fromAbove, pathTo } from '../../core/nodeFocus';
import { ORIGIN_FA } from '../../core/effectiveContext';
import { childrenOf, quickMoves } from '../../core/nodeTree';
import { Badge, Button, Card, EmptyState, Icon, Menu, IconButton, AssumptionBadge, PROVENANCE_LABEL, ReachBadge, SampleBadge, StatusBadge, TypeBadge, formatNumber } from '../../ui';
import type { NodeDialogState } from '../structure/NodeDialogs';
import { NodeNotes } from '../thinking/NodeNotes';
import { useAiStatus } from '../../services/aiStatus';

interface ContextTreeDocViewProps {
  objects: ContextObject[];
  relationships?: ContextRelationship[];
  /** objects whose dependency changed (the «قدیمی» counter of a sub-section) */
  staleIds?: Set<string>;
  nodes: TreeNode[];
  /** the section we are «inside» (null = the whole tree); the parent keeps it in history so the back button works */
  focusId?: string | null;
  onFocus?: (id: string | null) => void;
  notes: Note[];
  files: StoredFile[];
  extractingNoteId: string | null;
  onSelectObject: (obj: ContextObject) => void;
  onAddNewToNode: (nodeId: string) => void;
  onNodeAction: (state: NonNullable<NodeDialogState>) => void;
  onChatWithNode: (nodeId: string) => void;
  onReadNode: (nodeId: string) => void;
  openCounts?: Map<string, number>;
  onShowEffect: (nodeId: string) => void;
  /** how many things are in force at a node (own, from above, everywhere) — the summary sentence */
  effectCount: (nodeId: string) => number;
  /** how many thoughts and waiting suggestions this node has («۳ فکر باز») */
  openCount: (nodeId: string) => number;
  onOpenThinking: (nodeId: string) => void;
  onNewThought: (nodeId: string) => void;
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
  /** adds a file to a node (it is processed later, from the files list) */
  onUploadFile: (file: File, nodeId: string) => Promise<void>;
  /** reorder among siblings: the node goes to this position under the same parent */
  onReorderNode: (nodeId: string, index: number) => Promise<void>;
  onAddNote: (nodeId: string, content: string) => Promise<unknown>;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onExtractNote: (noteId: string) => Promise<void>;
}

export const ContextTreeDocView: React.FC<ContextTreeDocViewProps> = (props) => {
  const { objects, nodes } = props;
  // the Coach is Mabda's own AI: frozen (hidden) while MABDA_MANAGED_AI is off
  const { managedEnabled } = useAiStatus();
  const activeObjects = objects.filter((o) => o.status !== 'Archived' && o.status !== 'Superseded');
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  useEffect(() => { if (props.openNotesFor) setOpenNotes((s) => new Set(s).add(props.openNotesFor!.nodeId)); }, [props.openNotesFor]);
  // entering / leaving a section moves focus to its heading: keyboard and screen-reader users land IN the new place (Alt+↑ and the arrows keep working)
  useEffect(() => { if (!props.focusId) return; const t = requestAnimationFrame(() => document.getElementById(`node-${props.focusId}`)?.focus({ preventScroll: true })); return () => cancelAnimationFrame(t); }, [props.focusId]);
  const [showAllIn, setShowAllIn] = useState<Set<string>>(new Set());
  const toggleAll = (id: string) => setShowAllIn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const quick = (id: string) => quickMoves(nodes, id);
  const toggleNotes = (id: string) => setOpenNotes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const card = (obj: ContextObject) => (
    <Card key={obj.id} padding="lg" onClick={() => props.onSelectObject(obj)} className="flex flex-col gap-stack-sm">
      <div className="flex items-start justify-between gap-inline-sm">
        <h4 className="title min-w-space-0 flex-1 text-text-default">{obj.title}</h4>
        <div className="flex max-w-1/2 flex-wrap justify-end gap-inline-xs">
          <TypeBadge value={obj.type} />
          <AssumptionBadge object={obj} />
          <ReachBadge object={obj} />
          <AssumptionBadge object={obj} />
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
      <p className="body-sm text-text-subtle">با نوشتن متن خودت روی این مثال، مال خودت می‌شود.</p>
    </Card>
  );

  const renderNode = (node: TreeNode, path: string, depth: number, focused = false): React.ReactNode => {
    const nodeObjects = activeObjects.filter((o) => o.nodeId === node.id);
    const nodeNotes = props.notes.filter((n) => n.nodeId === node.id);
    const nodeFiles = props.files.filter((f) => f.nodeId === node.id);
    const kids = childrenOf(nodes, node.id);
    const notesOpen = openNotes.has(node.id);
    // the truth: approved knowledge only (a confirmed assumption stays, with its badge — it IS approved and the AI reads it in its own section)
    const established = nodeObjects.filter((o) => o.status === 'Confirmed');
    const nodeSamples = props.samples.filter((o) => o.nodeId === node.id);
    const sources = [...nodeObjects.filter((o) => o.source).reduce((m, o) => m.set(o.source!.label ?? 'ورودی', (m.get(o.source!.label ?? 'ورودی') ?? 0) + 1), new Map<string, number>())];

    return (
      <section key={node.id} className={`flex flex-col gap-stack-md ${depth > 0 ? 'ps-inset-lg border-s border-border-subtle' : ''}`} aria-labelledby={`node-${node.id}`}>
        <div className="flex flex-col gap-inline-sm border-b border-border-subtle pb-inset-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-space-0 flex-wrap items-baseline gap-x-inline-sm">
            <span className="label-md tabular-nums text-text-subtlest">{path}</span>
            <h3 id={`node-${node.id}`} tabIndex={-1} className="doc-anchor heading-xs text-text-default">{node.label}</h3>
            {node.description && <span className="body-sm hidden text-text-subtle sm:inline">({node.description})</span>}
          </div>
          <div className="flex flex-wrap items-center gap-inline-xs">
            {/* one main action; everything else is under «⋯» */}
            <Button size="sm" variant="secondary" iconStart="Plus" onClick={() => props.onAddNewToNode(node.id)}>افزودن دانش</Button>
            {!focused && props.onFocus && <Button size="sm" variant="ghost" iconEnd="ChevronLeft" aria-label={`رفتن به بخش ${node.label}`} onClick={() => props.onFocus!(node.id)}>باز کردن</Button>}
            <Menu
              label={`عملیات گرهٔ ${node.label}`}
              align="end"
              trigger={<IconButton icon="Ellipsis" label={`عملیات گرهٔ ${node.label}`} size="sm" />}
              items={[
                { label: 'روی این بخش فکر کن', icon: 'Lightbulb', onSelect: () => props.onOpenThinking(node.id) },
                { label: 'آماده‌سازی درخواست', icon: 'Sparkles', onSelect: () => props.onOpenAiRequest(node.id) },
                { label: 'خواندن سند', icon: 'BookOpen', onSelect: () => props.onReadNode(node.id) },
                ...(managedEnabled ? [{ label: 'گفتگوی متمرکز', icon: 'Pencil' as const, onSelect: () => props.onOpenThread(node.id) }] : []),
                { divider: true },
                { label: 'زیرگرهٔ جدید', icon: 'Plus', onSelect: () => props.onNodeAction({ kind: 'create', parentId: node.id }) },
                ...(managedEnabled ? [{ label: 'مربی دانش', icon: 'Brain' as const, onSelect: () => props.onNodeAction({ kind: 'coach', nodeId: node.id }) }] : []),
                { label: 'ذخیره به‌عنوان قالب', icon: 'Package', onSelect: () => props.onSaveAsTemplate(node.id) },
                { label: 'تغییر نام', icon: 'Pencil', onSelect: () => props.onNodeAction({ kind: 'rename', nodeId: node.id }) },
                { label: 'جابه‌جایی…', icon: 'Network', onSelect: () => props.onNodeAction({ kind: 'move', nodeId: node.id }) },
                // the quick moves: reorder at once (nothing changes for what reaches it); a change of level shows its effect first
                { label: 'بالاتر ببر', icon: 'ChevronUp', disabled: quick(node.id).up === undefined, onSelect: () => void props.onReorderNode(node.id, quick(node.id).up!) },
                { label: 'پایین‌تر ببر', icon: 'ChevronDown', disabled: quick(node.id).down === undefined, onSelect: () => void props.onReorderNode(node.id, quick(node.id).down!) },
                { label: 'یک سطح بیرون بیاور', icon: 'ArrowRight', disabled: !quick(node.id).outdent, onSelect: () => props.onNodeAction({ kind: 'move', nodeId: node.id, preset: quick(node.id).outdent!.parentId }) },
                { label: 'بگذار زیر بخش قبلی', icon: 'ArrowLeft', disabled: !quick(node.id).indent, onSelect: () => props.onNodeAction({ kind: 'move', nodeId: node.id, preset: quick(node.id).indent!.parentId }) },
                { divider: true },
                { label: 'حذف', icon: 'Trash2', intent: 'danger', onSelect: () => props.onNodeAction({ kind: 'delete', nodeId: node.id }) },
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
              <section className="flex flex-col gap-stack-sm" aria-label="الان درست است">
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <h4 className="label-md text-text-default">الان درست است</h4>
                  <Button size="sm" variant="ghost" iconStart="Layers" onClick={() => props.onShowEffect(node.id)}>{formatNumber(props.effectCount(node.id))} چیز اینجا اعمال می‌شود</Button>
                </div>
                {established.length === 0 ? <p className="body-sm text-text-subtle">هنوز چیزی در این بخش تأیید نشده.</p> : (
                  <>
                    <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">{(showAllIn.has(node.id) ? established : established.slice(0, 4)).map(card)}</div>
                    {established.length > 4 && <div><Button size="sm" variant="ghost" iconStart={showAllIn.has(node.id) ? 'ChevronUp' : 'ChevronDown'} aria-expanded={showAllIn.has(node.id)} onClick={() => toggleAll(node.id)}>{showAllIn.has(node.id) ? 'فقط چند مورد' : `همهٔ ${formatNumber(established.length)} مورد`}</Button></div>}
                  </>
                )}
              </section>
            )}

            {/* the truth stays clean: what is still a thought or a suggestion is NOT listed here — one calm counter opens it in the thinking space,
                where it is already filtered to this node. The raw notes of the node are one closed click away. */}
            {(props.openCount(node.id) > 0 || nodeNotes.length > 0 || notesOpen) && (
              <section className="flex flex-col gap-stack-sm" aria-label="فکر و یادداشت">
                <div className="flex flex-wrap items-center gap-inline-xs">
                  {props.openCount(node.id) > 0 && <Button size="sm" variant="ghost" iconStart="Lightbulb" data-testid="open-thoughts" onClick={() => props.onOpenThinking(node.id)}>{formatNumber(props.openCount(node.id))} فکر باز</Button>}
                  {(nodeNotes.length > 0 || notesOpen) && <Button size="sm" variant="ghost" iconStart="FileText" aria-expanded={notesOpen} onClick={() => toggleNotes(node.id)}>یادداشت‌ها ({formatNumber(nodeNotes.length)})</Button>}
                </div>
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

            {/* a calm invitation, not a section: raw thought and a file can be added right here, whatever is or is not above */}
            <div className="flex flex-wrap items-center gap-inline-xs" data-testid="node-invite">
              {props.openCount(node.id) === 0 && nodeNotes.length === 0 && <Button size="sm" variant="ghost" iconStart="Lightbulb" onClick={() => props.onNewThought(node.id)}>فکر تازه‌ای داری؟ بنویس</Button>}
              <Button size="sm" variant="ghost" iconStart="Upload" onClick={() => document.getElementById(`node-file-${node.id}`)?.click()}>فایل یا متنی داری؟ اضافه کن</Button>
              <input id={`node-file-${node.id}`} type="file" className="sr-only" tabIndex={-1} aria-label={`انتخاب فایل برای ${node.label}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void props.onUploadFile(f, node.id); }} />
            </div>

            {/* از کجا آمده: the files of this node and where the proposals came from */}
            {(nodeFiles.length > 0 || sources.length > 0) && (
              <section className="flex flex-col gap-stack-xs" aria-label="از کجا آمده">
                <h4 className="label-md text-text-default">از کجا آمده</h4>
                {nodeFiles.length > 0 && <p className="caption text-text-subtle">فایل‌های این گره: {nodeFiles.map((f) => f.name).join('، ')}</p>}
                {sources.length > 0 && <p className="body-sm text-text-subtle">ورودی‌ها: {sources.map(([label, n]) => `${label} (${formatNumber(n)})`).join('، ')}</p>}
              </section>
            )}
          </>
        )}

        {focused
          ? (kids.length > 0 && <SubSections summaries={childSummaries(nodes, activeObjects, props.openCounts ?? new Map(), props.staleIds ?? new Set(), node.id)} onOpen={(id) => props.onFocus?.(id)} />)
          : (kids.length > 0 && <div className="flex flex-col gap-stack-xl">{kids.map((k, i) => renderNode(k, `${path}${formatNumber(i + 1)}.`, depth + 1))}</div>)}
      </section>
    );
  };

  const roots = childrenOf(nodes, undefined);
  const focusNode = props.focusId ? nodes.find((n) => n.id === props.focusId) : undefined;
  if (focusNode && props.onFocus) {
    const path = pathTo(nodes, focusNode.id);
    const above = fromAbove(nodes, objects, props.relationships ?? [], focusNode.id, new Date());
    return (
      <Card padding="xl" className="flex flex-col gap-stack-xl" data-testid="focused-section" onKeyDown={(e: React.KeyboardEvent) => { if (e.altKey && e.key === 'ArrowUp' && !e.nativeEvent.isComposing) { e.preventDefault(); props.onFocus!(path.length > 1 ? path[path.length - 2].id : null); } }}>
        <FocusBar path={path} onGo={(id) => props.onFocus!(id)} />
        <div key={focusNode.id} className="focus-enter flex flex-col gap-stack-xl">
          {above.length > 0 && <FromAbove items={above} onOpen={(o) => props.onSelectObject(o)} />}
          {renderNode(focusNode, '', 0, true)}
        </div>
      </Card>
    );
  }
  return (
    <Card padding="xl" className="flex flex-col gap-stack-xl">
      <div className="flex flex-col gap-inline-md border-b border-border-default pb-inset-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="heading-sm text-text-default">ساختار منبع حقیقت</h2>
          <p className="body-sm mt-stack-xs text-text-subtle">
            هر بخش یک گره است و هر کارت یک قلم دانش. برای خواندن به‌صورت یک سند زیبا، «خواندن سند» را بزن.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-inline-sm">
          <Badge intent="neutral" icon={false}>{formatNumber(activeObjects.length)} قلم دانش فعال</Badge>
          <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => props.onNodeAction({ kind: 'create', parentId: '' })}>بخش اصلی تازه</Button>
        </div>
      </div>
      <div className="flex flex-col gap-stack-xl">{roots.map((r, i) => renderNode(r, `${formatNumber(i + 1)}.`, 0))}</div>
    </Card>
  );
};

/** the path, always one tap from any level up; on a narrow screen a long path shows «…» and the hidden levels are in a menu */
const FocusBar: React.FC<{ path: Array<{ id: string; label: string }>; onGo: (id: string | null) => void }> = ({ path, onGo }) => {
  const { shown, hidden } = abbreviate(path);
  const parent = path.length > 1 ? path[path.length - 2].id : null;
  const crumb = 'body-sm inline-flex min-h-touch min-w-touch items-center justify-center rounded-control-sm px-inset-xs text-text-subtle hover:bg-interaction-hover';
  return (
    <div className="focus-bar flex items-center gap-inline-sm" data-testid="focus-bar">
      <IconButton icon="ArrowRight" label={parent ? 'برگشت به بخش بالاتر' : 'برگشت به همهٔ بخش‌ها'} variant="secondary" onClick={() => onGo(parent)} />
      <nav aria-label="مسیر بخش" className="min-w-space-0 flex-1">
        <ol className="flex flex-wrap items-center gap-inline-xs">
          <li><button type="button" className={crumb} onClick={() => onGo(null)}>همه</button></li>
          {shown.map((c, i) => (
            <React.Fragment key={c.id}>
              {i === 1 && hidden.length > 0 && (
                <li className="flex items-center gap-inline-xs"><Icon name="ChevronLeft" size="sm" className="text-icon-subtle" />
                  <Menu label="بخش‌های میانی" trigger={<IconButton icon="Ellipsis" label="بخش‌های میانی مسیر" size="sm" />} items={hidden.map((h) => ({ label: h.label, onSelect: () => onGo(h.id) }))} />
                </li>
              )}
              <li className="flex items-center gap-inline-xs"><Icon name="ChevronLeft" size="sm" className="text-icon-subtle" />
                {i === shown.length - 1
                  ? <span aria-current="page" className="label-md px-inset-xs text-text-default">{c.label}</span>
                  : <button type="button" className={crumb} onClick={() => onGo(c.id)}>{c.label}</button>}
              </li>
            </React.Fragment>
          ))}
        </ol>
      </nav>
    </div>
  );
};

/** unlike a folder, a section inherits from above: shown calmly, closed by default, each with where it comes from */
const FromAbove: React.FC<{ items: ReturnType<typeof fromAbove>; onOpen: (o: ContextObject) => void }> = ({ items, onOpen }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-stack-sm rounded-control border border-border-subtle bg-surface-sunken p-inset-md" aria-label="از بالا به اینجا می‌رسد" data-testid="from-above">
      <Button size="sm" variant="ghost" iconStart={open ? 'ChevronUp' : 'ChevronDown'} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="self-start">از بالا به اینجا می‌رسد ({formatNumber(items.length)})</Button>
      {open && (
        <ul className="flex flex-col gap-stack-xs">
          {items.map(({ item, fromLabel }) => (
            <li key={item.object.id} className="flex flex-wrap items-center justify-between gap-inline-sm">
              <button type="button" className="body-md inline-flex min-h-touch items-center text-start text-text-default underline-offset-2 hover:underline" onClick={() => onOpen(item.object)}>{item.object.title}</button>
              <span className="caption text-text-subtle">{item.origin === 'global' ? ORIGIN_FA.global : `از «${fromLabel}»`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/** sub-sections as cards with calm counters; one tap goes in */
const SubSections: React.FC<{ summaries: ReturnType<typeof childSummaries>; onOpen: (id: string) => void }> = ({ summaries, onOpen }) => (
  <section className="flex flex-col gap-stack-sm" aria-label="زیربخش‌ها">
    <h4 className="label-md text-text-default">زیربخش‌ها ({formatNumber(summaries.length)})</h4>
    <ul className="grid grid-cols-1 gap-inline-lg md:grid-cols-2" onKeyDown={(e) => {
      // ↑ ↓ (and Home / End) move between sub-sections without Tab; Enter / Space goes in (it is a button)
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(e.key) || e.nativeEvent.isComposing) return;
      const list = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-testid="sub-section"]'));
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      e.preventDefault();
      list[e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
    }}>
      {summaries.map((s) => (
        <li key={s.node.id}>
          <button type="button" data-testid="sub-section" onClick={() => onOpen(s.node.id)} className="flex min-h-touch-comfortable w-full items-center justify-between gap-inline-md rounded-control border border-border-default bg-surface-raised p-inset-lg text-start transition-colors hover:bg-interaction-hover active:bg-interaction-pressed">
            <span className="flex min-w-space-0 flex-col gap-stack-xs">
              <span className="title text-text-default">{s.node.label}</span>
              <span className="caption text-text-subtle">{formatNumber(s.knowledge)} دانش{s.openThoughts ? ` · ${formatNumber(s.openThoughts)} فکر باز` : ''}{s.stale ? ` · ${formatNumber(s.stale)} قدیمی` : ''}{s.subSections ? ` · ${formatNumber(s.subSections)} زیربخش` : ''}</span>
            </span>
            <Icon name="ChevronLeft" size="md" className="shrink-0 text-icon-subtle" />
          </button>
        </li>
      ))}
    </ul>
  </section>
);
