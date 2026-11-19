import test from 'node:test';
import assert from 'node:assert/strict';
import { actionProps, categoryOf, cleanProps, computeKpis, eventsCsv, uiLabel } from './activity.ts';
import type { ActivityEvent } from './activity.ts';

let n = 0;
const ev = (userId: string, at: string, name: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({ id: `e${String(++n).padStart(4, '0')}`, userId, kind: name.includes('/') ? 'action' : 'ui', name, at, ...(name.includes('/') ? { status: 200 } : {}), ...extra });
const persons = [{ id: 'a', name: 'الف', role: 'tester' }, { id: 'b', name: 'ب', role: 'tester' }, { id: 'c', name: 'ج', role: 'tester' }, { id: 'owner', name: 'صاحب', role: 'owner' }];

test('props keep labels and numbers only; quoted parts of a dialog title are cut out', () => {
  assert.deepEqual(cleanProps({ tab: 'home', n: 3.14159, ok: true, text: 'سلام دنیا', evil: 'a'.repeat(80), 'bad key': 'x' }), { tab: 'home', n: 3.14, ok: true });
  assert.equal(uiLabel('حذف «پروژهٔ مخفی»'), 'حذف …');
  assert.equal(uiLabel('انتقال و اتصال: عنوان شخصی'), 'انتقال و اتصال');
  assert.equal(uiLabel('گفتگوی متمرکز · نام بخش'), 'گفتگوی متمرکز');
  assert.deepEqual(actionProps({ type: 'Fact', status: 'Confirmed', title: 'abc', content: 'سلام', source: { kind: 'paste' }, items: [1, 2] }), { type: 'Fact', status: 'Confirmed', sourceKind: 'paste', chars: 7, items: 2 });
  assert.equal(actionProps({ status: 'خیلی شخصی' }), undefined);
});

test('routes map to what they mean', () => {
  assert.equal(categoryOf('POST /workspaces/:wid/notes'), 'capture');
  assert.equal(categoryOf('POST /workspaces/:wid/objects'), 'knowledge');
  assert.equal(categoryOf('POST /workspaces/:wid/objects/:id/draft/approve'), 'confirm');
  assert.equal(categoryOf('DELETE /workspaces/:wid/notes/:id'), 'remove');
  assert.equal(categoryOf('PATCH /workspaces/:wid/objects/:id'), 'edit');
  assert.equal(categoryOf('POST /workspaces/:wid/nodes'), 'organize');
  assert.equal(categoryOf('POST /workspaces/:wid/packs'), 'output');
});

test('measures: activation, time to first truth, return days, active time, funnel, dialogs, errors', () => {
  const evs: ActivityEvent[] = [
    // A: arrives 10:00 Tehran (06:30Z) on day 0, writes a note, confirms after 12 minutes, comes back on day 1 and day 4
    ev('a', '2026-11-20T06:30:00.000Z', 'session_start', { sessionId: 'v_a1' }),
    ev('a', '2026-11-20T06:31:00.000Z', 'dialog_open', { props: { title: 'افزودن' }, sessionId: 'v_a1' }),
    ev('a', '2026-11-20T06:33:00.000Z', 'POST /workspaces/:wid/notes', { sessionId: 'v_a1' }),
    ev('a', '2026-11-20T06:33:01.000Z', 'dialog_close', { props: { title: 'افزودن' }, ms: 121_000, sessionId: 'v_a1' }),
    ev('a', '2026-11-20T06:42:00.000Z', 'POST /workspaces/:wid/objects', { props: { status: 'Proposed' }, sessionId: 'v_a1' }),
    ev('a', '2026-11-20T06:42:00.500Z', 'POST /workspaces/:wid/objects/:id/draft/approve', { sessionId: 'v_a1' }),
    ev('a', '2026-11-21T07:00:00.000Z', 'view', { props: { tab: 'home' }, sessionId: 'v_a2' }),
    ev('a', '2026-11-24T07:00:00.000Z', 'view', { props: { tab: 'thinking' }, sessionId: 'v_a3' }),
    // B: arrives, opens «افزودن», gives up, one refused request and one failure; never returns
    ev('b', '2026-11-20T08:00:00.000Z', 'session_start', { sessionId: 'v_b1' }),
    ev('b', '2026-11-20T08:01:00.000Z', 'dialog_open', { props: { title: 'افزودن' }, sessionId: 'v_b1' }),
    ev('b', '2026-11-20T08:02:00.000Z', 'dialog_close', { props: { title: 'افزودن' }, ms: 60_000, sessionId: 'v_b1' }),
    ev('b', '2026-11-20T08:03:00.000Z', 'POST /workspaces/:wid/objects', { status: 400, sessionId: 'v_b1' }),
    ev('b', '2026-11-20T08:04:00.000Z', 'POST /workspaces/:wid/notes', { status: 500, sessionId: 'v_b1' }),
    // the owner's own use is not part of the testers' measures
    ev('owner', '2026-11-20T09:00:00.000Z', 'POST /workspaces/:wid/notes'),
  ];
  const k = computeKpis(evs, persons, { now: new Date('2026-11-25T00:00:00Z'), clientErrors: { b: 2 } });
  const a = k.people.find((p) => p.id === 'a')!; const b = k.people.find((p) => p.id === 'b')!; const c = k.people.find((p) => p.id === 'c')!;
  assert.equal(a.minutesToFirstConfirm, 12); assert.equal(a.minutesToFirstCapture, 3);
  assert.equal(a.activated, true); assert.equal(a.coreLoop, true);
  assert.equal(a.returnedD1, true); assert.equal(a.returnedD3plus, true);
  assert.equal(a.activeDays, 3); assert.equal(a.sessions, 3);
  assert.equal(a.activeMinutes, 3, 'gaps of 1 + 2 min (and a second) count; the 9-minute gap and the days between do not');
  assert.equal(a.confirms, 1); assert.equal(a.captures, 2);
  assert.deepEqual(a.tabs, { home: 1, thinking: 1 });
  assert.equal(b.activated, false); assert.equal(b.refused, 1); assert.equal(b.broke, 1); assert.equal(b.clientErrors, 2); assert.equal(b.returnedD1, false);
  assert.equal(c.firstAt, undefined);
  assert.equal(k.summary.people, 3);
  assert.equal(k.summary.activated, 1);
  assert.deepEqual(k.funnel.map((f) => f.people), [3, 2, 1, 1, 1, 1]);
  assert.equal(k.summary.medianMinutesToFirstConfirm, 12);
  assert.equal(k.summary.refusedPer100, 20); assert.equal(k.summary.brokePer100, 20);
  assert.deepEqual(k.dialogs, [{ title: 'افزودن', opens: 2, completed: 1, medianSeconds: 90.5 }]);
  assert.equal(k.categories.capture, 1); // B's failed note is not a capture; the owner's is not counted
});

test('CSV: one line per event, quoted where needed, with a BOM for spreadsheets', () => {
  const csv = eventsCsv([ev('a', '2026-11-20T06:30:00.000Z', 'view', { props: { tab: 'home', x: 1 } })], persons);
  const [head, line] = csv.replace('﻿', '').split('\r\n');
  assert.ok(csv.startsWith('﻿'));
  assert.equal(head, 'at,tehran_day,user_id,person,role,session_id,space_id,kind,name,category,status,ms,props');
  assert.equal(line, '2026-11-20T06:30:00.000Z,2026-11-20,a,الف,tester,,,ui,view,,,,"{""tab"":""home"",""x"":1}"');
});

test('an action on one of Mabda\'s examples is recorded but is not the person\'s own work', () => {
  const evs: ActivityEvent[] = [
    ev('a', '2026-11-20T06:30:00.000Z', 'session_start'),
    ev('a', '2026-11-20T06:31:00.000Z', 'POST /workspaces/:wid/objects/:id/draft/approve', { props: { sampleItem: true } }),
    ev('a', '2026-11-20T06:32:00.000Z', 'POST /workspaces/:wid/notes', { props: { sample: true } }),
    ev('a', '2026-11-20T06:33:00.000Z', 'PATCH /workspaces/:wid/objects/:id', { props: { status: 'Confirmed', sampleItem: true } }),
  ];
  const a = computeKpis(evs, persons).people.find((p) => p.id === 'a')!;
  assert.equal(a.actions, 3);
  assert.equal(a.confirms, 0); assert.equal(a.captures, 0); assert.equal(a.activated, false);
  assert.equal(a.sampleShare, 1);
});

test('«پایش» in the test record: monitors made or linked on a truth, numbers recorded, and who still recorded on a later day (§۴۲)', () => {
  // the request body says only whether a number is put on a truth and how many numbers came in, never which
  assert.deepEqual(actionProps({ objectId: 'obj_1', unit: 'کیلو', cadence: 'week' }), { onTruth: true });
  assert.deepEqual(actionProps({ entries: [{ metricId: 'm', value: 1 }, { metricId: 'n', value: 2 }] }), { items: 2 });
  const evs = [
    ev('a', '2026-11-20T06:00:00Z', 'POST /workspaces/:wid/metrics', { props: { onTruth: true } }),
    ev('a', '2026-11-20T06:01:00Z', 'POST /workspaces/:wid/measurements/batch', { props: { items: 1 } }),
    ev('a', '2026-11-24T06:00:00Z', 'POST /workspaces/:wid/measurements/batch', { props: { items: 2 } }),
    ev('b', '2026-11-20T06:00:00Z', 'PUT /workspaces/:wid/metrics/:id', { props: { onTruth: true } }),
    ev('b', '2026-11-20T06:02:00Z', 'PUT /workspaces/:wid/metrics/:id', {}), // editing a monitor is not linking
    ev('c', '2026-11-20T06:00:00Z', 'POST /workspaces/:wid/metrics', { props: { onTruth: true, sample: true } }), // in a sample: not her own
  ];
  const k = computeKpis(evs, persons, { now: new Date('2026-11-25T00:00:00Z') });
  const p = (id: string) => k.people.find((x) => x.id === id)!;
  assert.deepEqual([p('a').monitors, p('a').monitorLinks, p('a').numbers, p('a').monitorKept], [1, 0, 3, true]);
  assert.deepEqual([p('b').monitors, p('b').monitorLinks, p('b').numbers, p('b').monitorKept], [0, 1, 0, false]);
  assert.equal(p('c').monitors, 0);
  assert.equal(k.summary.monitoring, 2);
  assert.equal(k.summary.monitoringKept, 1);
});
