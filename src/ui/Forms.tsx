import { useEffect, useId, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { formatNumber } from './format.ts';

type ForceState = 'hover' | 'active' | 'focus';
type Size = 'sm' | 'md' | 'lg';
const SIZE_CLS: Record<Size, string> = { sm: 'mb-field__input--sm', md: '', lg: 'mb-field__input--lg' };

interface FieldShellProps {
  id: string; label?: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode;
  disabled?: boolean; className?: string; children: ReactNode; counter?: ReactNode;
}

function FieldShell({ id, label, required, hint, error, disabled, className, children, counter }: FieldShellProps) {
  return (
    <div className={cx('mb-field', error && 'is-invalid', disabled && 'is-disabled', className)}>
      {label && (
        <label htmlFor={id} className="mb-field__label label-md">
          {label}
          {required && <span className="mb-field__req" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      <div className="mb-field__foot">
        {error ? (
          <span id={`${id}-err`} className="mb-field__error body-sm"><Icon name="OctagonAlert" size="sm" />{error}</span>
        ) : hint ? (
          <span id={`${id}-hint`} className="mb-field__hint body-sm">{hint}</span>
        ) : <span />}
        {counter}
      </div>
    </div>
  );
}

const describedBy = (id: string, hint: ReactNode, error: ReactNode) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

/* ---------------- TextField ---------------- */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode; hint?: ReactNode; error?: ReactNode; size?: Size;
  iconStart?: IconName; iconEnd?: IconName; forceState?: ForceState;
}

export function TextField({ label, hint, error, required, disabled, id, forceState, className, type = 'text', size = 'md', iconStart, iconEnd, ...rest }: TextFieldProps) {
  const auto = useId();
  const fid = id || auto;
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} error={error} disabled={disabled} className={className}>
      <span className={cx('mb-inputwrap', iconStart && 'has-start', iconEnd && 'has-end')}>
        {iconStart && <Icon name={iconStart} size="md" className="mb-inputwrap__icon is-start" />}
        <input
          id={fid} type={type} disabled={disabled} required={required} data-force={forceState}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)}
          className={cx('mb-field__input', 'body-md', SIZE_CLS[size])} {...rest}
        />
        {iconEnd && <Icon name={iconEnd} size="md" className="mb-inputwrap__icon is-end" />}
      </span>
    </FieldShell>
  );
}

/* ---------------- Textarea ---------------- */
export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label: ReactNode; hint?: ReactNode; error?: ReactNode; forceState?: ForceState;
}

export function Textarea({ label, hint, error, required, disabled, id, rows = 4, maxLength, value, defaultValue, onChange, forceState, className, ...rest }: TextareaProps) {
  const auto = useId();
  const fid = id || auto;
  const [len, setLen] = useState(String(value ?? defaultValue ?? '').length);
  const counter = maxLength ? <span className="mb-field__count caption" aria-live="polite">{formatNumber(len)} / {formatNumber(maxLength)}</span> : null;
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} error={error} disabled={disabled} className={className} counter={counter}>
      <textarea
        id={fid} rows={rows} maxLength={maxLength} value={value} defaultValue={defaultValue} disabled={disabled} required={required}
        data-force={forceState} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)}
        onChange={(e) => { setLen(e.target.value.length); onChange?.(e); }}
        className="mb-field__input mb-field__input--multi body-md" {...rest}
      />
    </FieldShell>
  );
}

/* ---------------- Select ---------------- */
export interface SelectOption { value: string; label: ReactNode; disabled?: boolean }
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: ReactNode; size?: Size; options: SelectOption[]; placeholder?: string;
  hint?: ReactNode; error?: ReactNode; forceState?: ForceState;
}

export function Select({ label, hint, error, required, disabled, id, options, placeholder, value, defaultValue, onChange, forceState, size = 'md', className, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id || auto;
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} error={error} disabled={disabled} className={className}>
      <span className="mb-select">
        <select
          id={fid} disabled={disabled} required={required} value={value}
          defaultValue={value === undefined ? (defaultValue ?? (placeholder ? '' : undefined)) : undefined}
          onChange={onChange} data-force={forceState} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)}
          className={cx('mb-field__input', 'mb-select__input', 'body-md', SIZE_CLS[size])} {...rest}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
        <Icon name="ChevronDown" size="md" className="mb-select__chev" />
      </span>
    </FieldShell>
  );
}

/* ---------------- Checkbox ---------------- */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode; indeterminate?: boolean; hint?: ReactNode; error?: ReactNode; forceState?: ForceState;
}

export function Checkbox({ label, checked, defaultChecked, indeterminate = false, disabled, error, hint, onChange, forceState, className, ...rest }: CheckboxProps) {
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const isOn = checked !== undefined ? checked : inner;
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <div className="mb-check-wrap">
      <label className={cx('mb-check', disabled && 'is-disabled', error && 'is-invalid', className)}>
        <input
          ref={ref} type="checkbox" className="mb-check__input" checked={isOn} disabled={disabled} data-force={forceState}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => { setInner(e.target.checked); onChange?.(e); }} {...rest}
        />
        <span className="mb-check__box" aria-hidden="true">
          {indeterminate ? <Icon name="Minus" size="sm" strokeWidth={3} /> : isOn && <Icon name="Check" size="sm" strokeWidth={3} />}
        </span>
        {label && <span className="mb-check__label body-md">{label}</span>}
      </label>
      {error ? (
        <span id={`${id}-err`} className="mb-field__error body-sm"><Icon name="OctagonAlert" size="sm" />{error}</span>
      ) : hint && <span id={`${id}-hint`} className="mb-field__hint body-sm">{hint}</span>}
    </div>
  );
}

/* ---------------- Switch ---------------- */
export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label?: ReactNode; forceState?: ForceState }

export function Switch({ label, checked, defaultChecked, disabled, onChange, forceState, className, ...rest }: SwitchProps) {
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const on = checked !== undefined ? checked : inner;
  return (
    <label className={cx('mb-switch', disabled && 'is-disabled', className)}>
      <input
        type="checkbox" role="switch" className="mb-switch__input" checked={on} disabled={disabled} data-force={forceState}
        onChange={(e) => { setInner(e.target.checked); onChange?.(e); }} {...rest}
      />
      <span className="mb-switch__track" aria-hidden="true"><span className="mb-switch__thumb" /></span>
      {label && <span className="mb-switch__label body-md">{label}</span>}
    </label>
  );
}

/* ---------------- RadioGroup ---------------- */
export interface RadioGroupProps {
  legend?: ReactNode; name?: string; options: SelectOption[]; value?: string; defaultValue?: string;
  onChange?: (value: string) => void; orientation?: 'vertical' | 'horizontal'; required?: boolean; disabled?: boolean;
  hint?: ReactNode; error?: ReactNode; className?: string;
}

export function RadioGroup({ legend, name, options, value, defaultValue, onChange, orientation = 'vertical', disabled, required, error, hint, className }: RadioGroupProps) {
  const [inner, setInner] = useState(defaultValue);
  const current = value !== undefined ? value : inner;
  const id = useId();
  return (
    <div className={cx('mb-check-wrap', error && 'is-invalid-group', className)}>
      <fieldset
        className={cx('mb-radiogroup', orientation === 'horizontal' && 'is-horizontal')} disabled={disabled}
        aria-required={required || undefined} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
      >
        {legend && <legend className="label-md">{legend}{required && <span className="mb-field__req" aria-hidden="true"> *</span>}</legend>}
        {options.map((o) => (
          <label key={o.value} className={cx('mb-radio', o.disabled && 'is-disabled')}>
            <input
              type="radio" className="mb-radio__input" name={name || id} value={o.value} disabled={o.disabled} checked={current === o.value}
              onChange={() => { setInner(o.value); onChange?.(o.value); }}
            />
            <span className="mb-radio__dot" aria-hidden="true" />
            <span className="mb-radio__label body-md">{o.label}</span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <span id={`${id}-err`} className="mb-field__error body-sm"><Icon name="OctagonAlert" size="sm" />{error}</span>
      ) : hint && <span id={`${id}-hint`} className="mb-field__hint body-sm">{hint}</span>}
    </div>
  );
}

/* ---------------- OptionCard (single-choice card inside a labelled group) ---------------- */
export interface OptionCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** small trailing facts, e.g. credit cost */
  meta?: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function OptionCard({ title, description, meta, badge, selected, disabled, onClick, className }: OptionCardProps) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(selected)}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-touch flex-col gap-stack-xs rounded-control border p-inset-md text-start transition-colors',
        selected
          ? 'border-border-selected bg-bg-selected'
          : 'border-border-default bg-surface-sunken hover:border-border-default-hover hover:bg-interaction-hover active:bg-interaction-pressed',
        disabled && 'cursor-not-allowed border-border-disabled bg-bg-disabled text-text-disabled hover:bg-bg-disabled',
        className,
      )}
    >
      <span className="flex items-center justify-between gap-inline-xs">
        <span className="label-md text-text-default">{title}</span>
        {badge}
      </span>
      {description && <span className="caption text-text-subtle">{description}</span>}
      {meta && <span className="label-sm tabular-nums text-text-default">{meta}</span>}
    </button>
  );
}
