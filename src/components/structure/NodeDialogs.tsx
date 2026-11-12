/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, ContextRelationship, Note, Thought, TreeNode } from '../../types';
import { canDelete, canMove, contentOf, defaultTransferTarget, flatten, ROOT_TARGET, subtreeIds } from '../../core/nodeTree';
import { moveEffect } from '../../core/nodeMove';
import { Alert, Button, Dialog, RadioGroup, Select, TextField, Textarea, formatNumber } from '../../ui';
import { nodeRemovalPlan } from '../../core/removal';
import type { RemovalMode } from '../../core/removal';
import { ClosedSection } from '../shared/ClosedSection';
import { CoachPanel } from '../knowledge/CoachPanel';
import { useAiStatus } from '../../services/aiStatus';
import type { LedgerEntry } from '../../types';

export type NodeDialogState =
  | { kind: 'create'; parentId: string; /** prefilled name (a thought turned into a section) */ label?: string; /** show the parent picker (with the top level) */ chooseParent?: boolean; thought?: { id: string; noteId: string; line: number; text: string } }
  | { kind: 'rename'; nodeId: string }
  | { kind: 'move'; nodeId: string; /** a destination chosen by a quick move («یک سطح بیرون بیاور»): '' = the top level */ preset?: string }
  | { kind: 'delete'; nodeId: string }
  | { kind: 'coach'; nodeId: string }
  | null;

interface Props {
  state: NodeDialogState;
  nodes: TreeNode[];
  objects: ContextObject[];
  notes: Note[];
  thoughts?: Thought[];
  files?: Array<{ nodeId?: string }>;
  onClose: () => void;
  workspaceId: string;
  /** returns the id of the created node (the Coach opens for it right after) */
  onCreate: (parentId: string, label: string, description: string) => Promise<string>;
  onOpenCoach: (nodeId: string) => void;
  onSaveProposals: (proposals: Array<{ type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string }>) => Promise<void>;
  onLedger: (ledger: LedgerEntry[]) => void;
  onRename: (nodeId: string, label: string, description: string) => Promise<void>;
  onMove: (nodeId: string, parentId: string, reason?: string) => Promise<void>;
  /** a thought that became a section: its line in the note is done */
  onThoughtSectioned?: (thought: { id: string; noteId: string; line: number; text: string }, label: string, nodeId: string) => Promise<void>;
  relationships?: ContextRelationship[];
  onDelete: (nodeId: string, transferTo?: string, mode?: RemovalMode) => Promise<void>;
}

const options = (nodes: TreeNode[], exclude: Set<string> = new Set()) =>
  flatten(nodes).filter(({ node }) => !exclude.has(node.id)).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }));

/** The dialogs of the node tree: create under any node, rename (system nodes too), move, delete (empty or with transfer). */
export const NodeDialogs: React.FC<Props> = (props) => (props.state ? <NodeDialogBody key={`${props.state.kind}-${'nodeId' in props.state ? props.state.nodeId : props.state.parentId}`} {...props} state={props.state} /> : null);

const NodeDialogBody: React.FC<Props & { state: NonNullable<NodeDialogState> }> = ({ state, nodes, objects, notes, thoughts = [], files = [], relationships = [], workspaceId, onClose, onCreate, onOpenCoach, onSaveProposals, onLedger, onRename, onMove, onDelete, onThoughtSectioned }) => {
  const node = 'nodeId' in state ? nodes.find((n) => n.id === state.nodeId) : undefined;
  const [label, setLabel] = useState(state.kind === 'rename' ? node?.label ?? '' : state.kind === 'create' ? state.label ?? '' : '');
  const [createParent, setCreateParent] = useState(state.kind === 'create' ? state.parentId : '');
  const [description, setDescription] = useState(state.kind === 'rename' ? node?.description ?? '' : '');
  const [labelError, setLabelError] = useState('');
  const [target, setTarget] = useState(state.kind === 'move' && state.preset !== undefined ? (state.preset === '' ? ROOT_TARGET : state.preset) : '');
  const [moveReason, setMoveReason] = useState('');
  const [delMode, setDelMode] = useState<RemovalMode>('move');
  const [busy, setBusy] = useState(false);
  const { managedEnabled } = useAiStatus();

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onClose(); } finally { setBusy(false); }
  };

  if (state.kind === 'coach') {
    if (!managedEnabled) return null;
    const n = nodes.find((x) => x.id === state.nodeId);
    if (!n) return null;
    return (
      <Dialog open onClose={onClose} size="lg" title={`مربی دانش برای «${n.label}»`} description="سؤال روشن‌کننده، نمایش ابهام و پیشنهاد دانش؛ هیچ‌چیز بدون تأیید تو ثبت نمی‌شود." footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
        <CoachPanel workspaceId={workspaceId} scope="node" nodeId={n.id} nodes={nodes} seedText={[n.label, n.description].filter(Boolean).join(': ')} onSaveProposals={onSaveProposals} onLedger={onLedger} />
      </Dialog>
    );
  }

  if (state.kind === 'create' || state.kind === 'rename') {
    const parent = nodes.find((n) => n.id === (state.kind === 'create' ? createParent : ''));
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title={state.kind === 'create' ? (parent ? `بخش تازه زیر «${parent.label}»` : 'بخش اصلی تازه') : `تغییر نام «${node?.label ?? ''}»`}
        description={state.kind === 'create' ? (state.thought ? 'فکر حل‌شده می‌شود؛ یادداشت اصلی بدون تغییر می‌ماند.' : managedEnabled ? 'بعد از افزودن بخش، مربی دانش برای روشن‌کردن آن باز می‌شود.' : undefined) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button variant="primary" type="submit" form="node-form" loading={busy}>
              {state.kind === 'create' ? 'افزودن بخش' : 'ذخیرهٔ نام'}
            </Button>
          </>
        }
      >
        <form
          id="node-form"
          noValidate
          className="flex flex-col gap-stack-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) { setLabelError('نام بخش را بنویس تا ساخته شود.'); document.getElementById('node-label')?.focus(); return; }
            if (state.kind === 'create') {
              // the dialog is replaced by the Coach for the new node (no close in between)
              setBusy(true);
              if (state.thought) {
                const th = state.thought;
                onCreate(createParent, label.trim(), description.trim()).then((nodeId) => onThoughtSectioned?.(th, label.trim(), nodeId)).then(onClose).catch(() => undefined).finally(() => setBusy(false));
              } else onCreate(createParent, label.trim(), description.trim()).then((id) => { if (managedEnabled) onOpenCoach(id); else onClose(); }).catch(() => undefined).finally(() => setBusy(false));
            } else void run(() => onRename(state.nodeId, label.trim(), description.trim()));
          }}
        >
          <TextField id="node-label" label="نام بخش" required autoFocus value={label} error={labelError || undefined} onChange={(e) => { setLabel(e.target.value); if (labelError && e.target.value.trim()) setLabelError(''); }} placeholder="مثلاً: کمپین پاییز" />
          {state.kind === 'create' && state.chooseParent && (
            <Select label="زیر کدام بخش؟" value={createParent} onChange={(e) => setCreateParent(e.target.value)} options={[{ value: '', label: 'بخش اصلی (سطح اول)' }, ...flatten(nodes).map((x) => ({ value: x.node.id, label: `${'— '.repeat(x.depth)}${x.node.label}` }))]} />
          )}
          <Textarea label="توضیح کوتاه (اختیاری)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </form>
      </Dialog>
    );
  }

  if (!node) return null;

  if (state.kind === 'move') {
    const exclude = new Set(subtreeIds(nodes, node.id));
    const parent = target === ROOT_TARGET ? '' : target;
    const check = target ? canMove(nodes, node.id, parent) : { ok: false as const, reason: '' };
    // what changes BEFORE she says yes: approved knowledge that stops (or starts) reaching the moved sections
    const effect = target && check.ok ? moveEffect(nodes, objects, relationships, node.id, parent, new Date()) : undefined;
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title={`جابه‌جایی «${node.label}»`}
        description="دانش، یادداشت، فایل، رابطه و تاریخچهٔ این بخش (و زیربخش‌هایش) با آن می‌روند."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button variant="primary" loading={busy} disabled={!check.ok} onClick={() => run(() => onMove(node.id, parent, moveReason.trim() || undefined))}>جابه‌جا کن</Button>
          </>
        }
      >
        <div className="flex flex-col gap-stack-md">
          <Select label="کجا برود؟" value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: '', label: 'انتخاب کن…' }, { value: ROOT_TARGET, label: 'سطح اصلی (بخش اصلی)' }, ...options(nodes, exclude)]} />
          {!check.ok && check.reason && <Alert intent="warning">{check.reason}</Alert>}
          {effect && effect.sentences.length > 0 && (
            <div data-testid="move-effect">
              <Alert intent="warning" title="بعد از جابه‌جایی چیزی عوض می‌شود">
                <ul className="list-inside list-disc">{effect.sentences.map((x) => <li key={x}>{x}</li>)}</ul>
              </Alert>
            </div>
          )}
          {effect && effect.sentences.length === 0 && <p className="body-sm text-text-subtle" data-testid="move-effect">دانشی از بیرون روی این بخش‌ها عوض نمی‌شود.</p>}
          {effect && check.ok && target && <p className="body-sm text-text-subtle" data-testid="move-effect-boundary">این جابه‌جایی رابطه‌های وابستگی را تغییر نمی‌دهد و به‌تنهایی موردی را برای بازبینی یا خروجی‌ای را برای به‌روزرسانی علامت نمی‌زند؛ اما دانش مؤثر بر این بخش‌ها ممکن است عوض شود.</p>}
          {check.ok && target && <TextField label="دلیل (اختیاری)" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} hint="در تاریخچه می‌ماند." />}
        </div>
      </Dialog>
    );
  }

  // delete: PLANNED (src/core/removal.ts) — the dialog shows the tree after, what stops reaching whom, and offers two modes. The default
  // is the old, safe one: the content goes to the parent. «archive the branch» archives its knowledge (it comes back with «برگردان»).
  const chosen = target || defaultTransferTarget(nodes, node.id) || '';
  const hasBranch = subtreeIds(nodes, node.id).length > 1;
  const content = contentOf(nodes, node.id, objects, notes, files, thoughts);
  const empty = content.objects + content.notes + content.thoughts + content.files + content.children === 0;
  const plan = nodeRemovalPlan({ nodes, objects, notes, files, thoughts, relationships, id: node.id, mode: delMode, transferTo: empty ? undefined : chosen || undefined });
  const dest = nodes.find((n) => n.id === chosen)?.label ?? '';
  const parts = [[content.objects, 'دانش'], [content.notes, 'یادداشت'], [content.thoughts, 'فکر'], [content.files, 'فایل'], [content.children, 'زیربخش']].filter(([n]) => (n as number) > 0).map(([n, w]) => `${formatNumber(n as number)} ${w}`).join('، ');
  const archiveMode = delMode === 'archive';
  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`حذف «${node.label}»`}
      description={empty ? undefined : 'چیزی بی‌صدا گم نمی‌شود: هر دو حالت برگشت‌پذیرند و بعد از حذف «برگرداندن» می‌آید.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button variant="danger" iconStart={archiveMode ? 'Archive' : 'Trash2'} loading={busy} disabled={!plan.ok} onClick={() => run(() => onDelete(node.id, empty ? undefined : chosen || undefined, delMode))}>
            {empty ? 'حذف' : archiveMode ? 'بایگانی شاخه' : 'حذف و بردن محتوا'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-stack-md" data-testid="node-delete">
        {empty ? (
          <p className="body-md text-text-default">این بخش خالی است و بدون هیچ اثری حذف می‌شود.</p>
        ) : (
          <>
            {hasBranch || content.objects > 0 || content.thoughts > 0 ? (
              <RadioGroup
                legend="با محتوای این بخش چه کنیم؟" name="node-delete-mode" value={delMode} onChange={(v) => setDelMode(v as RemovalMode)}
                options={[
                  { value: 'move', label: `محتوا و زیربخش‌ها به «${dest || 'جای دیگر'}» بروند` },
                  { value: 'archive', label: 'همهٔ این شاخه بایگانی شود' },
                ]}
                hint={archiveMode
                  ? `${formatNumber(plan.counts.archived || content.objects)} دانش بایگانی می‌شود (برمی‌گردد)؛ ${hasBranch ? `${formatNumber(plan.counts.branchNodes)} بخش برداشته می‌شود؛ ` : ''}یادداشت‌ها، فکرها و فایل‌ها به «${dest || 'جای دیگر'}» می‌روند.`
                  : `${parts} می‌روند؛ چیزی پاک یا بایگانی نمی‌شود.`}
              />
            ) : <Alert intent="info" title={`${parts} در این بخش هست`}>همه به «{dest || 'جای دیگر'}» می‌روند و برای هر دانش در تاریخچه می‌ماند چرا و کجا رفت.</Alert>}
            {(plan.counts.notes + plan.counts.thoughts + plan.counts.files > 0 || !archiveMode) && (chosen || nodes.length > 1) ? <Select label={archiveMode ? 'یادداشت‌ها، فکرها و فایل‌ها کجا بروند؟' : 'کجا برود؟'} value={chosen} onChange={(e) => setTarget(e.target.value)} options={options(nodes, new Set(subtreeIds(nodes, node.id)))} /> : null}
          </>
        )}
        {plan.ok && plan.tree.length > 1 && (
          <ClosedSection title="ساختار بعد از حذف">
            <ul className="flex flex-col gap-stack-xs" aria-label="ساختار بعد از حذف" data-testid="node-delete-tree">
              {plan.tree.filter((r) => r.state !== 'kept' || plan.tree.some((x) => x.state !== 'kept' && Math.abs(x.depth - r.depth) <= 1) || r.depth === 0).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-inline-xs" style={{ paddingInlineStart: `${r.depth * 16}px` }}>
                  <span className={`body-sm ${r.state === 'removed' ? 'text-text-subtle line-through' : 'text-text-default'}`}>{r.label}</span>
                  {r.state === 'removed' && <span className="caption text-text-subtle">{archiveMode ? 'بایگانی می‌شود' : 'حذف می‌شود'}</span>}
                  {r.state === 'moved' && <span className="caption text-text-subtle">می‌رود زیر «{r.to}»</span>}
                </li>
              ))}
            </ul>
          </ClosedSection>
        )}
        {plan.ok && plan.effect.sentences.length > 0 && (
          <Alert intent="warning" title="اثر روی آنچه به بخش‌ها می‌رسد">
            <ul className="flex list-disc flex-col gap-stack-xs ps-inset-lg" data-testid="node-delete-effect">{plan.effect.sentences.slice(0, 6).map((t) => <li key={t}>{t}</li>)}</ul>
          </Alert>
        )}
        {!plan.ok && plan.reason && <Alert intent="warning">{plan.reason}</Alert>}
      </div>
    </Dialog>
  );
};
