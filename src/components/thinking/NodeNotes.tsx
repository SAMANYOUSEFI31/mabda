/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, Note } from '../../types';
import { MentionTextarea } from '../shared/MentionTextarea';
import { NoteLines } from './NoteLines';
import { canSplit } from '../../core/thinkingMarkers';
import { isPendingNote } from '../../core/pendingNote';
import { Badge, Button, IconButton, Textarea, formatJalaliDate } from '../../ui';
import { useAiStatus } from '../../services/aiStatus';

interface Props {
  nodeId: string;
  notes: Note[];
  /** for «@»: the knowledge a note can name (a note itself holds no relationship) */
  objects: ContextObject[];
  extractingId: string | null;
  onAdd: (nodeId: string, content: string) => Promise<unknown>;
  /** `false` = it was not saved (a conflict, the network): the edit box stays open with what she typed */
  onUpdate: (noteId: string, content: string, base?: string) => Promise<boolean | void>;
  onDelete: (noteId: string) => Promise<void>;
  /** «استخراج»: the note becomes Proposed objects (never facts) */
  onExtract: (noteId: string) => Promise<void>;
  /** «تبدیل به بخش»: a note with several ## headings → one child node per section (the note stays) */
  onSplit?: (noteId: string) => Promise<void>;
}

/** Free-form notes of one node. They are not injected automatically; «استخراج» reads one only on explicit click. */
export const NodeNotes: React.FC<Props> = ({ nodeId, notes, objects, extractingId, onAdd, onUpdate, onDelete, onExtract, onSplit }) => {
  const { managedEnabled } = useAiStatus(); // «استخراج» reads a note with the managed AI: with it off it is not offered
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string; base: string } | null>(null);

  // optimistic (useNotes.handleAddNote): the note is in the list on the press and the field is empty for the next one; if the
  // server refuses it, the note leaves the list and her words come back into the field (unless she has started a new one)
  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    if ((await onAdd(nodeId, text)) === false) setDraft((d) => d || text);
  };

  return (
    <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md">
      <div className="flex flex-wrap items-center gap-inline-sm">
        <span className="label-md text-text-default">یادداشت آزاد</span>
        <Badge intent="neutral" icon="Lock">فقط برای خودت؛ در خروجی‌ها و بسته‌ها نمی‌آید</Badge>
      </div>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-stack-sm" aria-label="یادداشت‌های این بخش">
          {notes.map((n) => (
            <li key={n.id} aria-busy={isPendingNote(n.id) || undefined} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-raised p-inset-md">
              {editing?.id === n.id ? (
                <>
                  <MentionTextarea label="ویرایش یادداشت" rows={3} value={editing.text} onValueChange={(t) => setEditing({ ...editing, text: t })} objects={objects} />
                  <div className="flex justify-end gap-inline-xs">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
                    <Button size="sm" variant="secondary" disabled={!editing.text.trim()} onClick={async () => { if ((await onUpdate(n.id, editing.text.trim(), editing.base)) !== false) setEditing(null); }}>ذخیره</Button>
                  </div>
                </>
              ) : (
                <>
                  <NoteLines content={n.content} onChange={async (c) => { if (!isPendingNote(n.id)) await onUpdate(n.id, c); }} />
                  {onSplit && !isPendingNote(n.id) && canSplit(n.content) && (
                    <div className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle p-inset-sm">
                      <span className="body-sm text-text-subtle">این بخش بزرگ شده؛ تبدیل به بخش؟ متن اصلی یادداشت می‌ماند.</span>
                      <Button size="sm" variant="secondary" iconStart="Network" onClick={() => onSplit(n.id)}>تبدیل به بخش</Button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                    <span className="caption text-text-subtle">{formatJalaliDate(n.updatedAt)}</span>
                    {/* a note still on its way has no actions yet: they would reach the server with an id it never gave */}
                    {!isPendingNote(n.id) && <div className="flex items-center gap-inline-xs">
                      {managedEnabled && <Button size="sm" variant="secondary" iconStart="FolderInput" loading={extractingId === n.id} onClick={() => onExtract(n.id)}>
                        استخراج
                      </Button>}
                      <IconButton icon="Pencil" label="ویرایش یادداشت" size="sm" onClick={() => setEditing({ id: n.id, text: n.content, base: n.updatedAt })} />
                      <IconButton icon="Trash2" label="حذف یادداشت" size="sm" onClick={() => onDelete(n.id)} />
                    </div>}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <MentionTextarea label="یادداشت تازه" rows={2} value={draft} onValueChange={setDraft} objects={objects} placeholder="هر چیزی که هنوز ساختار ندارد؛ بعداً می‌توانی «استخراج» کنی." hint="مادهٔ خام است: هر خطش را بعداً می‌شود فکر کرد (ایده، سؤال، فرض یا تصمیم باز). با @ نام یک دانش را بیاور." />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" iconStart="Plus" disabled={!draft.trim()} onClick={add}>افزودن یادداشت</Button>
      </div>
    </div>
  );
};
