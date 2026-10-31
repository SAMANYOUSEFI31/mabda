/**
 * Persian display helpers (Bushido "Content & numbers" rules).
 * Display: Persian digits, thousands separator «٬», Jalali dates via Intl `fa-IR-u-ca-persian`.
 * Stored / imported data: Latin digits and ISO dates. Normalize input with `toLatinDigits`.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const THOUSANDS_SEPARATOR = '٬';
export const DECIMAL_SEPARATOR = '٫';
/** Week starts on Saturday in the Jalali calendar. */
export const WEEK_START_DAY = 6;
const TEHRAN = 'Asia/Tehran';

/** Latin digits -> Persian digits (any other character is kept). */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits -> Latin digits. Also normalizes ٫ ٬ ، separators. */
export function toLatinDigits(value: string | number): string {
  return String(value)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .replace(/[٬،]/g, ',');
}

/** Parse user input in any digit system. Returns NaN when it is not a number. */
export function parseNumberInput(value: string): number {
  const cleaned = toLatinDigits(value).replace(/[,\s]/g, '');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
}

/** 1234567.5 -> ۱٬۲۳۴٬۵۶۷٫۵ (max `maxFractionDigits`, default 0). */
export function formatNumber(value: number, maxFractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—';
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(maxFractionDigits);
  const [intPart, fraction] = fixed.split('.');
  const trimmed = fraction ? fraction.replace(/0+$/, '') : '';
  const body = groupThousands(intPart) + (trimmed ? DECIMAL_SEPARATOR + trimmed : '');
  return toFaDigits((negative ? '-' : '') + body).replace(/-/, '−');
}

/** 0.256 -> ۲۶٪  (input is a ratio). */
export function formatPercent(ratio: number, maxFractionDigits = 0): string {
  return `${formatNumber(ratio * 100, maxFractionDigits)}٪`;
}

/** Percent from an already-scaled value: 26 -> ۲۶٪ */
export function formatPercentValue(percent: number, maxFractionDigits = 0): string {
  return `${formatNumber(percent, maxFractionDigits)}٪`;
}

/** Credits are whole numbers shown with a unit word. */
export function formatCredits(value: number): string {
  return `${formatNumber(Math.round(value))} اعتبار`;
}

export function formatUsd(value: number, maxFractionDigits = 2): string {
  return `${formatNumber(value, maxFractionDigits)} دلار`;
}

type DateInput = string | number | Date;

function toDate(input: DateInput): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_FORMAT = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: TEHRAN,
});
const DATE_SHORT_FORMAT = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TEHRAN,
});
const TIME_FORMAT = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TEHRAN,
});

/** ISO -> «۱۰ آبان ۱۴۰۵». Returns '' for invalid input. */
export function formatJalaliDate(input: DateInput): string {
  const d = toDate(input);
  return d ? DATE_FORMAT.format(d) : '';
}

/** ISO -> «۱۴۰۵/۰۸/۱۰». */
export function formatJalaliShort(input: DateInput): string {
  const d = toDate(input);
  return d ? DATE_SHORT_FORMAT.format(d) : '';
}

/** ISO -> «۱۰ آبان ۱۴۰۵، ۱۴:۳۰». */
export function formatJalaliDateTime(input: DateInput): string {
  const d = toDate(input);
  return d ? `${DATE_FORMAT.format(d)}، ${TIME_FORMAT.format(d)}` : '';
}

/** ISO -> «۱۴:۳۰». */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  return d ? TIME_FORMAT.format(d) : '';
}
