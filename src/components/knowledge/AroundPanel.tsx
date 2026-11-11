/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { Around, AroundItem, RelatedSuggestion } from '../../core/around';
import { relatedFor } from '../../core/around';
import type { ContextObject } from '../../types';
import { Button, Icon, StatusBadge, TypeBadge, formatNumber } from '../../ui';

interface Props {
  object: ContextObject;
  around: Around;
  allObjects: ContextObject[];
  onOpenObject?: (o: ContextObject) => void;
  onOpenNote?: (noteId: string, nodeId: string) => void;
  onOpenThinking?: () => void;
  onOpenAssets?: () => void;
}

/**
 * «اطراف این مورد»: every certain connection of one piece of knowledge, grouped (relations · thoughts · outputs · source), each row with a
 * way to go there. A group with nothing says so in one sentence. «مرتبط‌های معنایی» appears ONLY when the `'related'` slot has a provider
 * (off by default): it is a labelled suggestion, never a stored link, and a failure shows its error with a retry.
 */
export const AroundPanel: React.FC<Props> = ({ object, around, allObjects, onOpenObject, onOpenNote, onOpenThinking, onOpenAssets }) => {
  const go = (i: AroundItem) => {
    const t = i.target;
    if (!t) return;
    if (t.type === 'object') { const o = allObjects.find((x) => x.id === t.objectId); if (o) onOpenObject?.(o); }
    else if (t.type === 'note') onOpenNote?.(t.noteId, t.nodeId);
    else if (t.type === 'thought') onOpenThinking?.();
    else onOpenAssets?.();
  };
  const canGo = (i: AroundItem) => !!i.target && (i.target.type === 'object' ? !!onOpenObject : i.target.type === 'note' ? !!onOpenNote : i.target.type === 'thought' ? !!onOpenThinking : !!onOpenAssets);
  const connected = useMemo(() => new Set(around.groups.flatMap((g) => g.items.map((i) => i.object?.id).filter((x): x is string => !!x))), [around]);

  return (
    <div className="flex flex-col gap-stack-lg" role="region" aria-label="اطراف این مورد" data-testid="around">
      <p className="body-sm text-text-subtle">هر چیزی که قطعاً به این مورد وصل است، یک‌جا: رابطه‌ها، فکرهایی که از آن نام برده‌اند، خروجی‌هایی که از آن ساخته شده‌اند و منبعش.</p>
      {around.groups.map((g) => (
        <section key={g.id} className="flex flex-col gap-stack-sm rounded-control border border-border-default p-inset-lg" aria-label={g.title} data-testid={`around-${g.id}`}>
          <h4 className="label-md text-text-default">{g.title} ({formatNumber(g.items.length)})</h4>
          {g.items.length === 0 ? <p className="body-sm text-text-subtle">{g.empty}</p> : (
            <ul className="flex flex-col gap-stack-sm">
              {g.items.map((i) => (
                <li key={i.key} className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <span className="flex min-w-space-0 flex-1 flex-col">
                    {i.role && <span className="label-sm text-text-subtle">{i.role}{i.far ? ` · و ${formatNumber(i.far)} مورد دورتر` : ''}</span>}
                    <span className="body-md text-text-default">{i.text}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-inline-xs">
                    {i.object && <><TypeBadge value={i.object.type} /><StatusBadge value={i.object.status} /></>}
                    {canGo(i) && <Button size="sm" variant="ghost" onClick={() => go(i)}>{i.target?.type === 'output' ? 'ببین' : 'برو'}</Button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <Related object={object} allObjects={allObjects} connected={connected} onOpenObject={onOpenObject} />
    </div>
  );
};

/** the switched-off connection point for «مرتبط‌های معنایی» (slot 'related'): nothing at all until a provider is registered */
const Related: React.FC<{ object: ContextObject; allObjects: ContextObject[]; connected: Set<string>; onOpenObject?: (o: ContextObject) => void }> = ({ object, allObjects, connected, onOpenObject }) => {
  const [state, setState] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'done'; items: RelatedSuggestion[] }>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'idle' });
    relatedFor(object, allObjects, connected)
      .then((r) => { if (live && r) setState({ status: 'done', items: r }); })
      .catch(() => { if (live) setState({ status: 'error' }); });
    return () => { live = false; };
  }, [object, allObjects, connected, attempt]);
  if (state.status === 'idle' || state.status === 'loading') return null;
  if (state.status === 'error') {
    return (
      <section className="flex flex-col gap-stack-sm rounded-control border border-border-default p-inset-lg" aria-label="مرتبط‌های معنایی" role="alert" data-testid="around-related-error">
        <p className="body-md text-text-default">پیشنهاد مورد مرتبط در دسترس نشد.</p>
        <div><Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={() => setAttempt((n) => n + 1)}>دوباره</Button></div>
      </section>
    );
  }
  if (!state.items.length) return null;
  return (
    <section className="flex flex-col gap-stack-sm rounded-control border border-border-default p-inset-lg" aria-label="مرتبط‌های معنایی" data-testid="around-related">
      <h4 className="label-md text-text-default">مرتبط (پیشنهادی) ({formatNumber(state.items.length)})</h4>
      <p className="body-sm text-text-subtle">فقط پیشنهاد است؛ هیچ رابطه‌ای ثبت نشده است.</p>
      <ul className="flex flex-col gap-stack-sm">
        {state.items.map((s) => {
          const o = allObjects.find((x) => x.id === s.objectId);
          return (
            <li key={s.objectId} className="flex flex-wrap items-center justify-between gap-inline-sm">
              <span className="flex items-center gap-inline-xs body-md text-text-default"><Icon name="Link2" size="md" className="text-icon-subtle" />{s.label}</span>
              {o && onOpenObject && <Button size="sm" variant="ghost" onClick={() => onOpenObject(o)}>برو</Button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
