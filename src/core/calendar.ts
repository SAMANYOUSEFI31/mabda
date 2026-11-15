/**
 * Calendar days in Asia/Tehran (IANA). Stored dates are YYYY-MM-DD; comparing them to
 * `toISOString().slice(0, 10)` is wrong between 00:00 and 03:30 Iran time (still previous UTC day).
 * Pure.
 */

const TEHRAN = 'Asia/Tehran';

const DAY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TEHRAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

/** Instant → calendar day in Tehran as `YYYY-MM-DD`. */
export function tehranDay(input: Date | string | number = Date.now()): string {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return '';
  const parts = DAY_PARTS.formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

/** First calendar day of the Tehran month that contains `input` (`YYYY-MM-DD`). */
export function tehranStartOfMonth(input: Date | string | number = Date.now()): string {
  const day = tehranDay(input);
  return day ? `${day.slice(0, 8)}01` : '';
}

/** `YYYY-MM-DD` is a real Gregorian date (rejects 2026-02-30). */
export function isGregorianDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
