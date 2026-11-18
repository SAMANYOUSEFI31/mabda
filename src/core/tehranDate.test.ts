/**
 * CORE-01 … CORE-04: days follow the Tehran calendar everywhere. Each case below failed before the fix (UTC days and
 * millisecond windows), and the comment says how it failed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, jalaliMonthStart, tehranDay, tehranDayEnd, tehranDayStart } from './tehranDate';
import { isExpired } from './validity';
import { assumptionsDue } from './assumptions';
import { customRange, presetMoments, truthAt } from './truthCompare';
import { reviewDue, reviewWindowStart } from './weeklyReview';
import type { ContextChange, ContextObject } from '../types';

// 00:30 on 25 Aban 1405 (16 Nov 2026) in Tehran is still 15 Nov in UTC
const AFTER_MIDNIGHT = new Date('2026-11-15T21:00:00Z');

test('one source: the Tehran day, its first and last moment, calendar days', () => {
  assert.equal(tehranDay(AFTER_MIDNIGHT), '2026-11-16');
  assert.equal(tehranDayStart('2026-11-16'), '2026-11-15T20:30:00.000Z');
  assert.equal(tehranDayEnd('2026-11-16'), '2026-11-16T20:29:59.999Z');
  assert.equal(daysBetween('2026-11-09', '2026-11-16'), 7);
});

const obj = (p: Partial<ContextObject>): ContextObject => ({ id: 'x', workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 't', content: 'c', nodeId: 'n', version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...p });

test('CORE-01: a picked date means all of that day in Tehran, not a day earlier', () => {
  const o = obj({ validUntil: '2026-11-15' });
  // midday on the 15th: valid (truthAt used to read the date as 00:00 UTC, i.e. already over at 03:30 Tehran on the 15th)
  assert.equal(truthAt({ objects: [o], changes: [] }, '2026-11-15T09:00:00Z').has('x'), true);
  // 00:30 on the 16th in Tehran: over (isExpired used to wait until 23:59 UTC, i.e. 03:29 the next morning in Tehran)
  assert.equal(isExpired(o, AFTER_MIDNIGHT), true);
  assert.equal(isExpired(o, '2026-11-15T20:00:00Z'), false, '23:30 on the 15th in Tehran');
  // «تا روز ۲۴ آبان» in the comparison: a change at 00:30 on the 25th is not in it (the UTC end of day used to take it in)
  const created: ContextChange = { id: 'c1', workspaceId: 'w', objectId: 'y', kind: 'created', fromVersion: 0, toVersion: 1, at: AFTER_MIDNIGHT.toISOString(), actor: 'user', after: { title: 't', content: 'c', type: 'Fact', nodeId: 'n', status: 'Confirmed' } } as ContextChange;
  const y = obj({ id: 'y', createdAt: AFTER_MIDNIGHT.toISOString() });
  const r = customRange('2026-11-14', '2026-11-15');
  assert.equal(truthAt({ objects: [y], changes: [created] }, r.b).has('y'), false);
  // «از روز ۲۵ آبان»: a change at 00:30 on the 25th IS in it (the range starts at the start of the picked day, not its end)
  const r2 = customRange('2026-11-16', '2026-11-16');
  assert.equal(r2.a, tehranDayStart('2026-11-16'));
  assert.equal(truthAt({ objects: [y], changes: [created] }, r2.a).has('y'), false);
  assert.equal(truthAt({ objects: [y], changes: [created] }, r2.b).has('y'), true);
});

test('CORE-02: «today» for engines is the Tehran day', () => {
  // reviewBy 16 Nov is due at 00:30 on 16 Nov in Tehran (the UTC day said 15 Nov: not yet)
  const a = obj({ type: 'Fact', assumption: true, reviewBy: '2026-11-16' });
  assert.deepEqual(assumptionsDue([a], AFTER_MIDNIGHT).map((o) => o.id), ['x']);
});

test('CORE-03: «از اول ماه» is the first of the Jalali month in Tehran', () => {
  const now = new Date('2026-11-15T09:00:00Z'); // 24 Aban 1405
  assert.equal(jalaliMonthStart(now), '2026-10-23'); // 1 Aban 1405
  // used to be 1 November (the Gregorian month in UTC)
  assert.equal(presetMoments(now, []).startOfMonth, tehranDayStart('2026-10-23'));
});

test('CORE-04: the weekly review is due by calendar days since the last review, and covers what came after it', () => {
  const last = '2026-11-08T20:00:00Z'; // 23:30 on Saturday 8 Nov in Tehran
  const now = new Date('2026-11-15T06:00:00Z'); // 09:30 on Saturday 15 Nov: a week later by the calendar (6 d 10 h by the clock)
  assert.equal(reviewDue(last, { total: 3 }, now), true);
  assert.equal(reviewDue(last, { total: 3 }, new Date('2026-11-14T19:00:00Z')), false, 'Friday 22:30: not yet');
  // the review shows what changed since the last review, not a sliding 7×24 h window
  assert.equal(reviewWindowStart(last, now), last);
  assert.equal(reviewWindowStart(null, now), tehranDayStart('2026-11-08'));
});
