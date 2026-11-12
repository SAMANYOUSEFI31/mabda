import { cloneElement, useEffect, useId, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.ts';
import { Nuqta } from './Nuqta.tsx';
import { Icon, STATUS_ICON } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { Button, IconButton } from './Button.tsx';
import { formatPercentValue } from './format.ts';

export type Intent = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';
export type StatusIntent = 'info' | 'success' | 'warning' | 'danger';

/* ---------------- Badge / Tag ---------------- */
export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  intent?: Intent;
  emphasis?: 'subtle' | 'bold';
  /** `false` hides the icon; subtle badges of a status intent show one by default */
  icon?: IconName | false;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ intent = 'neutral', emphasis = 'subtle', icon, dot = false, children, className, ...rest }: BadgeProps) {
  const auto = intent in STATUS_ICON && emphasis === 'subtle' ? STATUS_ICON[intent as StatusIntent] : null;
  const name = icon === false ? null : icon || auto;
  return (
    <span className={cx('mb-badge', 'label-sm', `mb-badge--${intent}`, `mb-badge--${emphasis}`, className)} {...rest}>
      {dot && <span className="mb-badge__dot" aria-hidden="true" />}
      {name && <Icon name={name} size="xs" />}
      {children}
    </span>
  );
}

/** a warning said as a quiet sentence, not a coloured pill (plan 2.6): the sign carries the tone, the words stay ink */
export function Caution({ tone = 'warning', children, className }: { tone?: 'warning' | 'danger'; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-inline-xs body-sm text-text-default', className)}>
      <Icon name={tone === 'danger' ? 'OctagonAlert' : 'TriangleAlert'} size="xs" className={tone === 'danger' ? 'text-icon-danger' : 'text-icon-warning'} />
      {children}
    </span>
  );
}

export interface TagProps {
  children: ReactNode;
  selected?: boolean;
  onToggle?: (selected: boolean) => void;
  onRemove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function Tag({ children, selected, onToggle, onRemove, removeLabel = 'حذف', disabled, className }: TagProps) {
  if (onToggle) {
    return (
      <button
        type="button"
        aria-pressed={Boolean(selected)}
        disabled={disabled}
        onClick={() => onToggle(!selected)}
        className={cx('mb-tag', 'mb-tag--toggle', 'label-md', selected && 'is-selected', className)}
      >
        {selected && <Icon name="Check" size="sm" />}
        {children}
      </button>
    );
  }
  return (
    <span className={cx('mb-tag', 'label-md', className)}>
      {children}
      {onRemove && (
        <button type="button" className="mb-tag__remove" aria-label={`${removeLabel} ${typeof children === 'string' ? children : ''}`.trim()} onClick={onRemove} disabled={disabled}>
          <Icon name="X" size="sm" />
        </button>
      )}
    </span>
  );
}

/* ---------------- Avatar ---------------- */
const AVATAR_TEXT = { xs: 'label-sm', sm: 'label-sm', md: 'label-md', lg: 'title' } as const;
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('‌');
  return (
    <span className={cx('mb-avatar', `mb-avatar--${size}`, AVATAR_TEXT[size], className)} role="img" aria-label={name}>
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}

/* ---------------- Card / Divider / Stat / EmptyState ---------------- */
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  padding?: 'none' | 'md' | 'lg' | 'xl';
  interactive?: boolean;
  href?: string;
  onClick?: (e: React.SyntheticEvent) => void;
  selected?: boolean;
  /** the knowledge state this card shows (edge, corner, surface change together; docs/ux/domain-patterns.md). Words still come from a badge. */
  knowledge?: KnowledgeState;
  children: ReactNode;
}

/** thought (light, temporary) · proposed (on its way) · truth (seated) · stale (aged, needs a look) · past (replaced or archived) */
/** sample: an example Mabda wrote to show the shape of things; not the user's knowledge, not a thought of theirs */
export type KnowledgeState = 'thought' | 'proposed' | 'truth' | 'stale' | 'conflict' | 'past' | 'gap' | 'sample';

export function Card({ interactive = false, href, selected, knowledge, padding = 'lg', className, children, onClick, ...rest }: CardProps) {
  const isInteractive = interactive || Boolean(href) || Boolean(onClick);
  const cls = cx('mb-card', knowledge && 'mb-knowledge', padding !== 'none' && `mb-card--pad-${padding}`, isInteractive && 'mb-card--interactive', selected && 'is-selected', className);
  if (knowledge) (rest as Record<string, unknown>)['data-knowledge'] = knowledge;
  // «مورد دانش»: one Nuqta component (shape + readable name) hangs at the inline start; samples are not knowledge, so none
  if (knowledge && knowledge !== 'sample') children = <><Nuqta state={knowledge} className="mb-knowledge__nuqta" />{children}</>;
  if (href) return <a href={href} className={cls} onClick={onClick} data-knowledge={knowledge}>{children}</a>;
  if (isInteractive) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected === undefined ? undefined : Boolean(selected)}
        className={cls}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); }
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }
  return <div className={cls} {...rest}>{children}</div>;
}

export function Divider({ orientation = 'horizontal', label, className }: { orientation?: 'horizontal' | 'vertical'; label?: ReactNode; className?: string }) {
  if (orientation === 'vertical') return <span role="separator" aria-orientation="vertical" className={cx('mb-divider', 'mb-divider--v', className)} />;
  if (label) return <div role="separator" className={cx('mb-divider--label', 'caption', className)}><span>{label}</span></div>;
  return <hr className={cx('mb-divider', className)} />;
}

export interface StatProps { label: ReactNode; value: ReactNode; delta?: ReactNode; trend?: 'up' | 'down'; className?: string }
export function Stat({ label, value, delta, trend, className }: StatProps) {
  const t = trend === 'up' ? 'success' : trend === 'down' ? 'danger' : null;
  return (
    <div className={cx('mb-stat', className)}>
      <span className="mb-stat__label label-md">{label}</span>
      <span className="mb-stat__value numeric-md">{value}</span>
      {delta && (
        <span className={cx('mb-stat__delta', 'body-sm', t && `is-${t}`)}>
          {t && <Icon name={t === 'success' ? 'CircleCheck' : 'OctagonAlert'} size="sm" />}
          {delta}
        </span>
      )}
    </div>
  );
}

/** patterns.md §5: start-aligned where the content would be; the «جای خالی» dot (28), a title that says what lives here, a sentence or two, one action. No picture.
 *  kind: 'none' (nothing yet: the main action) · 'filtered' (nothing with this filter: clear the filters) · 'done' (all done: no action, no celebration). */
export interface EmptyStateProps { kind?: 'none' | 'filtered' | 'done'; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }
export function EmptyState({ kind = 'none', title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('mb-empty', className)} data-empty={kind}>
      <Nuqta state={kind === 'done' ? 'truth' : 'gap'} size="xl" label={false} className="mb-empty__dot" />
      <p className="mb-empty__title title-3">{title}</p>
      {description && <p className="mb-empty__desc body-md">{description}</p>}
      {action && kind !== 'done' && <div className="mb-empty__action">{action}</div>}
    </div>
  );
}

/** patterns.md §5 «خطا»: in the place the content was coming, never the whole screen. What happened, what is safe, what to do;
 *  the technical text only under «جزئیات», copyable. Never a bare «خطایی رخ داد», never her fault. */
export interface ErrorStateProps { title: ReactNode; description?: ReactNode; onRetry?: () => void; retrying?: boolean; details?: string; className?: string }
export function ErrorState({ title, description, onRetry, retrying, details, className }: ErrorStateProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="alert" className={cx('mb-empty mb-error', className)}>
      <Icon name="OctagonAlert" size="xl" className="mb-error__icon" />
      <p className="mb-empty__title title-3">{title}</p>
      {description && <p className="mb-empty__desc body-md">{description}</p>}
      {onRetry && <div className="mb-empty__action"><Button variant="secondary" iconStart="RotateCcw" onClick={onRetry} disabled={retrying}>{retrying ? 'در حال تلاش…' : 'تلاش دوباره'}</Button></div>}
      {details && (
        <details className="mb-error__details body-sm">
          <summary><Icon name="ChevronDown" size="sm" className="mb-error__chev" />جزئیات</summary>
          <code dir="auto" className="mb-error__code">{details}</code>
          <Button size="sm" variant="ghost" iconStart={copied ? 'Check' : 'Copy'} onClick={() => { void navigator.clipboard?.writeText(details).then(() => setCopied(true), () => {}); }}>{copied ? 'کپی شد' : 'کپی'}</Button>
        </details>
      )}
    </div>
  );
}

/** patterns.md §5 «در حال آمدن»: nothing for the first 300ms, then a skeleton shaped like the page that is coming. */
export function PageSkeleton({ label = 'در حال آوردن', delay = 300, className }: { label?: string; delay?: number; className?: string }) {
  const [show, setShow] = useState(delay <= 0);
  useEffect(() => { if (show) return; const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t); }, [delay, show]);
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cx('mb-pageskel', className)}>
      <span className="sr-only">{label}</span>
      {show && (
        <>
          <Skeleton width="40%" />
          <span className="mb-pageskel__lead"><Skeleton lines={2} /></span>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rect" width="100%" height="var(--space-24)" />)}
        </>
      )}
    </div>
  );
}

/* ---------------- Alert ---------------- */
export interface AlertProps { intent?: StatusIntent; title?: ReactNode; children?: ReactNode; action?: ReactNode; onClose?: () => void; className?: string }
export function Alert({ intent = 'info', title, children, action, onClose, className }: AlertProps) {
  return (
    <div role={intent === 'danger' || intent === 'warning' ? 'alert' : 'status'} className={cx('mb-alert', `mb-alert--${intent}`, className)}>
      <Icon name={STATUS_ICON[intent]} size="lg" className="mb-alert__icon" />
      <div className="mb-alert__content">
        {title && <p className="mb-alert__title title">{title}</p>}
        {children && <div className="mb-alert__text body-sm">{children}</div>}
        {action && <div className="mb-alert__action">{action}</div>}
      </div>
      {onClose && <IconButton icon="X" label="بستن" size="sm" onClick={onClose} className="mb-alert__close" />}
    </div>
  );
}

/* ---------------- Progress / Spinner / Skeleton ---------------- */
export interface ProgressProps {
  value?: number; max?: number; label?: string; intent?: 'brand' | 'success' | 'warning' | 'neutral';
  showValue?: boolean; indeterminate?: boolean; className?: string;
}
export function Progress({ value = 0, max = 100, label, intent = 'neutral', showValue = true, indeterminate = false, className }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const showVal = showValue && !indeterminate;
  return (
    <div className={cx('mb-progress', className)}>
      {(label || showVal) && (
        <div className="mb-progress__head body-sm">
          <span>{label}</span>
          {showVal && <span className="mb-progress__val">{formatPercentValue(Math.round(pct))}</span>}
        </div>
      )}
      <div
        className="mb-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : max}
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuetext={indeterminate ? 'در حال انجام' : `${formatPercentValue(Math.round(pct))}`}
      >
        <span className={cx('mb-progress__bar', `is-${intent}`, indeterminate && 'is-indeterminate')} style={indeterminate ? undefined : { inlineSize: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Spinner({ size = 'md', label = 'در حال بارگذاری' }: { size?: 'sm' | 'md' | 'lg' | 'xl'; label?: string }) {
  return (
    <span role="status" className="mb-spinner">
      <Icon name="LoaderCircle" size={size} className="mb-spin" />
      <span className="mb-sr">{label}</span>
    </span>
  );
}

export interface SkeletonProps { variant?: 'text' | 'circle' | 'rect'; width?: string; height?: string; lines?: number; className?: string }
export function Skeleton({ variant = 'text', width, height, lines = 1, className }: SkeletonProps) {
  if (variant === 'text') {
    return (
      <span className={cx('mb-skel-group', className)} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <span key={i} className="mb-skel mb-skel--text" style={{ inlineSize: i === lines - 1 && lines > 1 ? '60%' : width || '100%' }} />
        ))}
      </span>
    );
  }
  return <span aria-hidden="true" className={cx('mb-skel', `mb-skel--${variant}`, className)} style={{ inlineSize: width, blockSize: height }} />;
}

/* ---------------- Tooltip ---------------- */
export function Tooltip({ content, children, side = 'top', forceOpen = false }: { content: ReactNode; children: React.ReactElement<Record<string, unknown>>; side?: 'top' | 'bottom'; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="mb-tooltip-anchor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span role="tooltip" id={id} className={cx('mb-tooltip', 'body-sm', side === 'bottom' && 'is-bottom', (open || forceOpen) && 'is-open')}>{content}</span>
    </span>
  );
}

/* ---------------- BrandMark: the lapis diamond (identity.md; the only non-button use of the brand colour) ---------------- */
export function BrandMark({ size = 'md', word = false, className }: { size?: 'sm' | 'md' | 'lg'; word?: boolean; className?: string }) {
  const px = size === 'lg' ? 'xl' : size === 'md' ? 'lg' : 'md';
  return (
    <span className={cx('inline-flex items-center gap-inline-sm', className)} aria-hidden={word ? undefined : true}>
      <Nuqta state="brand" size={px} label={false} />
      {word && <span className={size === 'lg' ? 'title-2 text-text-default' : 'headline text-text-default'}>مبدأ</span>}
    </span>
  );
}
