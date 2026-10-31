import { useEffect, useId, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { formatNumber } from './format.ts';

type ForceState = 'hover' | 'active' | 'focus';
type Size = 'sm' | 'md' | 'lg';
const SIZE_CLS: Record<Size, string> = { sm: 'bsh-field__input--sm', md: '', lg: 'bsh-field__input--lg' };

interface FieldShellProps {
  id: string; label?: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode;
  disabled?: boolean; className?: string; children: ReactNode; counter?: ReactNode;
}

function FieldShell({ id, label, required, hint, error, disabled, className, children, counter }: FieldShellProps) {
  return (
    <div className={cx('bsh-field', error && 'is-invalid', disabled && 'is-disabled', className)}>
      {label && (
        <label htmlFor={id} className="bsh-field__label label-md">
          {label}
          {required && <span className="bsh-field__req" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      <div className="bsh-field__foot">
        {error ? (
          <span id={`${id}-err`} className="bsh-field__error body-sm"><Icon name="OctagonAlert" size="sm" />{error}</span>
        ) : hint ? (
          <span id={`${id}-hint`} className="bsh-field__hint body-sm">{hint}</span>
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
      <span className={cx('bsh-inputwrap', iconStart && 'has-start', iconEnd && 'has-end')}>
        {iconStart && <Icon name={iconStart} size="md" className="bsh-inputwrap__icon is-start" />}
        <input
          id={fid} type={type} disabled={disabled} required={required} data-force={forceState}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)}
          className={cx('bsh-field__input', 'body-md', SIZE_CLS[size])} {...rest}
        />
        {iconEnd && <Icon name={iconEnd} size="md" className="bsh-inputwrap__icon is-end" />}
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
  const counter = maxLength ? <span className="bsh-field__count caption" aria-live="polite">{formatNumber(len)} / {formatNumber(maxLength)}</span> : null;
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} error={error} disabled={disabled} className={className} counter={counter}>
      <textarea
        id={fid} rows={rows} maxLength={maxLength} value={value} defaultValue={defaultValue} disabled={disabled} required={required}
        data-force={forceState} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)}
        onChange={(e) => { setLen(e.target.value.length); onChange?.(e); }}
        className="bsh-field__input bsh-field__input--multi body-md" {...rest}
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
      <span className="bsh-select">
        <select
          id={fid} disabled={disabled} required={required} value={value}
          defaultValue={value === undefined ? (defaultValue ?? (placeholder ? '' : undefined)) : undefined}
          onChange={onChange} data-force={forceState} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)}
          className={cx('bsh-field__input', 'bsh-select__input', 'body-md', SIZE_CLS[size])} {...rest}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
        <Icon name="ChevronDown" size="md" className="bsh-select__chev" />
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
    <div className="bsh-check-wrap">
      <label className={cx('bsh-check', disabled && 'is-disabled', error && 'is-invalid', className)}>
        <input
          ref={ref} type="checkbox" className="bsh-check__input" checked={isOn} disabled={disabled} data-force={forceState}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => { setInner(e.target.checked); onChange?.(e); }} {...rest}
        />
        <span className="bsh-check__box" aria-hidden="true">
          {indeterminate ? <Icon name="Minus" size="sm" strokeWidth={3} /> : isOn && <Icon name="Check" size="sm" strokeWidth={3} />}
        </span>
        {label && <span className="bsh-check__label body-md">{label}</span>}
      </label>
      {error ? (
        <span id={`${id}-err`} className="bsh-field__error body-sm"><Icon name="OctagonAlert" size="sm" />{error}</span>
      ) : hint && <span id={`${id}-hint`} className="bsh-field__hint body-sm">{hint}</span>}
    </div>
  );
}

/* ---------------- Switch ---------------- */
export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label?: ReactNode; forceState?: ForceState }

export function Switch({ label, checked, defaultChecked, disabled, onChange, forceState, className, ...rest }: SwitchProps) {
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const on = checked !== undefined ? checked : inner;
  return (
    <label className={cx('bsh-switch', disabled && 'is-disabled', className)}>
      <input
        type="checkbox" role="switch" className="bsh-switch__input" checked={on} disabled={disabled} data-force={forceState}
        onChange={(e) => { setInner(e.target.checked); onChange?.(e); }} {...rest}
      />
      <span className="bsh-switch__track" aria-hidden="true"><span className="bsh-switch__thumb" /></span>
      {label && <span className="bsh-switch__label body-md">{label}</span>}
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
    <div className={cx('bsh-check-wrap', error && 'is-invalid-group', className)}>
      <fieldset
        className={cx('bsh-radiogroup', orientation === 'horizontal' && 'is-horizontal')} disabled={disabled}
        aria-required={required || undefined} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
      >
        {legend && <legend className="label-md">{legend}{required && <span className="bsh-field__req" aria-hidden="true"> *</span>}</legend>}
        {options.map((o) => (
          <label key={o.value} className={cx('bsh-radio', o.disabled && 'is-disabled')}>
            <input
              type="radio" className="bsh-radio__input" name={name || id} value={o.value} disabled={o.disabled} checked={current === o.value}
              onChange={() => { setInner(o.value); onChange?.(o.value); }}
            />
            <span className="bsh-radio__dot" aria-hidden="true" />
            <span className="bsh-radio__label body-md">{o.label}</span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <span id={`${id}-err`} className="bsh-field__error body-sm"><Icon name="OctagonAlert" size="sm" />{error}</span>
      ) : hint && <span id={`${id}-hint`} className="bsh-field__hint body-sm">{hint}</span>}
    </div>
  );
}
