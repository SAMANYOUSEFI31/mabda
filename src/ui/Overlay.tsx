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
  const panel = g.querySelector<HTMLElement>('.mb-dialog');
  if (!panel || typeof panel.getAnimations !== 'function' || panel.getAnimations().length === 0) { g.remove(); return; }
  const done = (e: AnimationEvent) => { if (e.target === panel) g.remove(); };
  panel.addEventListener('animationend', done);
  panel.addEventListener('animationcancel', done);
}

export function Dialog({ open, onClose, title, description, children, footer, inline = false, size = 'md', alert = false, side = false, dirty = false, top = false }: DialogProps) {
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

  // exit: most dialogs are unmounted by their owner (`open ? <X/> : null`), so the exit plays on an inert copy (ghostExit)
  useLayoutEffect(() => {
    if (!open || inline) return;
    const el = layer.current;
    // after the commit: a layer still in the document was not closed (React's StrictMode re-run), so nothing plays
    return () => queueMicrotask(() => { if (el && !el.isConnected) ghostExit(el); });
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
    <div ref={layer} data-state="open" className={cx('mb-dialog-layer', inline && 'is-inline', side && 'is-side', top && 'is-top', alert && 'is-alert')}>
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
      footer={<><Button variant="danger" onClick={() => { setAsking(false); onClose(); }}>دور بریز</Button><Button variant="primary" onClick={() => setAsking(false)}>ادامهٔ ویرایش</Button></>} />
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
  const id = useId();
  useDismiss(open, [root], (esc) => { setOpen(false); if (esc) btn.current?.focus(); });
  return (
    <span className={cx('mb-popover', className)} ref={root}>
      {cloneElement(trigger, {
        ref: btn, 'aria-expanded': open, 'aria-controls': `${id}-p`, 'aria-haspopup': 'dialog', onClick: () => setOpen((o) => !o),
      })}
      {open && <div id={`${id}-p`} role="dialog" aria-label={label} className={cx('mb-popover__panel', `is-${align}`, side === 'top' && 'is-top')}>{children}</div>}
    </span>
  );
}

/* ---------------- Menu ---------------- */
/** choice: a row of mutually exclusive options shown together (e.g. appearance); choosing one does not close the menu */
export interface MenuChoice { value: string; label: string }
export interface MenuItem { label?: ReactNode; icon?: IconName; onSelect?: () => void; disabled?: boolean; intent?: 'danger'; divider?: boolean; choice?: { options: MenuChoice[]; value: string; onChoose: (value: string) => void } }

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
  label?: string;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}

export function Menu({ trigger, items, label = 'منو', align = 'start', side = 'bottom', className }: MenuProps) {
  const [open, setOpen] = useState(false);
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
  // sidebar would clip it). Placed against the trigger: preferred side, flips when there is no room, slides inside
  // the viewport with 8px to spare, and scrolls itself only when it is taller than the viewport (navigation.md «منوی حساب»).
  const place = useCallback(() => {
    const t = btn.current, m = menu.current;
    if (!t || !m) return;
    const tr = t.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, edge = 8, gap = 8;
    const fill = root.current?.classList.contains('w-full');
    m.style.maxBlockSize = '';
    m.style.minInlineSize = fill ? `${Math.min(Math.max(tr.width, 240), 320)}px` : '';
    const mw = Math.min(m.offsetWidth, vw - 2 * edge);
    const mh = Math.min(m.scrollHeight + 2, vh - 2 * edge);
    const above = tr.top - gap - edge, below = vh - tr.bottom - gap - edge;
    const up = side === 'top' ? above >= mh || above > below : !(below >= mh || below > above);
    let y = up ? tr.top - gap - mh : tr.bottom + gap;
    y = Math.max(edge, Math.min(y, vh - edge - mh));
    const rtl = getComputedStyle(t).direction === 'rtl';
    // align start: the panel's inline-start edge meets the trigger's (its right edge in RTL); end: the opposite edges
    let x = rtl === (align === 'start') ? tr.right - mw : tr.left;
    x = Math.max(edge, Math.min(x, vw - edge - mw));
    setPos({ position: 'fixed', insetBlockStart: y, insetInlineStart: rtl ? vw - x - mw : x, maxBlockSize: mh, maxInlineSize: vw - 2 * edge, overflowY: 'auto' });
  }, [align, side]);
  useLayoutEffect(() => { if (open) place(); }, [open, place, items.length]);
  useEffect(() => { if (!presence.mounted) setPos(null); }, [presence.mounted]);
  useEffect(() => {
    if (!open) return;
    const on = () => place();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); };
  }, [open, place]);
  useEffect(() => { if (open && pos) enabled()[0]?.focus(); }, [open, pos !== null]);
  const onKey = (e: React.KeyboardEvent) => {
    const list = enabled();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
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
