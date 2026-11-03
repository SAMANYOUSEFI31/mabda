/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import type { ContextObject } from '../types';
import { normalizeFa } from '../core/contextEngine';
import { Button, TextField, TypeBadge, formatNumber } from '../ui';

interface Props {
  label: string;
  hint: string;
  options: ContextObject[];
  selected: string[];
  onChange: (ids: string[]) => void;
  titleOf: (id: string) => string;
}

const SHOWN = 5;

/** choose other pieces of knowledge by typing a few letters: the chosen ones are chips (tap to remove), the matches are a short list */
export const RelationPicker: React.FC<Props> = ({ label, hint, options, selected, onChange, titleOf }) => {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const n = normalizeFa(q.trim());
    // nothing is listed until a few letters are typed: two pickers must not fill the dialog
    if (!n) return [];
    return options.filter((o) => !selected.includes(o.id) && normalizeFa(`${o.title} ${o.content}`).includes(n)).slice(0, SHOWN);
  }, [q, options, selected]);
  return (
    <div className="flex flex-col gap-stack-xs" role="group" aria-label={label}>
      <span className="label-md text-text-default">{label}{selected.length ? ` (${formatNumber(selected.length)})` : ''}</span>
      <p className="body-sm text-text-subtle">{hint}</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-inline-xs">
          {selected.map((id) => <Button key={id} type="button" size="sm" variant="secondary" iconEnd="X" aria-label={`برداشتن ${titleOf(id)}`} onClick={() => onChange(selected.filter((x) => x !== id))}>{titleOf(id)}</Button>)}
        </div>
      )}
      <TextField label="جستجوی دانش" iconStart="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="چند حرف از عنوان…" />
      {matches.length > 0 && (
        <ul className="flex flex-col gap-stack-xs" aria-label={`نتیجهٔ جستجو برای ${label}`}>
          {matches.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle p-inset-sm">
              <span className="flex min-w-space-0 flex-wrap items-center gap-inline-xs"><span className="body-md text-text-default">{o.title}</span><TypeBadge value={o.type} iconOnly /></span>
              <Button type="button" size="sm" variant="ghost" iconStart="Plus" onClick={() => { onChange([...selected, o.id]); setQ(''); }}>افزودن</Button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && matches.length === 0 && <p className="body-sm text-text-subtle">موردی پیدا نشد.</p>}
    </div>
  );
};
