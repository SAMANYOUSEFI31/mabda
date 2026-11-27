import React, { useId, useMemo, useState } from 'react';
import type { TreeNode } from '../../types';
import { flatten } from '../../core/nodeTree';
import { Dialog, FieldShell, Icon, TextField, cx, formatNumber } from '../../ui';

/**
 * Choosing a section of the tree («کدام بخش؟»). It opens as a panel at the inline-end edge on a wide screen and as a sheet on a phone
 * (Dialog `side`), not as a dropdown: the tree is long (34 sections in the full sample), its levels are what tells two sections apart,
 * and a dropdown showed them as em-spaces in a system list with no search (NN/g: past ~15 options a list with search beats a
 * dropdown; Hick: search turns a scan into a type). Each row is a full-width touch target with its real indent (main sections in
 * the label weight, like a sidebar's groups), the current one is marked with a check, and a search shows each match with its path, so two sections with the same name are still told apart.
 * docs/ux/research/headers-trees-persian-type.md «انتخاب‌گرها».
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
  /** a small note under the title */
  description?: string;
  /** a word after a section's name, e.g. «الان» for where the thing lives now */
  marks?: Record<string, string>;
}

export function NodePicker({ open, onClose, title, nodes, value, onPick, extra = [], disabledIds, description, marks }: NodePickerProps) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => flatten(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pathOf = (n: TreeNode) => { const out: string[] = []; for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) out.unshift(p.label); return out.join(' › '); };
  const needle = q.trim();
  const shown = needle ? rows.filter(({ node }) => node.label.includes(needle) || node.description?.includes(needle)) : rows;
  const pick = (v: string) => { onPick(v); setQ(''); onClose(); };
  const row = 'flex min-h-touch w-full items-center gap-inline-sm rounded-control-sm px-inset-sm text-start hover:bg-interaction-hover focus-visible:bg-interaction-hover disabled:cursor-not-allowed disabled:text-text-disabled';
  return (
    <Dialog open={open} onClose={() => { setQ(''); onClose(); }} side size="md" personal title={title} description={description}>
      <div className="flex flex-col gap-stack-md">
        {rows.length > 7 && <TextField label="جستجوی بخش" iconStart="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام بخش" autoComplete="off" />}
        <ul className="flex flex-col" aria-label={title}>
          {!needle && extra.map((o) => (
            <li key={`x-${o.value}`}>
              <button type="button" data-value={o.value} className={row} aria-current={o.value === value || undefined} onClick={() => pick(o.value)}>
                <span className="flex-1 label-lg text-text-default">{o.label}</span>
                {o.value === value && <Icon name="Check" size="md" className="text-icon-default" />}
              </button>
            </li>
          ))}
          {!needle && extra.length > 0 && <li aria-hidden="true" className="my-stack-xs border-b border-border-subtle" />}
          {shown.map(({ node, depth }) => {
            const on = node.id === value;
            const path = needle ? pathOf(node) : '';
            return (
              <li key={node.id}>
                <button type="button" data-value={node.id} className={row} aria-current={on || undefined} disabled={disabledIds?.has(node.id)} onClick={() => pick(node.id)}
                  style={needle ? undefined : { paddingInlineStart: `calc(var(--inset-sm) + ${depth} * var(--space-6))` }}>
                  <span className="flex min-w-space-0 flex-1 flex-col">
                    <span className={cx(!needle && depth === 0 ? 'label-lg' : 'body-md', 'text-text-default')}>{node.label}{marks?.[node.id] && <span className="body-sm font-normal text-text-subtle"> ({marks[node.id]})</span>}</span>
                    {path && <span className="body-sm text-text-subtle">{path}</span>}
                  </span>
                  {on && <Icon name="Check" size="md" className="text-icon-default" />}
                </button>
              </li>
            );
          })}
          {needle && shown.length === 0 && <li className="body-md px-inset-sm py-stack-sm text-text-subtle">بخشی با «{needle}» نیست.</li>}
        </ul>
        {needle && <p className="body-sm text-text-subtle" aria-live="polite">{formatNumber(shown.length)} بخش</p>}
      </div>
    </Dialog>
  );
}

/** the field that opens it: looks and labels like a Select, so a form reads the same with either */
export function NodePickerField({ label, hint, nodes, value, onChange, extra = [], disabledIds, placeholder = 'انتخاب بخش', className, marks }: {
  label: string; hint?: string; nodes: TreeNode[]; value: string; onChange: (value: string) => void; extra?: NodePickerOption[]; disabledIds?: Set<string>; placeholder?: string; className?: string; marks?: Record<string, string>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const current = extra.find((o) => o.value === value)?.label ?? nodes.find((n) => n.id === value)?.label;
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <span className="mb-select">
        <button id={id} type="button" aria-haspopup="dialog" aria-describedby={hint ? `${id}-hint` : undefined}
          className={cx('mb-field__input mb-select__input body-md text-start', !current && 'text-text-subtlest')} onClick={() => setOpen(true)}>
          {current ?? placeholder}
        </button>
        <Icon name="ChevronDown" size="md" className="mb-select__chev" />
      </span>
      <NodePicker open={open} onClose={() => setOpen(false)} title={label} nodes={nodes} value={value} onPick={onChange} extra={extra} disabledIds={disabledIds} marks={marks} />
    </FieldShell>
  );
}
