import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TreeNode } from '../../types';
import { ancestorIds, flatten } from '../../core/nodeTree';
import { persianFold } from '../../core/persianFold';
import { AnchoredPanel, Dialog, FieldShell, Icon, TextField, cx, formatNumber } from '../../ui';

/**
 * Choosing a section of the tree («کدام بخش؟»). The question is the same in every form, so it has one shape everywhere:
 * - Wide screen: a panel held against the field (GitHub's branch picker, Linear's property pickers). The dialog being edited
 *   stays in view and the answer appears next to the question (Gestalt proximity), instead of a 640px panel over half of it.
 * - Phone: a sheet (Dialog `side`), since a held panel on 390px would be a cramped dropdown with no room for a 34-section tree.
 * Not a native dropdown: the tree is long, its levels tell two sections apart, and past ~15 options a list with search beats a
 * dropdown (NN/g; Hick: search turns a scan into a type).
 * Each row is a full-width touch target with its real indent (main sections in the label weight). It is a tree for assistive
 * technology (role tree, aria-level, aria-selected): ↑↓ Home End move, Enter picks, typing goes to the search. A search
 * folds Persian keyboard variants (ي/ی، ك/ک، نیم‌فاصله) and shows each match with its path. A section that may not be
 * chosen looks it and says why. docs/ux/research/headers-trees-persian-type.md «انتخاب‌گرها».
 */
export interface NodePickerOption { value: string; label: string }

export interface NodePickerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  nodes: TreeNode[];
  value: string;
  onPick: (value: string) => void;
  /** choices above the tree that are not a section («همهٔ بخش‌ها»، «بخش اصلی»، «همه‌جا») */
  extra?: NodePickerOption[];
  /** a section that may not be chosen (moving a section under itself) */
  disabledIds?: Set<string>;
  /** why those sections may not be chosen, shown beside each of them */
  disabledReason?: string;
  /** a small note under the title */
  description?: string;
  /** a word after a section's name, e.g. «الان» for where the thing lives now */
  marks?: Record<string, string>;
  /** the control that opened it: on a wide screen the panel is held against it */
  anchor?: React.RefObject<HTMLElement | null>;
}

const fold = (s: string) => persianFold(s).replace(/\s+/g, ' ').trim();
const WIDE = '(min-width: 768px)';

interface Row { value: string; label: string; depth: number; path: string; disabled: boolean; mark?: string; extra: boolean; kids: boolean; open: boolean }
/** a tree this short is shown whole: folding it would only add taps (every level fits on one screen) */
const FOLD_FROM = 16;

function PickerBody({ title, nodes, value, onPick, extra = [], disabledIds, disabledReason, marks, description, inPanel }: Omit<NodePickerProps, 'open' | 'onClose' | 'anchor'> & { inPanel: boolean }) {
  const id = useId();
  const [q, setQ] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const search = { get current() { return document.getElementById(`${id}-q`) as HTMLInputElement | null; } };
  const flat = useMemo(() => flatten(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pathOf = (n: TreeNode) => { const out: string[] = []; for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) out.unshift(p.label); return out.join(' › '); };
  const needle = fold(q);
  const parents = useMemo(() => new Set(nodes.map((n) => n.parentId).filter(Boolean) as string[]), [nodes]);
  // a long tree opens folded to its main sections, with only the way to the current one unfolded (Finder, VS Code «reveal»):
  // the main sections fit one screen, the current answer is in view with its context, and a search still reaches every level
  const folds = flat.length >= FOLD_FROM;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(value ? ancestorIds(nodes, value) : []));
  const toggle = (v: string, to?: boolean) => setExpanded((e) => { const n = new Set(e); if (to ?? !n.has(v)) n.add(v); else n.delete(v); return n; });
  const visible = (n: TreeNode) => { for (let p = n.parentId; p; p = byId.get(p)?.parentId) if (!expanded.has(p)) return false; return true; };
  const rows: Row[] = [
    ...(needle ? [] : extra.map((o) => ({ value: o.value, label: o.label, depth: 0, path: '', disabled: false, extra: true, kids: false, open: false }))),
    ...flat
      .filter(({ node }) => needle ? fold(node.label).includes(needle) || (node.description ? fold(node.description).includes(needle) : false) : !folds || visible(node))
      .map(({ node, depth }) => {
        const disabled = !!disabledIds?.has(node.id);
        return { value: node.id, label: node.label, depth, path: needle ? pathOf(node) : '', disabled, mark: disabled ? disabledReason ?? marks?.[node.id] : marks?.[node.id], extra: false, kids: !needle && folds && parents.has(node.id), open: expanded.has(node.id) };
      }),
  ];
  const hasSearch = flat.length > 7;
  const current = Math.max(0, rows.findIndex((r) => r.value === value));
  const [active, setActive] = useState(current);
  useEffect(() => { setActive(needle ? 0 : current); }, [needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const optionId = (i: number) => `${id}-o${i}`;
  // phone sheet: as tall as its content (up to the top of the screen, then it scrolls inside), and never shorter than it has been
  // while open, so a search that narrows the list does not drop the search field from under the finger
  useLayoutEffect(() => {
    const d = inPanel ? null : list.current?.closest<HTMLElement>('.mb-dialog');
    if (d && window.matchMedia('(max-width: 767px)').matches) d.style.minBlockSize = `${Math.max(parseFloat(d.style.minBlockSize) || 0, d.offsetHeight)}px`;
  });
  useEffect(() => { const d = list.current?.closest<HTMLElement>('.mb-dialog'); return () => { if (d) d.style.minBlockSize = ''; }; }, []);
  const focusRow = (i: number) => { const n = Math.max(0, Math.min(rows.length - 1, i)); setActive(n); document.getElementById(optionId(n))?.focus(); };

  // on open: the search (typing is the fastest way to a section in a long tree), else the current section; the current one is
  // brought into view either way. After the dialog's own first focus, which runs after this child's effect.
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      document.getElementById(optionId(current))?.scrollIntoView({ block: 'center' });
      if (hasSearch) search.current?.focus(); else document.getElementById(optionId(current))?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (r: Row) => { if (!r.disabled) onPick(r.value); };
  const onListKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); focusRow(active + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); if (active === 0 && hasSearch) search.current?.focus(); else focusRow(active - 1); }
    else if (k === 'Home') { e.preventDefault(); focusRow(0); }
    else if (k === 'End') { e.preventDefault(); focusRow(rows.length - 1); }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && rows[active]?.kids) {
      // the tree pattern's open/close, mirrored for RTL: the key that points «forward» (left in Persian) opens
      e.preventDefault();
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      toggle(rows[active].value, (k === 'ArrowLeft') === rtl);
    }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); const r = rows[active]; if (r) choose(r); }
    else if (hasSearch && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { search.current?.focus(); }
  };
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); focusRow(needle ? 0 : current); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows.find((x) => !x.disabled); if (needle && r) choose(r); }
  };

  return (
    <div className={cx('flex flex-col gap-stack-sm', inPanel ? 'mb-nodepicker--panel' : 'mb-nodepicker--sheet')}>
      {inPanel && description && <p className="body-sm text-text-subtle">{description}</p>}
      {hasSearch && (
        <div className={cx(inPanel && 'mb-nodepicker__search')}>
          <TextField id={`${id}-q`} label="جستجوی بخش" iconStart="Search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="نام بخش" autoComplete="off"
            aria-controls={`${id}-tree`} />
        </div>
      )}
      <div id={`${id}-tree`} ref={list} role="tree" aria-label={title} className="mb-nodepicker__tree" onKeyDown={onListKey}>
        {rows.map((r, i) => {
          const on = r.value === value;
          const divider = !needle && r.extra && !rows[i + 1]?.extra;
          return (
            <React.Fragment key={`${r.extra ? 'x' : 'n'}-${r.value}`}>
              <div id={optionId(i)} role="treeitem" aria-level={r.extra || needle ? 1 : r.depth + 1} aria-selected={on} aria-disabled={r.disabled || undefined} aria-expanded={r.kids ? r.open : undefined}
                tabIndex={i === active ? 0 : -1} data-value={r.value} onClick={() => choose(r)} onFocus={() => setActive(i)}
                className={cx('mb-nodepicker__row', r.path && 'has-path', r.disabled && 'is-disabled', on && 'is-current')}
                style={needle || r.extra ? undefined : { paddingInlineStart: `calc(var(--inset-sm) + ${r.depth} * var(--space-6))` }}>
                {folds && !needle && !r.extra && (r.kids
                  ? <span className="mb-nodepicker__twisty" aria-hidden="true" onClick={(e) => { e.stopPropagation(); toggle(r.value); }}><Icon name={r.open ? 'ChevronDown' : 'ChevronLeft'} size="md" /></span>
                  : <span className="mb-nodepicker__twisty" aria-hidden="true" />)}
                <span className="flex min-w-space-0 flex-1 flex-col">
                  <span className={cx(!needle && r.depth === 0 ? 'label-lg' : 'body-md', r.disabled ? 'text-text-disabled' : 'text-text-default')}>
                    {r.label}{r.mark && <span className={cx('body-sm font-normal', r.disabled ? 'text-text-disabled' : 'text-text-subtle')}> ({r.mark})</span>}
                  </span>
                  {r.path && <span className="body-sm text-text-subtle">{r.path}</span>}
                </span>
                {on && <Icon name="Check" size="md" className="text-icon-default" />}
              </div>
              {divider && <div role="none" aria-hidden="true" className="my-stack-xs border-b border-border-subtle" />}
            </React.Fragment>
          );
        })}
        {needle && rows.length === 0 && <p className="body-md px-inset-sm py-stack-sm text-text-subtle">بخشی با «{q.trim()}» نیست.</p>}
      </div>
      {needle && <p className="body-sm text-text-subtle" aria-live="polite">{formatNumber(rows.length)} بخش</p>}
    </div>
  );
}

export function NodePicker({ open, onClose, anchor, title, description, ...body }: NodePickerProps) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE).matches);
  useEffect(() => { if (open) setWide(window.matchMedia(WIDE).matches); }, [open]);
  const pick = (v: string) => { body.onPick(v); onClose(); anchor?.current?.focus(); };
  if (anchor && wide) {
    return (
      <AnchoredPanel anchor={anchor} open={open} onClose={onClose} label={title} className="mb-nodepicker">
        {open && <PickerBody {...body} title={title} description={description} onPick={pick} inPanel />}
      </AnchoredPanel>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} side size="md" personal title={title} description={description}>
      {open && <PickerBody {...body} title={title} onPick={pick} inPanel={false} />}
    </Dialog>
  );
}

/** the field that opens it: looks like a Select, and its name says both the question and the answer («کجا برود؟، کار») */
export function NodePickerField({ label, hint, nodes, value, onChange, extra = [], disabledIds, disabledReason, placeholder = 'انتخاب بخش', className, marks, disabled }: {
  label: string; hint?: string; nodes: TreeNode[]; value: string; onChange: (value: string) => void; extra?: NodePickerOption[]; disabledIds?: Set<string>; disabledReason?: string; placeholder?: string; className?: string; marks?: Record<string, string>; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const current = extra.find((o) => o.value === value)?.label ?? nodes.find((n) => n.id === value)?.label;
  return (
    <FieldShell id={id} label={label} hint={hint} className={className} disabled={disabled}>
      <span className="mb-select">
        <button ref={btn} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
          aria-label={`${label}، ${current ?? placeholder}`} aria-describedby={hint ? `${id}-hint` : undefined}
          className={cx('mb-field__input mb-select__input body-md text-start', !current && 'text-text-subtlest')} onClick={() => setOpen((o) => !o)}>
          {current ?? placeholder}
        </button>
        <Icon name="ChevronDown" size="md" className="mb-select__chev" />
      </span>
      <NodePicker open={open} onClose={() => setOpen(false)} anchor={btn} title={label} nodes={nodes} value={value} onPick={onChange} extra={extra} disabledIds={disabledIds} disabledReason={disabledReason} marks={marks} />
    </FieldShell>
  );
}
