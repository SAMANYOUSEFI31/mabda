import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toFaDigits, toLatinDigits, parseNumberInput, formatNumber, formatPercent, formatCredits,
  formatJalaliDate, formatJalaliShort, formatJalaliDateTime,
} from './format.ts';

test('toFaDigits / toLatinDigits round-trip', () => {
  assert.equal(toFaDigits('abc 1234567890'), 'abc ۱۲۳۴۵۶۷۸۹۰');
  assert.equal(toLatinDigits('۱۲۳٤٥٦'), '123456');
  assert.equal(toLatinDigits(toFaDigits('0912')), '0912');
});

test('parseNumberInput normalizes Persian/Arabic digits and separators', () => {
  assert.equal(parseNumberInput('۱٬۲۰۰'), 1200);
  assert.equal(parseNumberInput('٣٫٥'), 3.5);
  assert.ok(Number.isNaN(parseNumberInput('abc')));
  assert.ok(Number.isNaN(parseNumberInput('')));
});

test('formatNumber groups thousands with «٬» and uses Persian digits', () => {
  assert.equal(formatNumber(0), '۰');
  assert.equal(formatNumber(999), '۹۹۹');
  assert.equal(formatNumber(1000), '۱٬۰۰۰');
  assert.equal(formatNumber(1234567), '۱٬۲۳۴٬۵۶۷');
  assert.equal(formatNumber(1234.5, 1), '۱٬۲۳۴٫۵');
  assert.equal(formatNumber(1234.0, 2), '۱٬۲۳۴');
  assert.equal(formatNumber(Number.NaN), '—');
});

test('formatPercent and formatCredits', () => {
  assert.equal(formatPercent(0.256), '۲۶٪');
  assert.equal(formatCredits(1200), '۱٬۲۰۰ اعتبار');
});

test('Jalali dates use Intl fa-IR-u-ca-persian (Tehran time)', () => {
  // 2026-03-21T12:00Z is 1 Farvardin 1405
  assert.equal(formatJalaliShort('2026-03-21T12:00:00Z'), '۱۴۰۵/۰۱/۰۱');
  assert.match(formatJalaliDate('2026-03-21T12:00:00Z'), /^۱ فروردین ۱۴۰۵$/);
  assert.match(formatJalaliDateTime('2026-03-21T12:00:00Z'), /۱۴۰۵.*،/);
  assert.equal(formatJalaliDate('not a date'), '');
});

test('Jalali dates at the Tehran midnight and at a month change (the machine\'s own time zone must not matter)', () => {
  // Tehran is UTC+3:30 (no daylight saving since 2022): 00:00 there is 20:30 UTC the evening before
  assert.equal(formatJalaliShort('2026-03-20T20:29:59Z'), '۱۴۰۴/۱۲/۲۹');
  assert.equal(formatJalaliShort('2026-03-20T20:30:00Z'), '۱۴۰۵/۰۱/۰۱');
  // 31 Shahrivar → 1 Mehr
  assert.equal(formatJalaliShort('2026-09-22T20:29:59Z'), '۱۴۰۵/۰۶/۳۱');
  assert.equal(formatJalaliShort('2026-09-22T20:30:00Z'), '۱۴۰۵/۰۷/۰۱');
  // a plain date (no time) is that Tehran day, not the previous one in a western time zone
  assert.match(formatJalaliDate('2026-03-21'), /^۱ فروردین ۱۴۰۵$/);
});
