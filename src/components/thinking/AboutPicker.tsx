/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import type { ContextObject, TreeNode } from '../../types';
import { normalizeFa } from '../../core/contextEngine';
import type { AboutTarget } from '../../core/thoughtAbout';
import { Button, Icon, TextField, formatNumber } from '../../ui';

interface Props {
  objects: ContextObject[];
  nodes: TreeNode[];
  value: AboutTarget[];
  onChange: (next: AboutTarget[]) => void;
}

const SHOWN = 5;
const MAX = 8;

/**
 * «دربارهٔ…» (optional): other sections or pieces of knowledge the thought is about, besides the section it lives in. Type a few
 * letters, tap to add; the chosen ones are chips that remove with one tap. Nothing is shown until something is typed (a long list
 * would fill the dialog). The names are written into the line as `@«…»` by the caller — no relationship is made.
 */
export const AboutPicker: React.FC<Props> = ({ objects, nodes, value, onChange }) => {
  const [q, setQ] = useState('');
  const taken = useMemo(() => new Set(value.map((v) => `${v.kind}:${v.id}`)), [value]);
  const matches = useMemo(() => {
    const n = normalizeFa(q.trim());
    if (!n) return [] as AboutTarget[];
    const secs = nodes.filter((x) => normalizeFa(x.label).includes(n)).map((x) => ({ kind: 'node' as const, id: x.id, label: x.label }));
    const know = objects.filter((o) => o.status !== 'Archived' && o.status !== 'Superseded' && !o.sample && normalizeFa(o.title).includes(n)).map((o) => ({ kind: 'object' as const, id: o.id, label: o.title }));
    return [...secs, ...know].filter((t) => !taken.has(`${t.kind}:${t.id}`)).slice(0, SHOWN);
  }, [q, nodes, objects, taken]);
  const add = (t: AboutTarget) => { if (value.length < MAX) onChange([...value, t]); setQ(''); };
  return (
    <div className="flex flex-col gap-stack-xs" role="group" aria-label="دربارهٔ">
      <span className="label-md text-text-default">دربارهٔ چه چیز دیگری هم هست؟ (اختیاری){value.length ? ` (${formatNumber(value.length)})` : ''}</span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-inline-xs">
          {value.map((t) => <Button key={`${t.kind}:${t.id}`} type="button" size="sm" variant="secondary" iconStart={t.kind === 'node' ? 'FolderTree' : 'FileText'} iconEnd="X" aria-label={`برداشتن ${t.label}`} onClick={() => onChange(value.filter((x) => !(x.kind === t.kind && x.id === t.id)))}>{t.label}</Button>)}
        </div>
      )}
      <TextField label="بخش یا دانش" iconStart="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="چند حرف از نام…" disabled={value.length >= MAX} hint={value.length >= MAX ? 'بیشتر از ۸ مورد لازم نیست.' : 'فکر در فیلتر هرکدام از این‌ها هم دیده می‌شود.'} />
      {matches.length > 0 && (
        <ul className="flex flex-col gap-stack-xs" aria-label="نتیجهٔ جستجو">
          {matches.map((t) => (
            <li key={`${t.kind}:${t.id}`}>
              <button type="button" onClick={() => add(t)} className="body-md flex min-h-touch w-full items-center gap-inline-sm rounded-control-sm border border-border-subtle px-inset-md text-start text-text-default hover:bg-interaction-hover">
                <Icon name={t.kind === 'node' ? 'FolderTree' : 'FileText'} size="md" className="text-icon-subtle" />
                <span className="flex-1">{t.label}</span>
                <span className="caption text-text-subtle">{t.kind === 'node' ? 'بخش' : 'دانش'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && matches.length === 0 && <p className="body-sm text-text-subtle">موردی پیدا نشد.</p>}
    </div>
  );
};
