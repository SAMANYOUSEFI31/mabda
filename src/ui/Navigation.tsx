import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import { Icon, useBecame } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { formatNumber } from './format.ts';
import { UI_WORDS, UiText } from './privacy.tsx';

const isRtl = (el: HTMLElement | null) => (el ? getComputedStyle(el).direction : document.documentElement.dir) === 'rtl';

/* ---------------- Tabs ---------------- */
export interface TabItem { id: string; label: ReactNode; disabled?: boolean }
export interface TabsProps {
  items: TabItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void;
  label?: string; fullWidth?: boolean; renderPanel?: (id: string) => ReactNode; className?: string;
  /** the tab labels can be a person's words (their sections): they stay masked in a session replay (privacy.tsx) */
  personal?: boolean;
}

export function Tabs({ items, value, defaultValue, onChange, label = 'بخش‌ها', fullWidth = false, className, renderPanel, personal = false }: TabsProps) {
  const [inner, setInner] = useState(defaultValue || items[0]?.id);
  const current = value !== undefined ? value : inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const list = useRef<HTMLDivElement>(null);
  const uid = useId();
  // the chosen tab's mark slides to the new one (motion.md «تب و کنترل تکه‌ای»); the panel itself changes without motion
  const tabGlide = useNavGlide<HTMLDivElement>(':scope > [aria-selected=true]', ['aria-selected'], 'mb-tab-glide');
  const listRef = useCallback((n: HTMLDivElement | null) => { list.current = n; tabGlide.ref(n); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    <div className={cx('mb-tabs-wrap', className)}>
      <div role="tablist" aria-label={label} ref={listRef} className={cx('mb-tabs', 'mb-tab-glided', fullWidth && 'mb-tabs--full')}>
        {tabGlide.glide}
        {items.map((it, i) => (
          <button
            key={it.id} ref={(n) => { refs.current[it.id] = n; }} role="tab" type="button" id={`${uid}-t-${it.id}`}
            aria-selected={current === it.id} aria-controls={renderPanel ? `${uid}-p-${it.id}` : undefined}
            tabIndex={current === it.id ? 0 : -1} disabled={it.disabled} className="mb-tab label-md"
            onClick={() => pick(it.id)} onKeyDown={(e) => onKey(e, i)} title={typeof it.label === 'string' ? it.label : undefined}
          ><span className="mb-tab__label"><UiText personal={personal}>{it.label}</UiText></span></button>
        ))}
      </div>
      {renderPanel && (
        <div role="tabpanel" id={`${uid}-p-${current}`} aria-labelledby={`${uid}-t-${current}`} className="mb-tabpanel body-sm" tabIndex={0}>
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
  label: string; fullWidth?: boolean | 'phone'; className?: string;
  /** the choices can be a person's words: they stay masked in a session replay (privacy.tsx) */
  personal?: boolean;
}

export function SegmentedControl({ items, value, defaultValue, onChange, label, fullWidth = false, className, personal = false }: SegmentedControlProps) {
  const [inner, setInner] = useState(defaultValue !== undefined ? defaultValue : items[0]?.id);
  // a controlled choice shows at once (the key starts its glide on the press), while what it changes may still be on its way
  // (a view built in a transition, src/ui/pageTransition.ts); once the value arrives, or anything else changes it, the value rules.
  // Local state: the press re-renders only this control, never the page under it
  const [asked, setAsked] = useState<{ id: string; from: string | undefined } | null>(null);
  const waiting = value !== undefined && !!asked && asked.from === value; // what was pressed has not arrived yet
  const current = waiting ? asked!.id : value !== undefined ? value : inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const root = useRef<HTMLDivElement>(null);
  // the raised key slides from the old choice to the new one (motion.md «تب و کنترل تکه‌ای»: base, ease-standard)
  const segGlide = useNavGlide<HTMLDivElement>(':scope > [aria-checked=true]', ['aria-checked'], 'mb-tab-glide');
  const rootRef = useCallback((n: HTMLDivElement | null) => { root.current = n; segGlide.ref(n); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (id: string) => { setInner(id); if (value !== undefined && id !== value) setAsked({ id, from: value }); onChange?.(id); };
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
    <div role="radiogroup" aria-label={label} ref={rootRef} data-pending={waiting || undefined} className={cx('mb-tabs', 'mb-seg', 'mb-tab-glided', fullWidth === 'phone' ? 'mb-tabs--full-phone' : fullWidth && 'mb-tabs--full', className)}>
      {segGlide.glide}
      {items.map((it, i) => (
        <button
          key={it.id} ref={(n) => { refs.current[it.id] = n; }} type="button" role="radio" aria-checked={current === it.id}
          tabIndex={current === it.id ? 0 : -1} disabled={it.disabled} className="mb-tab label-md"
          onClick={() => pick(it.id)} onKeyDown={(e) => onKey(e, i)}
        >
          {it.icon && <Icon name={it.icon} size="sm" />}
          <span className="mb-tab__label"><UiText personal={personal}>{it.label}</UiText></span>
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
  // a table that fits its width is not a sideways scroller: then its column names can stick under the app's bars while a long
  // table scrolls by (layout.md «چه چیزی بالا می‌ماند»). One that scrolls sideways keeps its own scroller and its names scroll away.
  const wrap = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(false);
  useEffect(() => {
    const el = wrap.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const table = el.firstElementChild as HTMLElement | null;
    const on = () => setFit((table?.offsetWidth ?? Infinity) <= el.clientWidth + 1);
    const ro = new ResizeObserver(on); ro.observe(el); if (table) ro.observe(table); on();
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrap} data-fit={fit || undefined} className={cx('mb-table-wrap', className)} role="region" aria-label={caption} tabIndex={0}>
      <table className="mb-table">
        {caption && <caption className="mb-table__caption label-md">{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('label-sm', c.numeric && 'is-num')}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty && <tr><td colSpan={columns.length} className="mb-table__empty">{empty}</td></tr>}
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
  return <ul role="list" aria-label={label} className={cx('mb-list', className)}>{children}</ul>;
}

export interface ListItemProps {
  title: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode; chevron?: boolean;
  href?: string; onClick?: () => void; selected?: boolean; disabled?: boolean; className?: string;
}

export function ListItem({ leading, title, description, trailing, chevron = false, href, onClick, selected, disabled = false, className }: ListItemProps) {
  const inner = (
    <>
      {leading && <span className="mb-li__lead">{leading}</span>}
      <span className="mb-li__text">
        <span className="mb-li__title body-md">{title}</span>
        {description && <span className="mb-li__desc body-sm">{description}</span>}
      </span>
      {trailing && <span className="mb-li__trail">{trailing}</span>}
      {chevron && <Icon name="ChevronLeft" size="md" className="mb-li__chev mb-flip" />}
    </>
  );
  let row: ReactNode;
  if (href && !disabled) row = <a href={href} className="mb-li__row" aria-current={selected ? 'page' : undefined}>{inner}</a>;
  else if (onClick) row = <button type="button" className="mb-li__row" disabled={disabled} aria-current={selected ? 'true' : undefined} onClick={onClick}>{inner}</button>;
  else row = <div className="mb-li__row">{inner}</div>;
  return <li className={cx('mb-li', (href || onClick) && 'is-interactive', selected && 'is-selected', disabled && 'is-disabled', className)}>{row}</li>;
}

/* ---------------- BottomNav (mobile primary navigation) ---------------- */
/** action: an item that does something (opens a dialog) instead of being a destination; it is never «current» */
export interface BottomNavItem { id: string; label: ReactNode; icon: IconName; badge?: number; badgeLabel?: string; action?: boolean; testId?: string }
export interface BottomNavProps {
  items: BottomNavItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void;
  label?: string; fixed?: boolean; className?: string;
  /** content passes under the bar: «کاغذ کالک» (shape-elevation.md); opaque otherwise */
  under?: boolean;
}

export function BottomNav({ items, value, defaultValue, onChange, label = 'ناوبری اصلی', fixed = false, className, under = false }: BottomNavProps) {
  const [inner, setInner] = useState(defaultValue || items[0]?.id);
  const current = value !== undefined ? value : inner;
  return (
    <nav aria-label={label} data-under={under || undefined} data-pin={fixed ? 'app-bottom' : undefined} className={cx('mb-bottomnav', 'mb-glass', fixed && 'is-fixed', className)}>
      {items.map((it) => <BottomNavButton key={it.id} it={it} current={!it.action && current === it.id} onPress={() => { if (!it.action) setInner(it.id); onChange?.(it.id); }} />)}
    </nav>
  );
}

/** one bar button: when it becomes the current place its icon's ink is written in once (motion.md «آیکن و نشان») */
function BottomNavButton({ it, current, onPress }: { it: BottomNavItem; current: boolean; onPress: () => void }) {
  const ink = useBecame(current);
  const badgeTurn = useTurns(it.badge ?? 0);
  return (
    <button
      type="button" aria-current={current ? 'page' : undefined} data-ink={ink || undefined} data-testid={it.testId}
      className={cx('mb-bottomnav__item', current && 'is-active', it.action && 'is-action')}
      onClick={onPress}
    >
      <span className="mb-bottomnav__icon">
        <Icon name={it.icon} size="xl" className="mb-nav-ico" />
        {it.badge ? (
          <>
            {/* a count that changed while you look takes a short pop (motion.md «آیکن و نشان»); the first one is just there */}
            <span key={badgeTurn} className="mb-bottomnav__badge label-sm" data-changed={badgeTurn > 0 || undefined} aria-hidden="true">{it.badge > 99 ? `${formatNumber(99)}+` : formatNumber(it.badge)}</span>
            <span className="mb-sr">{formatNumber(it.badge)} {it.badgeLabel || 'مورد تازه'}</span>
          </>
        ) : null}
      </span>
      {/* the drawn label may carry a break point at a ZWNJ, which a screen reader would read as a gap: it hears the plain word */}
      {typeof it.label === 'string' && !it.action && it.label.includes('\u200c')
        ? <><span className="mb-bottomnav__label" data-label={it.label} aria-hidden="true" {...UI_WORDS}>{softBreaks(it.label)}</span><span className="mb-sr">{it.label}</span></>
        : <span className={it.action ? 'mb-sr' : 'mb-bottomnav__label'} data-label={typeof it.label === 'string' ? it.label : undefined}><UiText>{it.label}</UiText></span>}
    </button>
  );
}

/** how many times `value` changed since the first render (0 = never): a key that replays a one-time movement on each change */
function useTurns(value: unknown): number {
  const prev = useRef(value);
  const [turns, setTurns] = useState(0);
  useEffect(() => { if (!Object.is(prev.current, value)) { prev.current = value; setTurns((n) => n + 1); } }, [value]);
  return turns;
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
  /** accordion parent: true while its sub-menu is open */
  expanded?: boolean;
  onClick?: () => void;
  /** icon-only (the collapsed sidebar): the label stays as aria-label and tooltip */
  compact?: boolean;
  className?: string;
  /** the label can be a person's words (a section's name): it stays masked in a session replay (privacy.tsx) */
  personal?: boolean;
}

/** a narrow label (the phone bar at 200% text) may break where Persian joins a suffix with a ZWNJ («خروجی‌|ها»), never inside a letter run */
const softBreaks = (t: string): ReactNode => (t.includes('\u200c') ? t.split('\u200c').flatMap((part, i) => (i ? [<Fragment key={i}>{'\u200c'}<wbr /></Fragment>, part] : [part])) : t);

export function NavItem({ label, icon, trailing, selected, expanded, nested = false, compact = false, onClick, className, personal = false }: NavItemProps) {
  const ink = useBecame(Boolean(selected));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'page' : undefined}
      data-ink={ink || undefined}
      aria-expanded={expanded}
      {...(compact ? { 'aria-label': trailing != null ? `${label}، ${trailing}` : String(label), title: String(label) } : {})}
      className={cx(
        'relative flex w-full min-h-touch items-center gap-inline-md rounded-control px-inset-md py-inset-xs text-start transition-colors',
        compact && 'justify-center px-inset-xs',
        nested ? 'body-sm' : 'label-md',
        selected
          ? 'mb-nav-current bg-bg-selected font-semibold text-text-default'
          : 'text-text-subtle hover:bg-interaction-hover hover:text-text-default active:bg-interaction-pressed',
        className,
      )}
    >
      {/* weight 1.75 → 2.25 when current (iconography.md), as a transition: the ink soaks in rather than snapping */}
      {icon && <Icon name={icon} size="lg" className={cx('mb-nav-ico', selected ? 'text-icon-default' : 'text-icon-subtle')} />}
      {compact ? (trailing != null && <span aria-hidden="true" className="absolute end-space-2 top-space-2 rounded-pill bg-bg-neutral-bold" style={{ inlineSize: 8, blockSize: 8 }} />) : (<>
        {/* the 600 copy reserves its width so the label never jumps when selected (navigation.md) */}
        <span className="mb-navlabel min-w-space-0 flex-1 break-words" data-label={typeof label === 'string' ? label : undefined}><UiText personal={personal}>{label}</UiText></span>
        {trailing != null && <span className="caption shrink-0 tabular-nums text-text-subtle">{trailing}</span>}
      </>)}
    </button>
  );
}

/* ---------------- Breadcrumb ---------------- */
export function Breadcrumb({ items, label = 'مسیر صفحه', className }: { items: Array<{ label: ReactNode; href?: string }>; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx('mb-crumbs', className)}>
      <ol>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i}>
              {last ? <span className="mb-crumbs__cur body-sm" aria-current="page">{it.label}</span>
                : it.href ? <a className="mb-crumbs__link body-sm" href={it.href}>{it.label}</a>
                : <span className="mb-crumbs__link body-sm">{it.label}</span>}
              {!last && <Icon name="ChevronLeft" size="sm" className="mb-crumbs__sep mb-flip" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The sidebar's «you are here» glides from the old place to the new one (motion.md «نشانگر ناوبری»: the same rule as a tab's
 * indicator — base, ease-standard, transform only). One fill moves; the items do not. It follows the direct children of the nav
 * that carry aria-current (the top places); a nested place (a section of «منبع») keeps its own still fill and the glide fades.
 * Reduced motion: the duration tokens make it a short fade-free jump (components.css). Forced colours: hidden, the item's own
 * Highlight shows.
 */
export function useNavGlide<T extends HTMLElement>(
  /** which child is chosen: the top places of a nav by default; a tab bar or segmented control passes its own (motion.md «تب و کنترل تکه‌ای») */
  current = ':scope > [aria-current=page]', attrs: string[] = ['aria-current'], className = 'mb-nav-glide',
) {
  // callback refs: the sidebar and the rail mount and unmount as the width changes, so the glide is set up per element
  const [nav, ref] = useState<T | null>(null);
  const [g, glideRef] = useState<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    if (!nav || !g) return;
    const place = () => {
      const cur = nav.querySelector<HTMLElement>(current);
      if (!cur) { g.style.opacity = '0'; return; }
      // measured from the boxes (not offsetLeft): a scroll bar on the start or end side would otherwise shift it
      const rtl = getComputedStyle(nav).direction === 'rtl';
      const n = nav.getBoundingClientRect(); const c = cur.getBoundingClientRect();
      const edge = parseFloat(getComputedStyle(nav).borderInlineStartWidth) || 0;
      const start = rtl ? (n.x + n.width) - edge - (c.x + c.width) : c.x - n.x - edge;
      g.style.opacity = '1';
      g.style.inlineSize = `${c.width}px`;
      g.style.blockSize = `${c.height}px`;
      g.style.transform = `translate(${rtl ? -start : start}px, ${c.top - n.top - nav.clientTop + nav.scrollTop}px)`;
    };
    place();
    // the first place is set still; only a change of place moves
    const raf = requestAnimationFrame(() => { g.dataset.ready = 'true'; });
    const ro = new ResizeObserver(place); ro.observe(nav);
    const mo = new MutationObserver(place); mo.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: attrs });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); };
  }, [nav, g]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ref, glide: <span ref={glideRef} aria-hidden="true" className={className} /> };
}
