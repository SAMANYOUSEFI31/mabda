/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import type { ContextObject } from '../types';
import { activeMention, applyMention, mentionCandidates } from '../core/mentions';
import { TYPE_META, Textarea } from '../ui';

interface Props {
  label: string;
  value: string;
  onValueChange: (text: string) => void;
  /** the objects that can be named (the one being edited is left out via `selfId`) */
  objects: ContextObject[];
  selfId?: string;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
}

/**
 * A text box where `@` offers the names of objects. Choosing one writes `@«عنوان»` into the text — and nothing else:
 * no relationship is made here (the save step only SUGGESTS one; src/core/mentions.ts).
 * Keys while the list is open: ↑ ↓ move, Enter or Tab choose. The list closes when the caret leaves the `@word`.
 */
export const MentionTextarea: React.FC<Props> = ({ label, value, onValueChange, objects, selfId, rows, required, placeholder, hint }) => {
  const uid = useId();
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [pos, setPos] = useState(0);
  const [muted, setMuted] = useState<number | null>(null);
  const act = useMemo(() => activeMention(value, caret), [value, caret]);
  const list = useMemo(() => (act && act.start !== muted ? mentionCandidates(act.query, objects, selfId) : []), [act, muted, objects, selfId]);
  const open = list.length > 0;
  const optId = (i: number) => `${uid}-m${i}`;

  const sync = (el: HTMLTextAreaElement) => { ta.current = el; setCaret(el.selectionStart ?? 0); };
  const choose = (o: ContextObject) => {
    if (!act) return;
    const r = applyMention(value, act, caret, o);
    onValueChange(r.text);
    setPos(0);
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(r.caret, r.caret); setCaret(r.caret); });
  };

  return (
    <div className="flex flex-col gap-stack-xs">
      <Textarea
        label={label} required={required} rows={rows} value={value} placeholder={placeholder} hint={hint ?? 'با @ نام یک دانش را بیاور؛ فقط ارجاع می‌نویسد و خودش رابطه نمی‌سازد.'}
        onChange={(e) => { onValueChange(e.target.value); sync(e.target); setPos(0); setMuted(null); }}
        onSelect={(e) => sync(e.currentTarget)}
        onKeyUp={(e) => sync(e.currentTarget)}
        onClick={(e) => sync(e.currentTarget)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setPos((p) => (p + 1) % list.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setPos((p) => (p - 1 + list.length) % list.length); }
          else if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) { e.preventDefault(); choose(list[pos] ?? list[0]); }
          else if (e.key === 'Escape') { setMuted(act!.start); }
        }}
        role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={open ? `${uid}-l` : undefined} aria-activedescendant={open ? optId(pos) : undefined}
      />
      {open && (
        <div id={`${uid}-l`} role="listbox" aria-label="دانش‌هایی که می‌شود نام برد" className="flex flex-col rounded-control border border-border-default bg-surface-raised p-inset-xs">
          {list.map((o, i) => (
            <div
              key={o.id} id={optId(i)} role="option" aria-selected={i === pos} onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseMove={() => setPos(i)}
              className={`flex min-h-touch cursor-pointer items-center justify-between gap-inline-sm rounded-control-sm px-inset-sm ${i === pos ? 'bg-bg-neutral-subtle' : ''}`}
            >
              <span className="body-md text-text-default">{o.title}</span>
              <span className="caption text-text-subtle">{TYPE_META[o.type].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
