import { cloneElement, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
}

const FOCUSABLE = 'button:not(:disabled),[href],input:not(:disabled),select,textarea,[tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, description, children, footer, inline = false, size = 'md', alert = false, side = false }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || inline) return;
    opener.current = document.activeElement;
    const el = panel.current!;
    const items = () => el.querySelectorAll<HTMLElement>(FOCUSABLE);
    (items()[0] || el).focus();
    // make the rest of the page inert while the dialog is open
    const siblings = Array.from(document.body.children).filter((n) => n !== layer.current && !n.hasAttribute('inert') && !n.matches('.bsh-toast-stack'));
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

  if (!open) return null;
  const node = (
    <div ref={layer} className={cx('bsh-dialog-layer', inline && 'is-inline', side && 'is-side')}>
      <div className="bsh-scrim" onClick={alert ? undefined : onClose} aria-hidden="true" />
      <div
        ref={panel}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal={!inline}
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
        className={cx('bsh-dialog', `bsh-dialog--${size}`)}
      >
        <span className="bsh-dialog__grab" aria-hidden="true" />
        <div className="bsh-dialog__head">
          <h2 id={`${id}-t`} className="heading-md">{title}</h2>
          {onClose && <IconButton icon="X" label="بستن" onClick={onClose} />}
        </div>
        {description && <p id={`${id}-d`} className="bsh-dialog__desc body-sm">{description}</p>}
        {children && <div className="bsh-dialog__body">{children}</div>}
        {footer && <div className="bsh-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
  return inline ? node : createPortal(node, document.body);
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
    <div role={intent === 'danger' ? 'alert' : 'status'} className={cx('bsh-toast', `bsh-toast--${intent}`, className)} {...rest}>
      <Icon name={STATUS_ICON[intent]} size="lg" className="bsh-toast__icon" />
      <span className="bsh-toast__text body-sm">{children}</span>
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
    const ms = duration !== undefined ? duration : intent === 'danger' || action ? 0 : 4000;
    setItems((list) => [...list, { id, intent, message, action, ms }].slice(-max));
    arm(id, ms);
    return id;
  }, [arm, max]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  return (
    <ToastCtx.Provider value={{ show, dismiss }}>
      {children}
      {createPortal(
      <div className="bsh-toast-stack" role="region" aria-label="اعلان‌ها">
        {items.map((t) => (
          <Toast
            key={t.id}
            intent={t.intent}
            action={t.action && { label: t.action.label, onClick: () => { t.action?.onClick?.(); dismiss(t.id); } }}
            onClose={() => dismiss(t.id)}
            onMouseEnter={() => clear(t.id)}
            onMouseLeave={() => arm(t.id, t.ms)}
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
    <span className={cx('bsh-popover', className)} ref={root}>
      {cloneElement(trigger, {
        ref: btn, 'aria-expanded': open, 'aria-controls': `${id}-p`, 'aria-haspopup': 'dialog', onClick: () => setOpen((o) => !o),
      })}
      {open && <div id={`${id}-p`} role="dialog" aria-label={label} className={cx('bsh-popover__panel', `is-${align}`, side === 'top' && 'is-top')}>{children}</div>}
    </span>
  );
}

/* ---------------- Menu ---------------- */
export interface MenuItem { label?: ReactNode; icon?: IconName; onSelect?: () => void; disabled?: boolean; intent?: 'danger'; divider?: boolean }
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
  const id = useId();
  const close = (refocus?: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); };
  useDismiss(open, [root], (esc) => close(esc));
  const enabled = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
  useEffect(() => { if (open) enabled()[0]?.focus(); }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const list = enabled();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    if (e.key === 'Tab') close(false);
  };
  return (
    <span className={cx('bsh-popover', className)} ref={root}>
      {cloneElement(trigger, {
        ref: btn, id: `${id}-b`, 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': `${id}-m`,
        onClick: () => setOpen((o) => !o),
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } },
      })}
      {open && (
        <div id={`${id}-m`} role="menu" aria-label={label} aria-labelledby={`${id}-b`} ref={menu} onKeyDown={onKey}
          className={cx('bsh-popover__panel', 'bsh-menu', `is-${align}`, side === 'top' && 'is-top')}>
          {items.map((it, i) => it.divider ? <div key={i} role="separator" className="bsh-menu__sep" /> : (
            <button key={i} type="button" role="menuitem" tabIndex={-1} disabled={it.disabled}
              className={cx('bsh-menu__item', 'body-md', it.intent === 'danger' && 'is-danger')}
              onClick={() => { it.onSelect?.(); close(true); }}>
              {it.icon && <Icon name={it.icon} size="md" />}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
