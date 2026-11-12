/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The solar (Jalali) calendar for the date field (components.md «تقویم»): conversion, month grid and reading what she types.
 * Pure and deterministic; the conversion is the standard arithmetic of jalaali-js (Borkowski's leap rule), no Intl needed.
 * A date travels as ISO `YYYY-MM-DD` (the value the browser's date input used to give), so callers and the server do not change.
 */

export interface JDate { jy: number; jm: number; jd: number }

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621;
  let leapJ = -14, jp = BREAKS[0], jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn: number): JDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export const isLeapJ = (jy: number) => jalCal(jy).leap === 0;
export const monthLength = (jy: number, jm: number) => (jm <= 6 ? 31 : jm <= 11 ? 30 : isLeapJ(jy) ? 30 : 29);

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO `YYYY-MM-DD` → Jalali; null for anything else */
export function isoToJ(iso: string): JDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return d2j(g2d(+m[1], +m[2], +m[3]));
}
export function jToIso({ jy, jm, jd }: JDate): string {
  const g = d2g(j2d(jy, jm, jd));
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}
/** move by whole days (negative = back) */
export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const g = d2g(g2d(+m[1], +m[2], +m[3]) + days);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}
/** same day in the month `delta` months away, clamped to that month's length */
export function addMonths(iso: string, delta: number): string {
  const j = isoToJ(iso);
  if (!j) return iso;
  const t = j.jm - 1 + delta;
  const jy = j.jy + Math.floor(t / 12), jm = ((t % 12) + 12) % 12 + 1;
  return jToIso({ jy, jm, jd: Math.min(j.jd, monthLength(jy, jm)) });
}
/** 0 = شنبه … 6 = جمعه */
export function weekdaySat(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return 0;
  return (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() + 1) % 7;
}

export const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const J_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

/** the month's weeks, Saturday first; days outside the month are null */
export function monthGrid(jy: number, jm: number): Array<Array<string | null>> {
  const first = jToIso({ jy, jm, jd: 1 });
  const lead = weekdaySat(first);
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = 0; d < monthLength(jy, jm); d++) cells.push(addDays(first, d));
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** today in Tehran as ISO (the product's clock; format.ts uses the same zone) */
export function todayIso(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p;
}

const latin = (s: string) => s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
const norm = (s: string) => latin(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, '').trim();

/**
 * what she typed → ISO, or null when it is not a date. Reads «امروز»، «فردا»، «پس‌فردا»، «شنبه» (the next one),
 * «۲۰ آبان» (this year), «۲۰ آبان ۱۴۰۵», «۱۴۰۵/۸/۲۰» and «۱۴۰۵-۰۸-۲۰». An impossible day («۳۱ مهر») is null, never rolled over.
 */
export function parseJalaliInput(text: string, today: string = todayIso()): string | null {
  const s = norm(text);
  if (!s) return null;
  if (s === 'امروز') return today;
  if (s === 'فردا') return addDays(today, 1);
  if (s === 'پسفردا' || s === 'پس فردا') return addDays(today, 2);
  const wd = J_WEEKDAYS.map((w) => w.replace(/‌/g, '')).indexOf(s);
  if (wd >= 0) { const diff = (wd - weekdaySat(today) + 7) % 7 || 7; return addDays(today, diff); }
  const ok = (jy: number, jm: number, jd: number) => (jm >= 1 && jm <= 12 && jd >= 1 && jd <= monthLength(jy, jm) ? jToIso({ jy, jm, jd }) : null);
  let m = /^(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})$/.exec(s);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\s+(\S+)(?:\s+(\d{4}))?$/.exec(s);
  if (m) {
    const jm = J_MONTHS.indexOf(m[2]) + 1;
    if (!jm) return null;
    return ok(m[3] ? +m[3] : isoToJ(today)!.jy, jm, +m[1]);
  }
  return null;
}
