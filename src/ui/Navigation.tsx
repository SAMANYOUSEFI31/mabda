import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { formatNumber } from './format.ts';

const isRtl = (el: HTMLElement | null) => (el ? getComputedStyle(el).direction : document.documentElement.dir) === 'rtl';

/* ---------------- Tabs ---------------- */
export interface TabItem { id: string; label: ReactNode; disabled?: boolean }
export interface TabsProps {
  items: TabItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void;
  label?: string; fullWidth?: boolean; renderPanel?: (id: string) => ReactNode; className?: string;
}

export function Tabs({ items, value, defaultValue, onChange, label = 'بخش‌ها', fullWidth = false, className, renderPanel }: TabsProps) {
  const [inner, setInner] = useState(defaultValue || items[0]?.id);
  const current = value !== undefined ? value : inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const list = useRef<HTMLDivElement>(null);
  const uid = useId();
  const pick = (id: string) => { setInner(id); onChange?.(id); };
  const onKey = (e: React.KeyboardEvent, index: number) => {
    const rtl = isRtl(list.current);
    const delta = ({ ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, Home: -Infinity, End: Infinity } as Record<string, number>)[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const enabled = items.filter((i) => !i.disabled);
    let at = enabled.findIndex((i) => i.id === items[index].id);
    at = delta === -Infinity ? 0 : delta === Infinity ? enabled.length - 1 : (at + delta + enabled.length) % enabled.length;
    pick(enabled[at].id);
    refs.current[enabled[at].id]?.focus();
  };
  return (
    <div className={cx('bsh-tabs-wrap', className)}>
      <div role="tablist" aria-label={label} ref={list} className={cx('bsh-tabs', fullWidth && 'bsh-tabs--full')}>
        {items.map((it, i) => (
          <button
            key={it.id} ref={(n) => { refs.current[it.id] = n; }} role="tab" type="button" id={`${uid}-t-${it.id}`}
            aria-selected={current === it.id} aria-controls={renderPanel ? `${uid}-p-${it.id}` : undefined}
            tabIndex={current === it.id ? 0 : -1} disabled={it.disabled} className="bsh-tab label-md"
            onClick={() => pick(it.id)} onKeyDown={(e) => onKey(e, i)}
          >{it.label}</button>
        ))}
      </div>
      {renderPanel && (
        <div role="tabpanel" id={`${uid}-p-${current}`} aria-labelledby={`${uid}-t-${current}`} className="bsh-tabpanel body-sm" tabIndex={0}>
          {renderPanel(current as string)}
        </div>
      )}
    </div>
  );
}

/* ---------------- SegmentedControl ---------------- */
export interface SegmentItem { id: string; label: ReactNode; icon?: IconName; disabled?: boolean }
export interface SegmentedControlProps {
  items: SegmentItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void;
  label: string; fullWidth?: boolean; className?: string;
}

export function SegmentedControl({ items, value, defaultValue, onChange, label, fullWidth = false, className }: SegmentedControlProps) {
  const [inner, setInner] = useState(defaultValue !== undefined ? defaultValue : items[0]?.id);
  const current = value !== undefined ? value : inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const root = useRef<HTMLDivElement>(null);
  const pick = (id: string) => { setInner(id); onChange?.(id); };
  const onKey = (e: React.KeyboardEvent, index: number) => {
    const rtl = isRtl(root.current);
    const step = ({ ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const enabled = items.filter((i) => !i.disabled);
    let at = enabled.findIndex((i) => i.id === items[index].id);
    at = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : (at + step + enabled.length) % enabled.length;
    pick(enabled[at].id);
    refs.current[enabled[at].id]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} ref={root} className={cx('bsh-tabs', 'bsh-seg', fullWidth && 'bsh-tabs--full', className)}>
      {items.map((it, i) => (
        <button
          key={it.id} ref={(n) => { refs.current[it.id] = n; }} type="button" role="radio" aria-checked={current === it.id}
          tabIndex={current === it.id ? 0 : -1} disabled={it.disabled} className="bsh-tab label-md"
          onClick={() => pick(it.id)} onKeyDown={(e) => onKey(e, i)}
        >
          {it.icon && <Icon name={it.icon} size="sm" />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Table ---------------- */
export interface TableColumn<Row> { key: string; label: ReactNode; numeric?: boolean; render?: (row: Row) => ReactNode }
export interface TableProps<Row extends Record<string, unknown>> {
  caption?: string; columns: Array<TableColumn<Row>>; rows: Row[]; onRowClick?: (row: Row) => void; empty?: ReactNode; className?: string;
}

export function Table<Row extends Record<string, unknown>>({ caption, columns, rows, onRowClick, empty, className }: TableProps<Row>) {
  const clickable = Boolean(onRowClick);
  return (
    <div className={cx('bsh-table-wrap', className)} role="region" aria-label={caption} tabIndex={0}>
      <table className="bsh-table">
        {caption && <caption className="bsh-table__caption label-md">{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('label-sm', c.numeric && 'is-num')}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty && <tr><td colSpan={columns.length} className="bsh-table__empty">{empty}</td></tr>}
          {rows.map((row, i) => (
            <tr
              key={(row.id as string) || i}
              className={clickable ? 'is-clickable' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onRowClick!(row) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick!(row); } } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx('body-sm', c.numeric && 'is-num')}>{c.render ? c.render(row) : (row[c.key] as ReactNode)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- List / ListItem ---------------- */
export function List({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <ul role="list" aria-label={label} className={cx('bsh-list', className)}>{children}</ul>;
}

export interface ListItemProps {
  title: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode; chevron?: boolean;
  href?: string; onClick?: () => void; selected?: boolean; disabled?: boolean; className?: string;
}

export function ListItem({ leading, title, description, trailing, chevron = false, href, onClick, selected, disabled = false, className }: ListItemProps) {
  const inner = (
    <>
      {leading && <span className="bsh-li__lead">{leading}</span>}
      <span className="bsh-li__text">
        <span className="bsh-li__title body-md">{title}</span>
        {description && <span className="bsh-li__desc body-sm">{description}</span>}
      </span>
      {trailing && <span className="bsh-li__trail">{trailing}</span>}
      {chevron && <Icon name="ChevronLeft" size="md" className="bsh-li__chev bsh-flip" />}
    </>
  );
  let row: ReactNode;
  if (href && !disabled) row = <a href={href} className="bsh-li__row" aria-current={selected ? 'page' : undefined}>{inner}</a>;
  else if (onClick) row = <button type="button" className="bsh-li__row" disabled={disabled} aria-current={selected ? 'true' : undefined} onClick={onClick}>{inner}</button>;
  else row = <div className="bsh-li__row">{inner}</div>;
  return <li className={cx('bsh-li', (href || onClick) && 'is-interactive', selected && 'is-selected', disabled && 'is-disabled', className)}>{row}</li>;
}

/* ---------------- BottomNav (mobile primary navigation) ---------------- */
export interface BottomNavItem { id: string; label: ReactNode; icon: IconName; badge?: number; badgeLabel?: string }
export interface BottomNavProps {
  items: BottomNavItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void;
  label?: string; fixed?: boolean; className?: string;
}

export function BottomNav({ items, value, defaultValue, onChange, label = 'ناوبری اصلی', fixed = false, className }: BottomNavProps) {
  const [inner, setInner] = useState(defaultValue || items[0]?.id);
  const current = value !== undefined ? value : inner;
  return (
    <nav aria-label={label} className={cx('bsh-bottomnav', fixed && 'is-fixed', className)}>
      {items.map((it) => (
        <button
          key={it.id} type="button" aria-current={current === it.id ? 'page' : undefined}
          className={cx('bsh-bottomnav__item', current === it.id && 'is-active')}
          onClick={() => { setInner(it.id); onChange?.(it.id); }}
        >
          <span className="bsh-bottomnav__icon">
            <Icon name={it.icon} size="xl" />
            {it.badge ? (
              <>
                <span className="bsh-bottomnav__badge label-sm" aria-hidden="true">{formatNumber(it.badge)}</span>
                <span className="bsh-sr">{formatNumber(it.badge)} {it.badgeLabel || 'مورد تازه'}</span>
              </>
            ) : null}
          </span>
          <span className="label-sm">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ---------------- NavItem (sidebar / drawer row) ---------------- */
export interface NavItemProps {
  label: ReactNode;
  icon?: IconName;
  /** short metadata at the inline end (count, ratio) */
  trailing?: ReactNode;
  selected?: boolean;
  /** indented sub-item (second level) */
  nested?: boolean;
  onClick?: () => void;
  className?: string;
}

export function NavItem({ label, icon, trailing, selected, nested = false, onClick, className }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'page' : undefined}
      className={cx(
        'flex w-full min-h-touch items-center gap-inline-md rounded-control px-inset-md text-start transition-colors',
        nested ? 'body-sm' : 'label-md',
        selected
          ? 'bg-bg-selected text-text-default'
          : 'text-text-subtle hover:bg-interaction-hover hover:text-text-default active:bg-interaction-pressed',
        className,
      )}
    >
      {icon && <Icon name={icon} size="lg" className="text-icon-subtle" />}
      <span className="min-w-space-0 flex-1 truncate">{label}</span>
      {trailing != null && <span className="caption shrink-0 tabular-nums text-text-subtlest">{trailing}</span>}
    </button>
  );
}

/* ---------------- Breadcrumb ---------------- */
export function Breadcrumb({ items, label = 'مسیر صفحه', className }: { items: Array<{ label: ReactNode; href?: string }>; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx('bsh-crumbs', className)}>
      <ol>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i}>
              {last ? <span className="bsh-crumbs__cur body-sm" aria-current="page">{it.label}</span>
                : it.href ? <a className="bsh-crumbs__link body-sm" href={it.href}>{it.label}</a>
                : <span className="bsh-crumbs__link body-sm">{it.label}</span>}
              {!last && <Icon name="ChevronLeft" size="sm" className="bsh-crumbs__sep bsh-flip" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
