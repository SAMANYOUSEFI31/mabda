/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, Note, TreeNode } from '../types';
import { canDelete, canMove, contentOf, defaultTransferTarget, flatten, subtreeIds } from '../core/nodeTree';
import { Alert, Button, Dialog, Select, TextField, Textarea, formatNumber } from '../ui';
import { CoachPanel } from './CoachPanel';
import type { LedgerEntry } from '../types';

export type NodeDialogState =
  | { kind: 'create'; parentId: string }
  | { kind: 'rename'; nodeId: string }
  | { kind: 'move'; nodeId: string }
  | { kind: 'delete'; nodeId: string }
  | { kind: 'coach'; nodeId: string }
  | null;

interface Props {
  state: NodeDialogState;
  nodes: TreeNode[];
  objects: ContextObject[];
  notes: Note[];
  files?: Array<{ nodeId?: string }>;
  onClose: () => void;
  workspaceId: string;
  /** returns the id of the created node (the Coach opens for it right after) */
  onCreate: (parentId: string, label: string, description: string) => Promise<string>;
  onOpenCoach: (nodeId: string) => void;
  onSaveProposals: (proposals: Array<{ type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string }>) => Promise<void>;
  onLedger: (ledger: LedgerEntry[]) => void;
  onOpenAiSettings: () => void;
  onRename: (nodeId: string, label: string, description: string) => Promise<void>;
  onMove: (nodeId: string, parentId: string) => Promise<void>;
  onDelete: (nodeId: string, transferTo?: string) => Promise<void>;
}

const options = (nodes: TreeNode[], exclude: Set<string> = new Set()) =>
  flatten(nodes).filter(({ node }) => !exclude.has(node.id)).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }));

/** The dialogs of the node tree: create under any node, rename (system nodes too), move, delete (empty or with transfer). */
export const NodeDialogs: React.FC<Props> = (props) => (props.state ? <NodeDialogBody key={`${props.state.kind}-${'nodeId' in props.state ? props.state.nodeId : props.state.parentId}`} {...props} state={props.state} /> : null);

const NodeDialogBody: React.FC<Props & { state: NonNullable<NodeDialogState> }> = ({ state, nodes, objects, notes, files = [], workspaceId, onClose, onCreate, onOpenCoach, onSaveProposals, onLedger, onOpenAiSettings, onRename, onMove, onDelete }) => {
  const node = 'nodeId' in state ? nodes.find((n) => n.id === state.nodeId) : undefined;
  const [label, setLabel] = useState(state.kind === 'rename' ? node?.label ?? '' : '');
  const [description, setDescription] = useState(state.kind === 'rename' ? node?.description ?? '' : '');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onClose(); } finally { setBusy(false); }
  };

  if (state.kind === 'coach') {
    const n = nodes.find((x) => x.id === state.nodeId);
    if (!n) return null;
    return (
      <Dialog open onClose={onClose} size="lg" title={`مربی دانش برای «${n.label}»`} description="سؤال روشن‌کننده، نمایش ابهام و پیشنهاد دانش؛ هیچ‌چیز بدون تأیید تو ثبت نمی‌شود." footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
        <CoachPanel workspaceId={workspaceId} scope="node" nodeId={n.id} nodes={nodes} seedText={[n.label, n.description].filter(Boolean).join(': ')} onSaveProposals={onSaveProposals} onLedger={onLedger} onOpenAiSettings={onOpenAiSettings} />
      </Dialog>
    );
  }

  if (state.kind === 'create' || state.kind === 'rename') {
    const parent = nodes.find((n) => n.id === (state.kind === 'create' ? state.parentId : ''));
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title={state.kind === 'create' ? (parent ? `گرهٔ جدید زیر «${parent.label}»` : 'بخش اصلی تازه') : `تغییر نام «${node?.label ?? ''}»`}
        description={state.kind === 'create' ? 'بعد از ساخت گره، مربی دانش برای روشن‌کردن آن باز می‌شود.' : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button variant="primary" type="submit" form="node-form" loading={busy} disabled={!label.trim()}>
              {state.kind === 'create' ? 'ساخت گره' : 'ذخیرهٔ نام'}
            </Button>
          </>
        }
      >
        <form
          id="node-form"
          className="flex flex-col gap-stack-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            if (state.kind === 'create') {
              // the dialog is replaced by the Coach for the new node (no close in between)
              setBusy(true);
              onCreate(state.parentId, label.trim(), description.trim()).then(onOpenCoach).catch(() => undefined).finally(() => setBusy(false));
            } else void run(() => onRename(state.nodeId, label.trim(), description.trim()));
          }}
        >
          <TextField label="نام گره" required autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلاً: کمپین پاییز" />
          <Textarea label="توضیح کوتاه (اختیاری)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </form>
      </Dialog>
    );
  }

  if (!node) return null;

  if (state.kind === 'move') {
    const exclude = new Set(subtreeIds(nodes, node.id));
    const check = target ? canMove(nodes, node.id, target) : { ok: false as const, reason: '' };
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title={`جابه‌جایی «${node.label}»`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button variant="primary" loading={busy} disabled={!check.ok} onClick={() => run(() => onMove(node.id, target))}>جابه‌جا کن</Button>
          </>
        }
      >
        <div className="flex flex-col gap-stack-md">
          <Select label="مقصد (گرهٔ والد جدید)" value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: '', label: 'انتخاب کن…' }, ...options(nodes, exclude)]} />
          {!check.ok && check.reason && <Alert intent="warning">{check.reason}</Alert>}
        </div>
      </Dialog>
    );
  }

  // delete: nothing is lost. A node with content asks where it goes (default: its parent; a root → another root); the only root stays
  const content = contentOf(nodes, node.id, objects, notes, files);
  const empty = content.objects + content.notes + content.files + content.children === 0;
  const chosen = target || defaultTransferTarget(nodes, node.id) || '';
  const check = canDelete(nodes, node.id, objects, notes, empty ? undefined : chosen || undefined, files);
  const dest = nodes.find((n) => n.id === chosen)?.label ?? '';
  const parts = [[content.objects, 'دانش'], [content.notes, 'یادداشت'], [content.files, 'فایل'], [content.children, 'زیربخش']].filter(([n]) => (n as number) > 0).map(([n, w]) => `${formatNumber(n as number)} ${w}`).join('، ');
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`حذف «${node.label}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button variant="danger" loading={busy} disabled={!check.ok} onClick={() => run(() => onDelete(node.id, empty ? undefined : chosen))}>
            {empty ? 'حذف' : 'حذف و بردن محتوا'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-stack-md">
        {empty ? (
          <p className="body-md text-text-default">این بخش خالی است و بدون هیچ اثری حذف می‌شود.</p>
        ) : (
          <>
            <Alert intent="info" title={`${parts} در این بخش هست`}>
              چیزی پاک نمی‌شود: همه به «{dest || 'جای دیگر'}» می‌روند و برای هر دانش در تاریخچه می‌ماند چرا و کجا رفت. می‌توانی مقصد را عوض کنی.
            </Alert>
            {chosen || nodes.length > 1 ? <Select label="کجا برود؟" value={chosen} onChange={(e) => setTarget(e.target.value)} options={options(nodes, new Set(subtreeIds(nodes, node.id)))} /> : null}
          </>
        )}
        {!check.ok && <Alert intent="warning">{check.reason}</Alert>}
      </div>
    </Dialog>
  );
};
