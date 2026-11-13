import { cloneElement, createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from './presence.ts';
import { cx } from './cx.ts';
import { Icon, STATUS_ICON } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { Button, IconButton } from './Button.tsx';
import type { StatusIntent } from './Display.tsx';

/* ---------------- Dialog ---------------- */
export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** render in place instead of a portal (docs/previews) */
  inline?: boolean;
  /** destructive confirmation: role=alertdialog, scrim click does not close */
  alert?: boolean;
  /** side panel (full-height, anchored to the inline-end edge on wide screens; a bottom sheet on phones) */
  side?: boolean;
  /** the form has unsaved changes: scrim, Esc and × first ask «تغییرها دور ریخته شود؟» (overlays.md «رفتار») */
  dirty?: boolean;
  /** search and commands: pinned 12% from the top so the list grows downward without the box moving (overlays.md) */
  top?: boolean;
  /** «دور بریز» was chosen: the caller drops the draft it keeps (called before onClose) */
  onDiscard?: () => void;
  /** one of a family of dialogs she switches between (the three kinds of «افزودن»): the same height on wide screens, so switching
   *  never moves or resizes the box; a switch (marked on <html data-add-switch>) plays no exit or enter */
  steady?: boolean;
}

const FOCUSABLE = 'button:not(:disabled),[href],input:not(:disabled),select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * The dialog's exit (motion.md «دیالوگ»: 200 exit, the sheet 280): a static, inert, aria-hidden copy of the closing layer plays
 * `data-state="closed"` and is removed on animationend — never on a timer. Nothing can be clicked or read in it.
 */
function ghostExit(el: HTMLElement | null) {
  if (!el || typeof document === 'undefined') return;
  const g = el.cloneNode(true) as HTMLElement;
  g.setAttribute('data-state', 'closed');
  g.setAttribute('aria-hidden', 'true');
  g.setAttribute('inert', '');
  g.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  document.body.appendChild(g);
  // «افزودن» switching kinds: the copy stays still, as it is, until the next kind's box is in place (the next one may be a lazy
  // chunk that takes a moment); then it goes without motion, so on a phone the sheet never leaves the screen and comes back
  if (g.classList.contains('is-steady') && document.documentElement.hasAttribute('data-add-switch')) {
    g.setAttribute('data-hold', '');
    window.setTimeout(() => g.remove(), 3000); // safety only: the next box removes it as soon as it opens
    return;
  }
  const panel = g.querySelector<HTMLElement>('.mb-dialog');
  if (!panel || typeof panel.getAnimations !== 'function' || panel.getAnimations().length === 0) { g.remove(); return; }
  const done = (e: AnimationEvent) => { if (e.target === panel) g.remove(); };
  panel.addEventListener('animationend', done);
  panel.addEventListener('animationcancel', done);
}

export function Dialog({ open, onClose, title, description, children, footer, inline = false, size = 'md', alert = false, side = false, dirty = false, top = false, onDiscard, steady = false }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();
  const [asking, setAsking] = useState(false);
  const requestClose = onClose ? () => { if (dirty) setAsking(true); else onClose(); } : undefined;
  const closeRef = useRef(requestClose);
  closeRef.current = asking ? undefined : requestClose;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!open || inline) return;
    opener.current = document.activeElement;
    const el = panel.current!;
    const items = () => el.querySelectorAll<HTMLElement>(FOCUSABLE);
    // a confirmation starts on its safest answer, never on the risky one or the × (overlays.md «رفتار»)
    const safe = alert ? el.querySelector<HTMLElement>('.mb-dialog__foot .mb-btn:not(.mb-btn--danger):not(.mb-btn--danger-bold)') : null;
    (safe || items()[0] || el).focus();
    // make the rest of the page inert while the dialog is open
    const siblings = Array.from(document.body.children).filter((n) => n !== layer.current && !n.hasAttribute('inert') && !n.matches('.mb-toast-stack'));
    siblings.forEach((n) => n.setAttribute('inert', ''));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current?.(); }
      if (e.key === 'Tab') {
        const list = Array.from(items());
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      siblings.forEach((n) => n.removeAttribute('inert'));
      document.body.style.overflow = prevOverflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, inline]);

  // the footer's height, for a toast that has to sit just above it on a phone (components.css, «--dialog-foot»)
  useEffect(() => {
    if (!open || inline || typeof ResizeObserver === 'undefined') return;
    const foot = panel.current?.querySelector<HTMLElement>('.mb-dialog__foot');
    const root = document.documentElement;
    if (!foot) { root.style.removeProperty('--dialog-foot'); return; }
    const ro = new ResizeObserver(() => root.style.setProperty('--dialog-foot', `${Math.round(foot.getBoundingClientRect().height)}px`));
    ro.observe(foot);
    return () => { ro.disconnect(); root.style.removeProperty('--dialog-foot'); };
  }, [open, inline]);

  // exit: most dialogs are unmounted by their owner (`open ? <X/> : null`), so the exit plays on an inert copy (ghostExit)
  useLayoutEffect(() => {
    if (!open || inline) return;
    const el = layer.current;
    // the next kind of «افزودن» is in place: it arrives without motion, and the held copy of the last one goes (see ghostExit)
    const root = document.documentElement;
    // overlays.md: at most two layers. A third is a design error in the caller, said out loud while developing (the walk fails on it)
    if (import.meta.env?.DEV && document.querySelectorAll('.mb-dialog-layer:not(.is-inline):not([data-state=closed]):not([data-hold])').length > 2) console.warn('[Mabda] a third layer opened over the page (overlays.md: at most two)');
    if (steady && el && root.hasAttribute('data-add-switch')) {
      el.setAttribute('data-noenter', '');
      document.querySelectorAll('.mb-dialog-layer[data-hold]').forEach((h) => h.remove());
      root.removeAttribute('data-add-switch');
    }
    // after the commit: a layer still in the document was not closed (React's StrictMode re-run), so nothing plays
    return () => queueMicrotask(() => { if (el && !el.isConnected) ghostExit(el); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inline]);

  // phones: the sheet follows a drag down from its head; a quarter of its height (or a quick flick) closes it, like × (overlays.md «برگه»)
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panel.current;
    if (!p || inline || side || alert || !requestClose || !window.matchMedia('(max-width: 767px)').matches) return;
    if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return;
    const y0 = e.clientY, t0 = performance.now();
    let dy = 0;
    const move = (ev: PointerEvent) => { dy = Math.max(0, ev.clientY - y0); p.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const flick = dy > 40 && dy / Math.max(1, performance.now() - t0) > 0.5;
      const closing = dy > p.offsetHeight / 4 || flick;
      // closing: the exit starts from where the finger left it (the inert copy keeps this offset), never a jump back first
      if (!closing || dirty) p.style.transform = '';
      if (closing) requestClose();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  if (!open) return null;
  const node = (
    <div ref={layer} data-state="open" className={cx('mb-dialog-layer', inline && 'is-inline', side && 'is-side', top && 'is-top', alert && 'is-alert', steady && 'is-steady')}>
      <div className="mb-scrim" onClick={alert ? undefined : requestClose} aria-hidden="true" />
      <div
        ref={panel}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal={!inline}
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
        className={cx('mb-dialog', `mb-dialog--${size}`)}
      >
        <div className={cx('mb-dialog__top', scrolled && 'is-scrolled')} onPointerDown={drag}>
          <span className="mb-dialog__grab" aria-hidden="true" />
          <div className="mb-dialog__head">
            <h2 id={`${id}-t`} className="heading-md">{title}</h2>
            {requestClose && <IconButton icon="X" label="بستن" onClick={requestClose} />}
          </div>
          {description && <p id={`${id}-d`} className="mb-dialog__desc body-sm">{description}</p>}
        </div>
        {children && <div className="mb-dialog__body" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>{children}</div>}
        {footer && <div className="mb-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
  const discard = dirty && onClose ? (
    <Dialog open={asking} onClose={() => setAsking(false)} alert size="sm" title="تغییرها دور ریخته شود؟" description="آنچه نوشته‌ای و ذخیره نشده از دست می‌رود."
      footer={<><Button variant="danger" onClick={() => { setAsking(false); onDiscard?.(); onClose(); }}>دور بریز</Button><Button variant="primary" onClick={() => setAsking(false)}>ادامهٔ ویرایش</Button></>} />
  ) : null;
  return inline ? node : <>{createPortal(node, document.body)}{discard}</>;
}

/* ---------------- Toast ---------------- */
export interface ToastProps {
  intent?: StatusIntent;
  children: ReactNode;
  action?: { label: string; onClick?: () => void };
  onClose?: () => void;
  className?: string;
}

export function Toast({ intent = 'info', children, action, onClose, className, ...rest }: ToastProps & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role={intent === 'danger' ? 'alert' : 'status'} className={cx('mb-toast', `mb-toast--${intent}`, className)} {...rest}>
      <Icon name={STATUS_ICON[intent]} size="lg" className="mb-toast__icon" />
      <span className="mb-toast__text body-sm">{children}</span>
      {action && <Button size="sm" variant="ghost" onClick={action.onClick}>{action.label}</Button>}
      {onClose && <IconButton icon="X" label="بستن" size="sm" onClick={onClose} />}
    </div>
  );
}

interface ToastItem { id: string; intent: StatusIntent; message: ReactNode; action?: { label: string; onClick?: () => void }; ms: number }
interface ToastApi {
  show: (t: { intent?: StatusIntent; message: ReactNode; action?: { label: string; onClick?: () => void }; duration?: number }) => string;
  dismiss: (id: string) => void;
}
const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children, max = 3 }: { children: ReactNode; max?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const clear = (id: string) => { clearTimeout(timers.current[id]); delete timers.current[id]; };
  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id]); delete timers.current[id];
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);
  const arm = useCallback((id: string, ms: number) => { if (ms) timers.current[id] = setTimeout(() => dismiss(id), ms); }, [dismiss]);
  const show = useCallback<ToastApi['show']>(({ intent = 'info', message, action, duration }) => {
    const id = `${Date.now()}-${Math.random()}`;
    // overlays.md «پیام گذرا»: 5s, 8s with an action («واگرد»); an error never leaves by itself
    const ms = intent === 'danger' ? 0 : duration !== undefined ? duration : action ? 8000 : 5000;
    setItems((list) => [...list, { id, intent, message, action, ms }].slice(-max));
    arm(id, ms);
    return id;
  }, [arm, max]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  return (
    <ToastCtx.Provider value={{ show, dismiss }}>
      {children}
      {createPortal(
      <div className="mb-toast-stack" role="region" aria-label="اعلان‌ها">
        {items.map((t) => (
          <Toast
            key={t.id}
            intent={t.intent}
            action={t.action && { label: t.action.label, onClick: () => { t.action?.onClick?.(); dismiss(t.id); } }}
            onClose={() => dismiss(t.id)}
            onMouseEnter={() => clear(t.id)}
            onMouseLeave={() => arm(t.id, t.ms)}
            onFocus={() => clear(t.id)}
            onBlur={(e: React.FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) arm(t.id, t.ms); }}
          >
            {t.message}
          </Toast>
        ))}
      </div>
        , document.body)}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ---------------- outside click / Escape ---------------- */
function useDismiss(active: boolean, refs: Array<React.RefObject<HTMLElement | null>>, onDismiss: (viaEscape?: boolean) => void) {
  const cb = useRef(onDismiss);
  cb.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const down = (e: PointerEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) cb.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cb.current(true); } };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/* ---------------- where a floating layer may sit ---------------- */
/** overlays.md «جای لایه‌های شناور»: a menu or popover sits below the bars pinned at the top (the app bar, a page bar that is
 *  stuck), above the phone's bottom bar, and inside the content's own side margins, so it is never nearer the screen's edge
 *  than the text it belongs to. A trigger inside one of those bars is measured against the rest of the window. */
export function floatArea(trigger: Element): { top: number; bottom: number; left: number; right: number } { // check:design-ignore: viewport geometry is physical (getBoundingClientRect)
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, gap = 8;
  const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inset-lg')) || 16;
  let top = gap, bottom = vh - gap, left = gutter, right = vw - gutter;
  for (const bar of document.querySelectorAll<HTMLElement>('[data-pin], .mb-bottomnav.is-fixed')) {
    if (bar.contains(trigger)) continue;
    // a page's own pinned bar belongs to the page: a menu of the app's shell (the sidebar, the rail) may pass over it, never over the app's bars
    if (bar.closest('main') && !trigger.closest('main')) continue;
    const pos = getComputedStyle(bar).position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const r = bar.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= vh) continue;
    if (r.top < vh / 3) top = Math.max(top, r.bottom + gap); else bottom = Math.min(bottom, r.top - gap);
  }
  const main = trigger.closest('main');
  if (main && !trigger.closest('[role=dialog], .mb-dialog-layer')) {
    const r = main.getBoundingClientRect(), cs = getComputedStyle(main);
    left = Math.max(left, r.left + parseFloat(cs.paddingLeft)); // check:design-ignore: measured box, not a style
    right = Math.min(right, r.right - parseFloat(cs.paddingRight)); // check:design-ignore: measured box, not a style
  }
  return { top, bottom, left, right };
}

/** place a floating panel against its trigger inside floatArea: preferred side, flips when there is no room, slides to fit,
 *  scrolls itself only when taller than the room there is */
function placeAgainst(t: HTMLElement, m: HTMLElement, align: 'start' | 'end', side: 'top' | 'bottom', fill = false): CSSProperties {
  const tr = t.getBoundingClientRect();
  const gap = 8;
  let a = floatArea(t);
  // the bars give way only when the menu cannot be whole between them (a short window): every item seen beats a bar seen
  // for the moment the menu is open (overlays.md «جای لایه‌های شناور»)
  m.style.maxBlockSize = '';
  if (m.scrollHeight + 2 > a.bottom - a.top) a = { ...a, top: gap, bottom: window.innerHeight - gap };
  const kept = m.scrollTop;
  requestAnimationFrame(() => { m.scrollTop = kept; });
  m.style.maxBlockSize = '';
  m.style.minInlineSize = fill ? `${Math.min(Math.max(tr.width, 240), 320)}px` : '';
  const room = a.right - a.left;
  const mw = Math.min(m.offsetWidth, room);
  const above = tr.top - gap - a.top, below = a.bottom - tr.bottom - gap;
  const natural = m.scrollHeight + 2;
  const up = side === 'top' ? above >= natural || above > below : !(below >= natural || below > above);
  // neither side holds the whole menu (a short window: phone landscape) but the area does: use all of it, over the trigger,
  // so nothing is hidden behind the menu's own scroll; only a menu taller than the whole area scrolls
  const whole = a.bottom - a.top;
  const cover = natural > Math.max(above, below) && whole > Math.max(above, below);
  const mh = cover ? Math.min(natural, whole) : Math.max(Math.min(natural, up ? above : below), Math.min(natural, 160));
  let y = cover ? (up ? tr.bottom - mh : tr.top) : up ? tr.top - gap - mh : tr.bottom + gap;
  y = Math.max(a.top, Math.min(y, a.bottom - mh));
  const rtl = getComputedStyle(t).direction === 'rtl';
  let x = rtl === (align === 'start') ? tr.right - mw : tr.left;
  x = Math.max(a.left, Math.min(x, a.right - mw));
  // the height was freed by hand above; React does not write a style it believes unchanged, so put it back here too
  m.style.maxBlockSize = `${mh}px`;
  // measured from the LEFT edge in both directions (inline-end is the left in RTL): counting from the right would include the
  // scrollbar gutter, which a fixed layer's containing block leaves out, and push the layer 10px past the content margin
  return { position: 'fixed', insetBlockStart: y, ...(rtl ? { insetInlineEnd: x, insetInlineStart: 'auto' } : { insetInlineStart: x, insetInlineEnd: 'auto' }), maxBlockSize: mh, maxInlineSize: room, overflowY: 'auto' };
}

/** follow the trigger while open: the page or a container scrolled, or the window changed; the panel's own scroll is not a move */
function useFollow(open: boolean, panel: React.RefObject<HTMLElement | null>, place: () => void) {
  useEffect(() => {
    if (!open) return;
    const on = (e?: Event) => { if (e && e.type === 'scroll' && e.target instanceof Node && panel.current?.contains(e.target)) return; place(); };
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    window.visualViewport?.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); window.visualViewport?.removeEventListener('resize', on); };
  }, [open, place, panel]);
}

/* ---------------- Popover ---------------- */
export interface PopoverProps {
  trigger: ReactElement<Record<string, unknown>>;
  children: ReactNode;
  label?: string;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}

export function Popover({ trigger, children, label, align = 'start', side = 'bottom', className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const id = useId();
  // in the document's overlay layer (a portal), like a menu: no container of the trigger (a canvas, a scrolling card) can
  // clip it or draw over it, and it obeys the same placement rule
  const place = useCallback(() => { if (btn.current && panel.current) setPos(placeAgainst(btn.current, panel.current, align, side)); }, [align, side]);
  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useFollow(open, panel, place);
  useDismiss(open, [root, panel], (esc) => { setOpen(false); if (esc) btn.current?.focus(); });
  return (
    <span className={cx('mb-popover', className)} ref={root}>
      {cloneElement(trigger, {
        ref: btn, 'aria-expanded': open, 'aria-controls': `${id}-p`, 'aria-haspopup': 'dialog', onClick: () => setOpen((o) => !o),
      })}
      {open && createPortal(
        <div id={`${id}-p`} ref={panel} role="dialog" aria-label={label}
          style={pos ?? { position: 'fixed', insetBlockStart: 0, insetInlineStart: 0, visibility: 'hidden' }}
          className={cx('mb-popover__panel', 'is-portal', side === 'top' && 'is-top')}>{children}</div>, document.body)}
    </span>
  );
}

/* ---------------- Menu ---------------- */
/** choice: a row of mutually exclusive options shown together (e.g. appearance); choosing one does not close the menu */
export interface MenuChoice { value: string; label: string }
export interface MenuItem { label?: ReactNode; /** plain text the menu's search matches (when `label` is not a string) */ text?: string; /** never hidden by the search */ keep?: boolean; icon?: IconName; onSelect?: () => void; disabled?: boolean; intent?: 'danger'; divider?: boolean; choice?: { options: MenuChoice[]; value: string; onChoose: (value: string) => void } }

/** a labelled group of radio items; used inside Menu and in drawers so both read the same */
export function MenuChoiceRow({ item, labelId }: { item: MenuItem; labelId: string }) {
  const c = item.choice!;
  return (
    <div className="mb-menu__choice" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="mb-menu__choice-label body-md">{item.icon && <Icon name={item.icon} size="md" />}<span>{item.label}</span></span>
      <span className="mb-tabs mb-seg mb-tabs--full">
        {c.options.map((o) => (
          <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === c.value} tabIndex={-1}
            className="mb-tab label-md"
            onClick={(e) => { e.stopPropagation(); c.onChoose(o.value); }}>{o.label}</button>
        ))}
      </span>
    </div>
  );
}
export interface MenuProps {
  trigger: ReactElement<Record<string, unknown>>;
  items: MenuItem[];
  /** a search field above the rows once there are more than `over` of them (navigation.md «انتخابگر فضا»: more than 7 spaces);
   *  rows with `keep` (e.g. «فضای تازه…») always stay */
  filter?: { label: string; over?: number };
  label?: string;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}

export function Menu({ trigger, items: allItems, label = 'منو', align = 'start', side = 'bottom', className, filter }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchable = !!filter && allItems.filter((it) => it.onSelect && !it.keep).length > (filter.over ?? 7);
  const norm = (t: string) => t.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').toLocaleLowerCase('fa').trim();
  const q = norm(query);
  const items = searchable && q
    ? allItems.filter((it) => it.keep || (!it.divider && !it.choice && norm(it.text ?? (typeof it.label === 'string' ? it.label : '')).includes(q)))
    : allItems;
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const id = useId();
  const presence = usePresence(open, menu);
  // the position is kept while the menu fades out; it is measured again on the next open
  const close = (refocus?: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); };
  useDismiss(open, [root, menu], (esc) => close(esc));
  const enabled = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled),[role="menuitemradio"]') ?? []);
  // The panel lives in the document's overlay layer (a portal), never inside the trigger's container (a scrolling
  // sidebar would clip it). Placed by placeAgainst inside floatArea: below the pinned bars, above the bottom bar, within
  // the content margins; scrolls itself only when taller than the room there is (overlays.md «جای لایه‌های شناور»).
  const place = useCallback(() => {
    const t = btn.current, m = menu.current;
    if (!t || !m) return;
    setPos(placeAgainst(t, m, align, side, !!root.current?.classList.contains('w-full')));
  }, [align, side]);
  useLayoutEffect(() => { if (open) place(); }, [open, place, items.length]);
  useEffect(() => { if (!presence.mounted) setPos(null); }, [presence.mounted]);
  useFollow(open, menu, place);
  // on touch the search field is not focused at once: that would raise the keyboard over half the list before the person chose to type
  useEffect(() => { if (open && pos) (searchable && !matchMedia('(pointer: coarse)').matches ? search.current : enabled()[0])?.focus(); }, [open, pos !== null]);
  useEffect(() => { if (!open) setQuery(''); }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const list = enabled();
    // in the search field: typing filters, ↓ goes to the first row, Enter takes the only (or first) match
    if (e.target === search.current) {
      if (e.key === 'ArrowDown' && list.length) { e.preventDefault(); list[0].focus(); }
      if (e.key === 'Enter' && list.length) { e.preventDefault(); list[0].click(); }
      if (e.key === 'Tab') close(false);
      return;
    }
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowUp' && i === 0 && search.current) { e.preventDefault(); search.current.focus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    if (e.key === 'Tab') close(false);
    // type the first letter of a row to move to it (overlays.md «منو»)
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLocaleLowerCase('fa');
      const next = [...list.slice(i + 1), ...list.slice(0, i + 1)].find((el) => (el.textContent ?? '').trim().toLocaleLowerCase('fa').startsWith(k));
      if (next) { e.preventDefault(); next.focus(); }
    }
  };
  return (
    <span className={cx('mb-popover', className)} ref={root}>
      {cloneElement(trigger, {
        ref: btn, id: `${id}-b`, 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': `${id}-m`,
        onClick: () => (open ? close() : setOpen(true)),
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } },
      })}
      {presence.mounted && createPortal(
        <div id={`${id}-m`} role="menu" aria-label={label} aria-labelledby={`${id}-b`} ref={menu} onKeyDown={onKey} data-state={presence.state}
          style={pos ?? { position: 'fixed', insetBlockStart: 0, insetInlineStart: 0, visibility: 'hidden' }}
          className={cx('mb-popover__panel', 'mb-menu', 'is-portal')}>
          {searchable && (
            // the field is not a row: role «none» keeps the menu's own rows the only thing a screen reader lists in it
            <div role="none" className="mb-menu__search">
              <input ref={search} type="text" role="searchbox" dir="auto" aria-label={filter!.label} placeholder={filter!.label} value={query}
                onChange={(e) => setQuery(e.target.value)} className="mb-field__input body-md" />
            </div>
          )}
          {searchable && q && items.every((it) => it.keep || it.divider) && <p role="none" className="mb-menu__empty body-sm">چیزی پیدا نشد.</p>}
          {items.map((it, i) => it.divider ? <div key={i} role="separator" className="mb-menu__sep" /> : it.choice ? <MenuChoiceRow key={i} item={it} labelId={`${id}-c${i}`} /> : (
            <button key={i} type="button" role="menuitem" tabIndex={-1} disabled={it.disabled}
              className={cx('mb-menu__item', 'body-md', it.intent === 'danger' && 'is-danger')}
              onClick={() => { it.onSelect?.(); close(true); }}>
              {it.icon && <Icon name={it.icon} size="md" />}
              <span>{it.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
