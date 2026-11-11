/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of thinking: the thought dialog and the note-removal question. Each lazy dialog loads the first time it is opened. */

import { Button, Checkbox, Dialog, formatNumber } from '../../ui';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ThoughtDialog = lazyNamed(() => import('../../components/thinking/ThoughtDialog'), 'ThoughtDialog');

export type ThinkingDialogsProps = Pick<ReadyScope, 'handleDeleteNote' | 'handleSaveThought' | 'handleSaveThoughts' | 'nodes' | 'noteDeleteAsk' | 'noteDeleteWithThoughts' | 'setNoteDeleteAsk' | 'setNoteDeleteWithThoughts' | 'setThoughtDialog' | 'thoughtDialog' | 'workspaceContexts'>;

export function ThinkingDialogs({ handleDeleteNote, handleSaveThought, handleSaveThoughts, nodes, noteDeleteAsk, noteDeleteWithThoughts, setNoteDeleteAsk, setNoteDeleteWithThoughts, setThoughtDialog, thoughtDialog, workspaceContexts }: ThinkingDialogsProps) {
  return (
    <>
    {/* Context Object Add/Edit Modal */}
    <Dialog
      open={!!noteDeleteAsk} onClose={() => setNoteDeleteAsk(null)} size="sm" title="حذف یادداشت"
      description={noteDeleteAsk ? `این یادداشت ${formatNumber(noteDeleteAsk.open)} فکر باز دارد. فکرها مال خودت‌اند؛ اگر چیزی نگویی می‌مانند و روی هر کدام نوشته می‌شود «یادداشت حذف شد».` : undefined}
      footer={<><Button variant="ghost" onClick={() => setNoteDeleteAsk(null)}>انصراف</Button><Button variant="danger" iconStart="Trash2" onClick={() => { const ask = noteDeleteAsk; setNoteDeleteAsk(null); if (ask) void handleDeleteNote(ask.id, noteDeleteWithThoughts); }}>حذف یادداشت</Button></>}
    >
      <div className="flex flex-col gap-stack-xs">
        <Checkbox label={`فکرهای باز هم بروند (${formatNumber(noteDeleteAsk?.open ?? 0)} فکر)`} checked={noteDeleteWithThoughts} onChange={(e) => setNoteDeleteWithThoughts(e.target.checked)} />
        <p className="body-sm text-text-subtle">با «برگرداندن» متن یادداشت برمی‌گردد و فکرها دوباره از روی خط‌هایش ساخته می‌شوند (بی‌تاریخچهٔ قبلی).</p>
      </div>
    </Dialog>
    <Deferred when={!!thoughtDialog}><ThoughtDialog open={!!thoughtDialog} onClose={() => setThoughtDialog(null)} nodes={nodes} objects={workspaceContexts} nodeId={thoughtDialog?.nodeId} initialKind={thoughtDialog?.initialKind} initialAbout={thoughtDialog?.initialAbout} onSave={handleSaveThought} onSaveMany={handleSaveThoughts} /></Deferred>
    </>
  );
}
