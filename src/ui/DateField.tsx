/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { cx } from './cx.ts';
import { IconButton } from './Button.tsx';
import { Icon } from './Icon.tsx';
import { formatJalaliDate, formatNumber } from './format.ts';
import { J_MONTHS, J_WEEKDAYS, addDays, addMonths, isoToJ, monthGrid, parseJalaliInput, todayIso, weekdaySat } from './jalali.ts';

export interface DateFieldProps {
  label: React.ReactNode;
  /** ISO `YYYY-MM-DD`, or '' for none (the value the browser's date input used to give) */
  value: string;
  onValueChange: (iso: string) => void;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  min?: string;
  max?: string;
  className?: string;
}

const inRange = (iso: string, min?: string, max?: string) => (!min || iso >= min) && (!max || iso <= max);

/**
 * The solar date field (components.md «تقویم»): she can type («۲۰ آبان»، «۱۴۰۵/۸/۲۰»، «فردا») or pick from a Saturday-first month.
 * The browser's own picker is never used: it is Gregorian and looks like nothing else here.
 * Keys in the month: arrows a day (left is the next day, as the row reads), up/down a week, PageUp/PageDown a month, Home/End the week's ends.
 */
export function DateField({ label, value, onValueChange, hint, error, min, max, className }: DateFieldProps) {
  const id = useId();
  const [text, setText] = useState<string | null>(null); // null = not being typed: show the formatted value
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value || todayIso());
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const today = todayIso();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => { if (open) requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()); }, [open, cursor]);

  const commit = (raw: string) => {
    setText(null);
    if (!raw.trim()) { setBad(false); onValueChange(''); return; }
    const iso = parseJalaliInput(raw, today);
    if (iso && inRange(iso, min, max)) { setBad(false); onValueChange(iso); } else setBad(true);
  };
  const pick = (iso: string) => { if (!inRange(iso, min, max)) return; onValueChange(iso); setBad(false); setText(null); setOpen(false); btn.current?.focus(); };
  const show = () => { setCursor(value || today); setOpen((o) => !o); };

  const j = isoToJ(cursor)!;
  const weeks = monthGrid(j.jy, j.jm);
  const move = (e: React.KeyboardEvent) => {
    const k = e.key;
    const to = k === 'ArrowLeft' ? addDays(cursor, 1) : k === 'ArrowRight' ? addDays(cursor, -1)
      : k === 'ArrowDown' ? addDays(cursor, 7) : k === 'ArrowUp' ? addDays(cursor, -7)
      : k === 'PageDown' ? addMonths(cursor, 1) : k === 'PageUp' ? addMonths(cursor, -1)
      : k === 'Home' ? addDays(cursor, -weekdaySat(cursor)) : k === 'End' ? addDays(cursor, 6 - weekdaySat(cursor)) : null;
    if (to) { e.preventDefault(); setCursor(to); return; }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
  };
  const nextSat = parseJalaliInput('شنبه', today)!;
  const shown = text ?? (value ? formatJalaliDate(`${value}T12:00:00Z`) : '');
  const err = error ?? (bad ? 'این تاریخ خوانده نشد؛ مثلاً «۲۰ آبان» یا «فردا» بنویس.' : undefined);

  return (
    <div className={cx('mb-field', err && 'is-invalid', className)} ref={root}>
      <label htmlFor={id} className="mb-field__label label-md">{label}</label>
      <span className="mb-datefield">
        <input
          id={id} type="text" inputMode="text" autoComplete="off" value={shown} placeholder="مثلاً ۲۰ آبان"
          aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className="mb-field__input body-md"
          onChange={(e) => { setText(e.target.value); setBad(false); }}
          onBlur={(e) => { if (text !== null) commit(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && text !== null) { e.preventDefault(); commit(text); } }}
        />
        <IconButton ref={btn} icon="CalendarDays" label="تقویم" variant="ghost" aria-expanded={open} aria-haspopup="dialog" onClick={show} />
      </span>
      {open && (
        <div role="dialog" aria-label={`تقویم ${J_MONTHS[j.jm - 1]} ${formatNumber(j.jy).replace(/٬/g, '')}`} className="mb-popover__panel mb-cal" onKeyDown={move}>
          <div className="mb-cal__head">
            <IconButton icon="ChevronRight" label="ماه قبل" size="sm" variant="ghost" onClick={() => setCursor(addMonths(cursor, -1))} />
            <span className="label-md" aria-live="polite">{J_MONTHS[j.jm - 1]} {formatNumber(j.jy).replace(/٬/g, '')}</span>
            <IconButton icon="ChevronLeft" label="ماه بعد" size="sm" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))} />
          </div>
          <div role="grid" ref={grid} className="mb-cal__grid">
            <div role="row" className="mb-cal__row">
              {J_WEEKDAYS.map((w, i) => <span key={w} role="columnheader" aria-label={w} className={cx('mb-cal__wd caption', i === 6 && 'is-friday')}>{w.slice(0, 1)}</span>)}
            </div>
            {weeks.map((w, wi) => (
              <div role="row" key={wi} className="mb-cal__row">
                {w.map((iso, di) => iso ? (
                  <span role="gridcell" key={iso} aria-selected={iso === value}>
                    <button
                      type="button" tabIndex={iso === cursor ? 0 : -1} disabled={!inRange(iso, min, max)}
                      aria-label={formatJalaliDate(`${iso}T12:00:00Z`)} aria-current={iso === today ? 'date' : undefined}
                      className={cx('mb-cal__day body-sm', di === 6 && 'is-friday', iso === today && 'is-today', iso === value && 'is-selected')}
                      onClick={() => pick(iso)}
                    >{formatNumber(isoToJ(iso)!.jd)}</button>
                  </span>
                ) : <span role="gridcell" key={`e${di}`} />)}
              </div>
            ))}
          </div>
          <div className="mb-cal__foot">
            {[['امروز', today], ['فردا', addDays(today, 1)], ['شنبه', nextSat]].map(([l, iso]) => (
              <button key={l} type="button" className="mb-cal__quick body-sm" disabled={!inRange(iso, min, max)} onClick={() => pick(iso)}>{l}</button>
            ))}
            {value && <button type="button" className="mb-cal__quick body-sm" onClick={() => { onValueChange(''); setOpen(false); btn.current?.focus(); }}><Icon name="X" size="sm" />بدون تاریخ</button>}
          </div>
        </div>
      )}
      <div className="mb-field__foot">
        {err ? <span id={`${id}-err`} className="mb-field__error body-sm"><Icon name="OctagonAlert" size="sm" />{err}</span>
          : hint ? <span id={`${id}-hint`} className="mb-field__hint body-sm">{hint}</span> : <span />}
      </div>
    </div>
  );
}
