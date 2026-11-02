/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, Note, StoredFile, TreeNode } from '../types';
import { childrenOf } from '../core/nodeTree';
import { Badge, Button, Card, EmptyState, Menu, IconButton, PROVENANCE_LABEL, ReachBadge, StatusBadge, TypeBadge, formatNumber } from '../ui';
import type { NodeDialogState } from './NodeDialogs';
import { NodeNotes } from './NodeNotes';

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
  onOpenThread: (nodeId: string) => void;
  onAddNote: (nodeId: string, content: string) => Promise<void>;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onExtractNote: (noteId: string) => Promise<void>;
}

export const ContextTreeDocView: React.FC<ContextTreeDocViewProps> = (props) => {
  const { objects, nodes } = props;
  const activeObjects = objects.filter((o) => o.status !== 'Archived' && o.status !== 'Superseded');
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNotes = (id: string) => setOpenNotes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const renderNode = (node: TreeNode, path: string, depth: number): React.ReactNode => {
    const nodeObjects = activeObjects.filter((o) => o.nodeId === node.id);
    const nodeNotes = props.notes.filter((n) => n.nodeId === node.id);
    const nodeFiles = props.files.filter((f) => f.nodeId === node.id);
    const kids = childrenOf(nodes, node.id);
    const notesOpen = openNotes.has(node.id);

    return (
      <section key={node.id} className={`flex flex-col gap-stack-md ${depth > 0 ? 'ps-inset-lg border-s border-border-subtle' : ''}`} aria-labelledby={`node-${node.id}`}>
        <div className="flex flex-col gap-inline-sm border-b border-border-subtle pb-inset-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-space-0 flex-wrap items-baseline gap-x-inline-sm">
            <span className="label-md tabular-nums text-text-subtlest">{path}</span>
            <h3 id={`node-${node.id}`} className="heading-xs text-text-default">{node.label}</h3>
            {node.isSystem ? <Badge intent="neutral" icon="Lock">سیستمی</Badge> : null}
            {node.description && <span className="body-sm hidden text-text-subtle sm:inline">({node.description})</span>}
          </div>
          <div className="flex flex-wrap items-center gap-inline-xs">
            <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => props.onAddNewToNode(node.id)}>افزودن دانش</Button>
            <Button size="sm" variant="ghost" iconStart="FileText" aria-expanded={notesOpen} onClick={() => toggleNotes(node.id)}>
              یادداشت‌ها ({formatNumber(nodeNotes.length)})
            </Button>
            <Button size="sm" variant="ghost" iconStart="BookOpen" onClick={() => props.onReadNode(node.id)}>خواندن سند</Button>
            <Button size="sm" variant="ghost" iconStart="Layers" onClick={() => props.onShowEffect(node.id)}>آنچه اینجا اثر دارد</Button>
            <Button size="sm" variant="ghost" iconStart="MessageSquare" onClick={() => props.onChatWithNode(node.id)}>گفتگو با این گره</Button>
            <Button size="sm" variant="ghost" iconStart="Pencil" onClick={() => props.onOpenThread(node.id)}>گفتگوی متمرکز</Button>
            <Menu
              label={`عملیات گرهٔ ${node.label}`}
              align="end"
              trigger={<IconButton icon="Ellipsis" label={`عملیات گرهٔ ${node.label}`} size="sm" />}
              items={[
                { label: 'زیرگرهٔ جدید', icon: 'Plus', onSelect: () => props.onNodeAction({ kind: 'create', parentId: node.id }) },
                { label: 'مربی دانش', icon: 'Brain', onSelect: () => props.onNodeAction({ kind: 'coach', nodeId: node.id }) },
                { label: 'تغییر نام', icon: 'Pencil', onSelect: () => props.onNodeAction({ kind: 'rename', nodeId: node.id }) },
                { label: 'جابه‌جایی', icon: 'Network', disabled: !!node.isSystem, onSelect: () => props.onNodeAction({ kind: 'move', nodeId: node.id }) },
                { divider: true },
                { label: 'حذف', icon: 'Trash2', intent: 'danger', disabled: !!node.isSystem, onSelect: () => props.onNodeAction({ kind: 'delete', nodeId: node.id }) },
              ]}
            />
          </div>
        </div>

        {notesOpen && (
          <NodeNotes
            nodeId={node.id}
            notes={nodeNotes}
            extractingId={props.extractingNoteId}
            onAdd={props.onAddNote}
            onUpdate={props.onUpdateNote}
            onDelete={props.onDeleteNote}
            onExtract={props.onExtractNote}
          />
        )}

        {nodeFiles.length > 0 && (
          <p className="caption text-text-subtle">فایل‌های این گره: {nodeFiles.map((f) => f.name).join('، ')}</p>
        )}

        {nodeObjects.length === 0 && kids.length === 0 ? (
          <EmptyState
            icon="Inbox"
            title="هنوز موردی در این شاخه ثبت نشده"
            action={<Button variant="secondary" size="sm" onClick={() => props.onAddNewToNode(node.id)}>ثبت اولین مورد</Button>}
          />
        ) : (
          nodeObjects.length > 0 && (
            <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">
              {nodeObjects.map((obj) => (
                <Card key={obj.id} padding="lg" onClick={() => props.onSelectObject(obj)} className="flex flex-col gap-stack-sm">
                  <div className="flex items-start justify-between gap-inline-sm">
                    <h4 className="title min-w-space-0 flex-1 text-text-default">{obj.title}</h4>
                    <div className="flex max-w-1/2 flex-wrap justify-end gap-inline-xs">
                      <TypeBadge value={obj.type} />
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
              ))}
            </div>
          )
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
