/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { Note } from '../types';
import { Badge, Button, IconButton, Textarea, formatJalaliDate } from '../ui';

interface Props {
  nodeId: string;
  notes: Note[];
  extractingId: string | null;
  onAdd: (nodeId: string, content: string) => Promise<void>;
  onUpdate: (noteId: string, content: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  /** «استخراج»: the note becomes Proposed objects (never facts) */
  onExtract: (noteId: string) => Promise<void>;
}

/** Free-form notes of one node. They are never sent to the model; only «استخراج» reads one, on explicit click. */
export const NodeNotes: React.FC<Props> = ({ nodeId, notes, extractingId, onAdd, onUpdate, onDelete, onExtract }) => {
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
        <Badge intent="neutral" icon="Lock">به مدل داده نمی‌شود</Badge>
      </div>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-stack-sm" aria-label="یادداشت‌های این گره">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-raised p-inset-md">
              {editing?.id === n.id ? (
                <>
                  <Textarea label="ویرایش یادداشت" rows={3} value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} />
                  <div className="flex justify-end gap-inline-xs">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
                    <Button size="sm" variant="secondary" disabled={!editing.text.trim()} onClick={async () => { await onUpdate(n.id, editing.text.trim()); setEditing(null); }}>ذخیره</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="body-md whitespace-pre-wrap text-text-default">{n.content}</p>
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

      <Textarea label="یادداشت تازه" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="هر چیزی که هنوز ساختار ندارد؛ بعداً می‌توانی «استخراج» کنی." />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" iconStart="Plus" loading={busy} disabled={!draft.trim()} onClick={add}>افزودن یادداشت</Button>
      </div>
    </div>
  );
};
