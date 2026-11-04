/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GROUP_FA, groupItems, groupLeft } from '../core/scopeExplain';
import type { Explain } from '../core/scopeExplain';
import { LEFT_REASON_FA } from '../core/packScope';
import { Badge, Button, formatNumber } from '../ui';
import { ClosedSection } from './ClosedSection';

interface Props {
  explain: Explain;
  /** «این خط قرمز را ببین / ویرایش کن»: opens the rule where its reach («محدودهٔ اثر») is decided */
  onOpenObject?: (id: string) => void;
  /** a request lets her add a skipped thing by hand */
  onAdd?: (id: string) => void;
  /** items shown per skipped reason before «و N مورد دیگر» */
  shown?: number;
}

/** the sentence that says what was read */
export const scopeLine = (s: Explain['scope']): string => (s.whole
  ? 'از همهٔ درخت خوانده می‌شود.'
  : `از ${s.pickedLabels.map((l) => `«${l}»`).join('، ')}${s.withChildren ? ' و زیربخش‌هایش' : ''} خوانده می‌شود (${formatNumber(s.sections)} بخش)؛ به‌اضافهٔ آنچه از بخش‌های بالاتر به ارث می‌رسد و خط قرمزهای «همه‌جا».`);

/**
 * «چه آمد و چرا / چه نیامد و چرا» — one component for a saved pack and for a request. Built from the same data as the text that
 * is copied (src/core/scopeExplain.ts); nothing here is computed in the view.
 */
export const ScopeExplain: React.FC<Props> = ({ explain, onOpenObject, onAdd, shown = 40 }) => {
  const groups = groupItems(explain.items);
  const left = groupLeft(explain.skipped);
  return (
    <div className="flex flex-col gap-stack-sm" data-testid="scope-explain">
      <p className="body-sm text-text-default" data-testid="scope-line">{scopeLine(explain.scope)}</p>
      {groups.length === 0 && <p className="body-sm text-text-subtle">با این انتخاب چیزی نمی‌آید.</p>}
      {groups.map(([g, items]) => (
        <div key={g} data-testid={`explain-group-${g}`}>
          <ClosedSection defaultOpen={g === 'guardrail'} title={GROUP_FA[g]} count={items.length}>
            {g === 'guardrail' && <p className="body-sm text-text-subtle">خط قرمز را نمی‌شود از بسته برداشت (برداشتنش یعنی خط قرمزی نیست). برای عوض‌کردن اینکه کجا بیاید، خود خط قرمز را باز کن و «محدودهٔ اثر» را عوض کن.</p>}
            <ul className="flex flex-col gap-stack-xs" aria-label={GROUP_FA[g]}>
              {items.map((i, n) => (
                <li key={`${i.id ?? 'spec'}-${n}`} className="flex flex-wrap items-start justify-between gap-inline-sm rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-sm">
                  <span className="flex min-w-space-0 flex-1 flex-col gap-stack-xs">
                    <span className="body-sm text-text-default">{i.title}</span>
                    <span className="caption text-text-subtle" data-testid="explain-from">{i.from}{i.note ? ` · ${i.note}` : ''}</span>
                  </span>
                  {i.editable && i.id && onOpenObject && <Button size="sm" variant="ghost" iconStart="Pencil" aria-label={`ببین یا ویرایش خط قرمز «${i.title}»`} onClick={() => onOpenObject(i.id!)}>ببین و ویرایش</Button>}
                </li>
              ))}
            </ul>
          </ClosedSection>
        </div>
      ))}
      {left.length > 0 && (
        <div data-testid="explain-skipped">
          <ClosedSection title="چه نیامد و چرا" count={explain.skipped.length}>
            <div className="flex flex-col gap-stack-md">
              {left.map(([reason, list]) => (
                <section key={reason} aria-label={LEFT_REASON_FA[reason]} className="flex flex-col gap-stack-xs">
                  <h4 className="label-md text-text-default">{LEFT_REASON_FA[reason]} <Badge intent="neutral" icon={false}>{formatNumber(list.length)}</Badge></h4>
                  <ul className="flex flex-col gap-stack-xs">
                    {list.slice(0, shown).map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-inline-sm">
                        <span className="flex min-w-space-0 flex-1 flex-col"><span className="body-sm text-text-default">{l.title}</span><span className="caption text-text-subtle">{l.why}</span></span>
                        {l.canAdd && onAdd && <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => onAdd(l.id)}>افزودن</Button>}
                      </li>
                    ))}
                  </ul>
                  {list.length > shown && <p className="caption text-text-subtle">و {formatNumber(list.length - shown)} مورد دیگر</p>}
                </section>
              ))}
            </div>
          </ClosedSection>
        </div>
      )}
    </div>
  );
};
