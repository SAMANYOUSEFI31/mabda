import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { useShownBusy } from './useShownBusy.ts';

type ForceState = 'hover' | 'active' | 'focus';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Only ONE `primary` per view. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger' | 'danger-bold';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  iconStart?: IconName;
  iconEnd?: IconName;
  fullWidth?: boolean;
  glow?: boolean;
  /** renders an <a> when set and the button is neither disabled nor loading */
  href?: string;
  forceState?: ForceState;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, disabled = false, iconStart, iconEnd, fullWidth = false, glow = false,
    href, forceState, className, children, type = 'button', ...rest }, ref,
) {
  const inert = disabled || loading;
  const spin = useShownBusy(loading);
  const asLink = Boolean(href) && !inert;
  const Tag = (asLink ? 'a' : 'button') as 'button';
  const tagProps = asLink ? { href } : { type, disabled: inert };
  return (
    <Tag
      ref={ref}
      className={cx('mb-btn', `mb-btn--${variant}`, `mb-btn--${size}`, size === 'lg' ? 'label-lg' : 'label-md',
        fullWidth && 'mb-btn--full', glow && variant === 'primary' && 'mb-btn--glow', spin && 'is-loading', className)}
      aria-busy={loading || undefined}
      data-force={forceState}
      {...tagProps}
      {...rest}
    >
      <span className="mb-btn__content">
        {iconStart && <Icon name={iconStart} size="md" />}
        <span className="mb-btn__label">{children}</span>
        {iconEnd && <Icon name={iconEnd} size="md" className="mb-flip" />}
      </span>
      {spin && (
        <span className="mb-btn__spin" aria-hidden="true"><Icon name="LoaderCircle" size="md" className="mb-spin" /></span>
      )}
    </Tag>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** accessible name (also used as tooltip title) */
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** toggle button: aria-pressed + selected surface */
  selected?: boolean;
  /** mirror the icon in LTR (direction-aware icons) */
  flip?: boolean;
  forceState?: ForceState;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', selected, flip = false, forceState, className, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-force={forceState}
      aria-pressed={selected === undefined ? undefined : Boolean(selected)}
      className={cx('mb-iconbtn', `mb-btn--${variant}`, `mb-iconbtn--${size}`, selected && 'is-selected', className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 'sm' : 'lg'} className={flip ? 'mb-flip' : undefined} />
    </button>
  );
});

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  external?: boolean;
  children: ReactNode;
  forceState?: ForceState;
}

export function Link({ href = '#', external = false, children, forceState, className, ...rest }: LinkProps) {
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a href={href} data-force={forceState} className={cx('mb-link', className)} {...ext} {...rest}>
      {children}
      {external && (
        <>
          <Icon name="ExternalLink" size="xs" className="mb-link__ext mb-flip-rtl" />
          <span className="mb-sr"> (در پنجرهٔ تازه باز می‌شود)</span>
        </>
      )}
    </a>
  );
}
