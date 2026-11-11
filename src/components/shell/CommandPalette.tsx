/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MORE_STEP, SEARCH_GROUP_LABEL, groupOrder, registeredCommand, searchIndex, shownCount, snippetFor } from '../../core/globalSearch';
import type { SearchHit, SearchIndex, SearchKind } from '../../core/globalSearch';
import { Dialog, Icon, formatNumber } from '../../ui';
import type { IconName } from '../../ui';

const ICON: Record<SearchHit['kind'], IconName> = { command: 'CornerDownLeft', node: 'FolderTree', object: 'BookOpen', asset: 'Package', note: 'StickyNote', thought: 'Lightbulb', file: 'FileText' };

type Row = { type: 'hit'; hit: SearchHit } | { type: 'more'; kind: SearchKind; remaining: number };

interface Props {
  open: boolean;
  index: SearchIndex;
  onClose: () => void;
  onPick: (hit: SearchHit) => void;
}

/**
 * Ctrl/⌘+K: one box for «find» and «do». Keyboard: type, ↑↓ move (Home/End jump), Enter opens, Esc closes — the focus
 * stays in the input and the highlighted row is announced through `aria-activedescendant` (combobox + listbox).
 * Results are grouped by kind, the best first, and shown progressively: each group opens with its best few and a «نمایش بیشتر»
 * row (also reachable by keyboard) reveals more — there is no fixed ceiling. A command registered from outside runs its own action.
 * Notes are found here for DISPLAY only; nothing in this palette sends text to an AI.
 */
export const CommandPalette: React.FC<Props> = (props) => (props.open ? <Palette {...props} /> : null);

const Palette: React.FC<Props> = ({ index, onClose, onPick }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const uid = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // the dialog places focus on its own after mounting; the search box takes it right after
  useEffect(() => { input.current?.focus(); const t = setTimeout(() => input.current?.focus(), 60); return () => clearTimeout(t); }, []);
  const [expanded, setExpanded] = useState<Partial<Record<SearchKind, number>>>({});
  const groups = useMemo(() => searchIndex(index, query), [index, query]);
  // the rows in the order they are shown: the visible hits of each group, then its «نمایش بیشتر» row while hits remain
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const k of groupOrder(groups)) {
      const shown = k === 'command' ? groups[k].length : shownCount(expanded[k]);
      for (const hit of groups[k].slice(0, shown)) out.push({ type: 'hit', hit });
      if (groups[k].length > shown) out.push({ type: 'more', kind: k, remaining: groups[k].length - shown });
    }
    return out;
  }, [groups, expanded]);
  const optionId = (i: number) => `${uid}-o${i}`;

  useEffect(() => { setActive(0); setExpanded({}); }, [query]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[id="${optionId(active)}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = (kind: SearchKind) => setExpanded((e) => ({ ...e, [kind]: (e[kind] ?? 0) + 1 }));
  const pick = (r?: Row) => {
    if (!r) return;
    if (r.type === 'more') { more(r.kind); return; } // the focus stays on the row; the next hits appear above it
    const own = r.hit.kind === 'command' ? registeredCommand(r.hit.id) : undefined;
    if (own?.run) own.run(); else onPick(r.hit);
    onClose();
  };
  const flat = rows;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (flat.length ? (i + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(Math.max(0, flat.length - 1)); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); pick(rows[active]); }
  };

  let n = 0;
  const snippetOf = (h: SearchHit) => h.snippet ?? (h.wantsSnippet ? snippetFor(index, query, h) : undefined);
  return (
    <Dialog open onClose={onClose} size="lg" title="جستجو و فرمان‌ها" description="هر چیزی را با چند حرف پیدا کن یا یک فرمان را اجرا کن. یادداشت‌ها فقط برای پیدا کردن‌اند و به هیچ ابزاری فرستاده نمی‌شوند.">
      <div className="flex flex-col gap-stack-md" onKeyDown={onKey}>
        <div className="flex items-center gap-inline-sm rounded-control border border-border-default bg-surface-sunken px-inset-md">
          <Icon name="Search" size="md" />
          <input
            id={`${uid}-q`} ref={input} autoFocus type="search" role="combobox" aria-expanded="true" aria-controls={`${uid}-l`} aria-autocomplete="list"
            aria-activedescendant={flat.length ? optionId(active) : undefined} aria-label="جستجو" autoComplete="off"
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="مثلاً: قیمت، لحن، ثبت دانش…"
            className="body-md min-h-touch-comfortable w-full min-w-space-0 bg-transparent text-text-default outline-none"
          />
        </div>
        <div ref={listRef} id={`${uid}-l`} role="listbox" aria-label="نتیجه‌ها" className="palette-list flex flex-col gap-stack-md">
          {flat.length === 0 && <p className="body-md text-text-subtle" role="status">{query.trim() ? 'چیزی پیدا نشد. با چند حرف دیگر امتحان کن.' : 'شروع به نوشتن کن.'}</p>}
          {groupOrder(groups).map((k) => {
            const shown = k === 'command' ? groups[k].length : shownCount(expanded[k]);
            const remaining = groups[k].length - shown;
            return (
              <div key={k} role="group" aria-label={SEARCH_GROUP_LABEL[k]} className="flex flex-col gap-stack-xs">
                <h3 className="label-sm text-text-subtle">{SEARCH_GROUP_LABEL[k]} ({formatNumber(groups[k].length)})</h3>
                {groups[k].slice(0, shown).map((h) => {
                  const i = n++;
                  const snippet = snippetOf(h);
                  return (
                    <div
                      key={`${h.kind}:${h.id}`} id={optionId(i)} role="option" aria-selected={i === active} data-kind={h.kind}
                      onMouseMove={() => setActive(i)} onClick={() => pick(rows[i])}
                      className={`flex min-h-touch cursor-pointer items-start gap-inline-sm rounded-control-sm px-inset-sm py-inset-xs ${i === active ? 'bg-bg-neutral-subtle' : ''}`}
                    >
                      <span className="mt-stack-xs text-text-subtle"><Icon name={ICON[h.kind]} size="md" /></span>
                      <span className="flex min-w-space-0 flex-1 flex-col">
                        <span className="body-md text-text-default">{h.title}</span>
                        {snippet && <span className="body-sm text-text-subtle">{snippet}</span>}
                        {h.subtitle && <span className="body-sm truncate text-text-subtle">{h.subtitle}</span>}
                      </span>
                    </div>
                  );
                })}
                {remaining > 0 && (() => {
                  const i = n++;
                  return (
                    <div
                      key={`more:${k}`} id={optionId(i)} role="option" aria-selected={i === active} data-kind="more" data-group={k}
                      onMouseMove={() => setActive(i)} onClick={() => pick(rows[i])}
                      className={`body-sm flex min-h-touch cursor-pointer items-center gap-inline-sm rounded-control-sm px-inset-sm py-inset-xs text-text-subtle ${i === active ? 'bg-bg-neutral-subtle' : ''}`}
                    >
                      <Icon name="ChevronDown" size="md" />
                      <span>نمایش بیشتر در «{SEARCH_GROUP_LABEL[k]}» ({formatNumber(Math.min(MORE_STEP, remaining))} از {formatNumber(remaining)} مورد دیگر)</span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        <p className="kbd-hint body-sm text-text-subtle">↑ ↓ برای حرکت · Enter برای باز کردن (یا نمایش بیشتر) · Esc برای بستن</p>
      </div>
    </Dialog>
  );
};
