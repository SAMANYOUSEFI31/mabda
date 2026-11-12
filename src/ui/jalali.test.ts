/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, isLeapJ, isoToJ, jToIso, monthGrid, monthLength, parseJalaliInput, weekdaySat } from './jalali';

test('known days convert both ways', () => {
  assert.deepEqual(isoToJ('2026-11-11'), { jy: 1405, jm: 8, jd: 20 });
  assert.deepEqual(isoToJ('2025-03-21'), { jy: 1404, jm: 1, jd: 1 });
  assert.deepEqual(isoToJ('2024-03-20'), { jy: 1403, jm: 1, jd: 1 });
  assert.equal(jToIso({ jy: 1403, jm: 12, jd: 30 }), '2025-03-20'); // 1403 is leap
  for (let d = 0; d < 800; d += 7) { const iso = new Date(Date.UTC(2024, 0, 1 + d)).toISOString().slice(0, 10); assert.equal(jToIso(isoToJ(iso)!), iso); }
});

test('leap years and month lengths', () => {
  assert.equal(isLeapJ(1403), true);
  assert.equal(isLeapJ(1404), false);
  assert.equal(monthLength(1404, 12), 29);
  assert.equal(monthLength(1405, 1), 31);
  assert.equal(monthLength(1405, 7), 30);
});

test('the grid starts on Saturday', () => {
  assert.equal(weekdaySat('2026-11-14'), 0); // a Saturday
  assert.equal(weekdaySat('2026-11-13'), 6); // a Friday
  const g = monthGrid(1405, 8);
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(g.flat().filter(Boolean).length, 30);
  assert.equal(g.flat().find(Boolean), jToIso({ jy: 1405, jm: 8, jd: 1 }));
});

test('months move with the day clamped', () => {
  assert.equal(addMonths(jToIso({ jy: 1405, jm: 6, jd: 31 }), 1), jToIso({ jy: 1405, jm: 7, jd: 30 }));
  assert.equal(addMonths(jToIso({ jy: 1405, jm: 1, jd: 10 }), -1), jToIso({ jy: 1404, jm: 12, jd: 10 }));
});

test('what she types is read; impossible days are refused', () => {
  const today = '2026-11-11'; // ۲۰ آبان ۱۴۰۵، چهارشنبه
  assert.equal(parseJalaliInput('امروز', today), today);
  assert.equal(parseJalaliInput('فردا', today), '2026-11-12');
  assert.equal(parseJalaliInput('شنبه', today), '2026-11-14');
  assert.equal(parseJalaliInput('چهارشنبه', today), '2026-11-18', 'the same weekday means next week');
  assert.equal(parseJalaliInput('۲۰ آبان', today), today);
  assert.equal(parseJalaliInput('۱ فروردین ۱۴۰۶', today), jToIso({ jy: 1406, jm: 1, jd: 1 }));
  assert.equal(parseJalaliInput('۱۴۰۵/۸/۲۰', today), today);
  assert.equal(parseJalaliInput('1405-08-20', today), today);
  assert.equal(parseJalaliInput('۳۱ مهر', today), null);
  assert.equal(parseJalaliInput('بعداً', today), null);
});
