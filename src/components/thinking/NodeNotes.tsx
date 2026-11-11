/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, Note } from '../../types';
import { MentionTextarea } from '../shared/MentionTextarea';
import { NoteLines } from './NoteLines';
import { canSplit } from '../../core/thinkingMarkers';
import { Badge, Button, IconButton, Textarea, formatJalaliDate } from '../../ui';

interface Props {
  nodeId: string;
  notes: Note[];
  /** for «@»: the knowledge a note can name (a note itself holds no relationship) */
  objects: ContextObject[];
  extractingId: string | null;
  onAdd: (nodeId: string, content: string) => Promise<void>;
  onUpdate: (noteId: string, content: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  /** «استخراج»: the note becomes Proposed objects (never facts) */
  onExtract: (noteId: string) => Promise<void>;
  /** «تبدیل به گره»: a note with several ## headings → one child node per section (the note stays) */
  onSplit?: (noteId: string) => Promise<void>;
}

/** Free-form notes of one node. They are not injected automatically; «استخراج» reads one only on explicit click. */
export const NodeNotes: React.FC<Props> = ({ nodeId, notes, objects, extractingId, onAdd, onUpdate, onDelete, onExtract, onSplit }) => {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try { await onAdd(nodeId, draft.trim()); setDraft(''); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md">
      <div className="flex flex-wrap items-center gap-inline-sm">
        <span className="label-md text-text-default">یادداشت آزاد</span>
        <Badge intent="neutral" icon="Lock">به‌طور خودکار به مدل نمی‌رسد</Badge>
      </div>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-stack-sm" aria-label="یادداشت‌های این گره">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-raised p-inset-md">
              {editing?.id === n.id ? (
                <>
                  <MentionTextarea label="ویرایش یادداشت" rows={3} value={editing.text} onValueChange={(t) => setEditing({ id: n.id, text: t })} objects={objects} />
                  <div className="flex justify-end gap-inline-xs">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
                    <Button size="sm" variant="secondary" disabled={!editing.text.trim()} onClick={async () => { await onUpdate(n.id, editing.text.trim()); setEditing(null); }}>ذخیره</Button>
                  </div>
                </>
              ) : (
                <>
                  <NoteLines content={n.content} onChange={(c) => onUpdate(n.id, c)} />
                  {onSplit && canSplit(n.content) && (
                    <div className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle p-inset-sm">
                      <span className="body-sm text-text-subtle">این بخش بزرگ شده؛ تبدیل به گره؟ متن اصلی یادداشت می‌ماند.</span>
                      <Button size="sm" variant="secondary" iconStart="Network" onClick={() => onSplit(n.id)}>تبدیل به گره</Button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                    <span className="caption text-text-subtle">{formatJalaliDate(n.updatedAt)}</span>
                    <div className="flex items-center gap-inline-xs">
                      <Button size="sm" variant="secondary" iconStart="Wand2" loading={extractingId === n.id} onClick={() => onExtract(n.id)}>
                        استخراج
                      </Button>
                      <IconButton icon="Pencil" label="ویرایش یادداشت" size="sm" onClick={() => setEditing({ id: n.id, text: n.content })} />
                      <IconButton icon="Trash2" label="حذف یادداشت" size="sm" onClick={() => onDelete(n.id)} />
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <MentionTextarea label="یادداشت تازه" rows={2} value={draft} onValueChange={setDraft} objects={objects} placeholder="هر چیزی که هنوز ساختار ندارد؛ بعداً می‌توانی «استخراج» کنی." hint="برای ایده، سؤال یا فرض از «فکر تازه» استفاده کن. با @ نام یک دانش را بیاور. یادداشت رابطه نمی‌سازد؛ وقتی به دانش تبدیل شود، همان‌جا رابطه را پیشنهاد می‌دهیم." />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" iconStart="Plus" loading={busy} disabled={!draft.trim()} onClick={add}>افزودن یادداشت</Button>
      </div>
    </div>
  );
};
