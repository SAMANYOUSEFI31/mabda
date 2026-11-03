import test from 'node:test';
import assert from 'node:assert/strict';
import { draftsLabel, milestoneLabel, newestFirst, reasonAllowed, versionHistory } from './versionHistory';
import type { ContextChange } from '../types';

let n = 0;
const ch = (p: Partial<ContextChange> & Pick<ContextChange, 'kind' | 'fromVersion' | 'toVersion' | 'at'>): ContextChange => ({ id: `c${++n}`, workspaceId: 'w', objectId: 'o1', actor: 'user', ...p });
const FA = (x: number) => String(x).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

// created as a draft (Proposed), edited twice, accepted, then edited once more while confirmed
const path = () => [
  ch({ kind: 'created', fromVersion: 0, toVersion: 1, at: '2026-03-01T10:00:00Z', actor: 'mcp', after: { status: 'Proposed', title: 'الف' } }),
  ch({ kind: 'edited', fromVersion: 1, toVersion: 2, at: '2026-03-02T10:00:00Z', before: { content: 'a' }, after: { content: 'b' } }),
  ch({ kind: 'edited', fromVersion: 2, toVersion: 3, at: '2026-03-03T10:00:00Z', before: { content: 'b' }, after: { content: 'c' } }),
  ch({ kind: 'proposal_accepted', fromVersion: 3, toVersion: 3, at: '2026-03-04T10:00:00Z', before: { status: 'Proposed' }, after: { status: 'Confirmed' } }),
  ch({ kind: 'edited', fromVersion: 3, toVersion: 4, at: '2026-03-10T10:00:00Z', reason: 'قیمت عوض شد', before: { content: 'c' }, after: { content: 'd' } }),
];

test('drafts before an approval are grouped and closed by it: «۳ پیش‌نویس» → «تأیید شد در نسخهٔ ۳»', () => {
  const h = versionHistory(path());
  assert.deepEqual(h.entries.map((e) => e.type), ['drafts', 'milestone', 'milestone']);
  const [d, m1, m2] = h.entries as any[];
  assert.equal(d.count, 3, 'the creation counts as the first draft');
  assert.equal(draftsLabel(d, FA), '۳ پیش‌نویس');
  assert.deepEqual([d.fromVersion, d.toVersion], [1, 3]);
  assert.equal(m1.how, 'accepted');
  assert.equal(milestoneLabel(m1, FA), 'تأیید شد در نسخهٔ ۳');
  assert.equal(m2.how, 'edited');
  assert.equal(milestoneLabel(m2, FA), 'ویرایش تأییدشده → نسخهٔ ۴');
  assert.equal(m2.reason, 'قیمت عوض شد', 'the reason of a confirmed edit is kept on its row');
  assert.deepEqual(h.lastApproval, { version: 4, at: '2026-03-10T10:00:00Z', how: 'edited' });
  assert.equal(h.draftsSinceApproval, 0);
  assert.equal(h.status, 'Confirmed');
});

test('the version counter is untouched: every content edit still has its own version in the grouped drafts', () => {
  const h = versionHistory(path());
  const all = h.entries.flatMap((e) => (e.type === 'event' ? [e.change] : e.changes));
  assert.deepEqual(all.map((c) => c.toVersion), [1, 2, 3, 3, 4]);
});

test('an object entered as Confirmed has one milestone and no drafts', () => {
  const h = versionHistory([ch({ kind: 'created', fromVersion: 0, toVersion: 1, at: '2026-03-01T00:00:00Z', after: { status: 'Confirmed' } })]);
  assert.deepEqual(h.entries.map((e) => e.type), ['milestone']);
  assert.equal(milestoneLabel(h.entries[0] as any, FA), 'ثبت و تأیید شد در نسخهٔ ۱');
});

test('a never-approved object: only drafts, and the badge «آخرین تأیید» is absent', () => {
  const h = versionHistory(path().slice(0, 3));
  assert.deepEqual(h.entries.map((e) => e.type), ['drafts']);
  assert.equal(h.lastApproval, undefined);
  assert.equal(h.draftsSinceApproval, 3);
});

test('after an approval, flagging «نیاز به بازبینی» and editing makes new drafts that the next approval closes', () => {
  const more = [
    ...path(),
    ch({ kind: 'status_changed', fromVersion: 4, toVersion: 4, at: '2026-04-01T00:00:00Z', before: { status: 'Confirmed' }, after: { status: 'Needs Review' } }),
    ch({ kind: 'edited', fromVersion: 4, toVersion: 5, at: '2026-04-02T00:00:00Z', after: { content: 'e' } }),
    ch({ kind: 'edited', fromVersion: 5, toVersion: 6, at: '2026-04-03T00:00:00Z', after: { content: 'f' } }),
  ];
  const open = versionHistory(more);
  assert.equal(open.draftsSinceApproval, 2);
  assert.equal(open.lastApproval?.version, 4, 'the last approval stays the last approval until a new one');
  const closed = versionHistory([...more, ch({ kind: 'status_changed', fromVersion: 6, toVersion: 6, at: '2026-04-04T00:00:00Z', before: { status: 'Needs Review' }, after: { status: 'Confirmed' } })]);
  const types = closed.entries.map((e) => e.type);
  assert.deepEqual(types, ['drafts', 'milestone', 'milestone', 'event', 'drafts', 'milestone']);
  assert.equal((closed.entries[4] as any).count, 2);
  assert.equal(closed.lastApproval?.version, 6);
});

test('moves, links and other no-version records are quiet rows; they never break a run of drafts', () => {
  const h = versionHistory([
    ch({ kind: 'created', fromVersion: 0, toVersion: 1, at: '2026-03-01T00:00:00Z', after: { status: 'Proposed' } }),
    ch({ kind: 'edited', fromVersion: 1, toVersion: 1, at: '2026-03-02T00:00:00Z', before: { nodeId: 'a' }, after: { nodeId: 'b' } }),
    ch({ kind: 'edited', fromVersion: 1, toVersion: 2, at: '2026-03-03T00:00:00Z', after: { content: 'x' } }),
  ]);
  const drafts = h.entries.find((e) => e.type === 'drafts') as any;
  assert.equal(drafts.count, 2);
  assert.equal(h.entries.filter((e) => e.type === 'event').length, 1);
});

test('superseded / archived are events; input order does not matter; newestFirst reverses', () => {
  const list = [
    ch({ kind: 'superseded', fromVersion: 4, toVersion: 5, at: '2026-05-01T00:00:00Z', before: { status: 'Confirmed' }, after: { status: 'Superseded' } }),
    ...path(),
  ];
  const h = versionHistory(list);
  assert.equal(h.entries[h.entries.length - 1].type, 'event');
  assert.deepEqual(versionHistory([...list].reverse()).entries.map((e) => e.id), h.entries.map((e) => e.id));
  assert.equal(newestFirst(h)[0].type, 'event');
});

test('a reason is allowed only for confirmed knowledge, never for a draft', () => {
  assert.equal(reasonAllowed('Confirmed'), true);
  for (const s of ['Proposed', 'Needs Review', 'Superseded', 'Archived', undefined] as const) assert.equal(reasonAllowed(s), false, String(s));
});
