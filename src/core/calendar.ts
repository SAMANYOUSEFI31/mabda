/**
 * Calendar days in Asia/Tehran (IANA). Stored dates are YYYY-MM-DD.
 * `toISOString().slice(0, 10)` is wrong between 00:00 and 03:30 Iran time (still previous UTC day).
 * Single source for tehranDay (was duplicated in creditEngine). Pure.
 */

const TEHRAN = 'Asia/Tehran';
const DAY_MS = 86_400_000;

function toDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

/** Instant → calendar day in Tehran as `YYYY-MM-DD` (Gregorian label). */
export function tehranDay(input: Date | string | number = Date.now()): string {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA yields YYYY-MM-DD; same form as the previous creditEngine helper
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * First calendar day of the **Jalali** month that contains `input`, as Gregorian `YYYY-MM-DD` in Tehran.
 * Product UI is Persian; «از اول ماه» means ۱ ماه جلالی, not the 1st of the Gregorian month.
 */
export function tehranJalaliStartOfMonth(input: Date | string | number = Date.now()): string {
  let d = toDate(input);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: TEHRAN,
    day: 'numeric',
  });
  for (let i = 0; i < 40; i++) {
    const day = Number(fmt.format(d));
    if (day === 1) return tehranDay(d);
    d = new Date(d.getTime() - DAY_MS);
  }
  return tehranDay(input);
}

/** @deprecated use tehranJalaliStartOfMonth — kept name briefly for call sites that meant «اول ماه» */
export function tehranStartOfMonth(input: Date | string | number = Date.now()): string {
  return tehranJalaliStartOfMonth(input);
}

/** Whole calendar days between two instants in Tehran (date labels only). */
export function tehranCalendarDaysBetween(from: Date | string | number, to: Date | string | number): number {
  const a = tehranDay(from);
  const b = tehranDay(to);
  if (!a || !b) return 0;
  return Math.floor((Date.parse(`${b}T12:00:00.000Z`) - Date.parse(`${a}T12:00:00.000Z`)) / DAY_MS);
}

/** `YYYY-MM-DD` is a real Gregorian date (rejects 2026-02-30). */
export function isGregorianDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
