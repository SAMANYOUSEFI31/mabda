import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_TOP, homeActions } from './homeActions';
import type { HomeInput } from './homeActions';

const NOW = new Date('2026-06-01T10:00:00Z');
const base = (p: Partial<HomeInput> = {}): HomeInput => ({ now: NOW, stale: [], deliverables: [], contradictions: [], reviews: [], ready: [], proposedCount: 0, weekly: { due: false, changes: 0 }, dueCount: 0, ...p });
const dl = (id: string, title: string, daysAgo: number) => ({ id, title, createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString() });

test('nothing to do → no actions (the page says everything is in order)', () => {
  assert.deepEqual(homeActions(base()), { top: [], rest: [], total: 0 });
});

test('at most three, one per kind, best first: a recent stale output › contradiction › needs a look', () => {
  const r = homeActions(base({
    deliverables: [dl('a1', 'متن تبلیغ', 3), dl('a2', 'برنامهٔ محتوا', 5)],
    stale: [{ deliverableId: 'a1', reasons: [{ message: '«قیمت» از نسخهٔ ۲ به ۳ تغییر کرد.' }] }, { deliverableId: 'a2', reasons: [{ message: 'x' }] }],
    contradictions: [{ id: 'c1', titleA: 'الف', titleB: 'ب', idA: 'o1' }],
    reviews: [{ id: 'o2', title: 'قیمت اشتراک', because: ['قیمت پایه'] }],
    ready: [{ id: 'o3', title: 'کانال' }], proposedCount: 4, weekly: { due: true, changes: 6 }, dueCount: 2,
  }));
  assert.equal(r.top.length, HOME_TOP);
  assert.deepEqual(r.top.map((a) => a.kind), ['stale', 'contradiction', 'review']);
  assert.equal(r.top[0].id, 'stale:a1');
  assert.ok(r.rest.some((a) => a.id === 'stale:a2'), 'a second stale output waits in «همه»');
  assert.equal(r.total, r.top.length + r.rest.length);
  assert.deepEqual(r.rest.map((a) => a.kind).sort(), ['due', 'proposals', 'ready', 'stale', 'weekly']);
});

test('every action is one sentence and one button, in plain words (no ids, no machinery)', () => {
  const r = homeActions(base({
    deliverables: [dl('a1', 'متن تبلیغ', 1)], stale: [{ deliverableId: 'a1', reasons: [{ message: '«قیمت» تغییر کرد.' }] }],
    contradictions: [{ id: 'c1', titleA: 'الف', titleB: 'ب', idA: 'o1' }], reviews: [{ id: 'o2', title: 'قیمت اشتراک', because: ['قیمت پایه', 'لحن'] }],
    ready: [{ id: 'o3', title: 'کانال' }], proposedCount: 2, weekly: { due: true, changes: 3 }, dueCount: 1,
  }));
  for (const a of [...r.top, ...r.rest]) {
    assert.ok(a.text.length > 8 && a.button.length > 1, a.id);
    assert.ok(!/\bid\b|@v|Object|Proposed|Confirmed|Gap|stale/i.test(a.text + a.button), a.text);
  }
  assert.match(r.top.find((a) => a.kind === 'review')!.text, /«قیمت پایه»، «لحن»/);
});

test('an old stale output ranks below a contradiction; a recent one above it', () => {
  const old = homeActions(base({ deliverables: [dl('a1', 'قدیمی', 90)], stale: [{ deliverableId: 'a1', reasons: [] }], contradictions: [{ id: 'c', titleA: 'الف', titleB: 'ب', idA: 'o' }] }));
  assert.deepEqual(old.top.map((a) => a.kind), ['contradiction', 'stale']);
  const fresh = homeActions(base({ deliverables: [dl('a1', 'تازه', 2)], stale: [{ deliverableId: 'a1', reasons: [] }], contradictions: [{ id: 'c', titleA: 'الف', titleB: 'ب', idA: 'o' }] }));
  assert.deepEqual(fresh.top.map((a) => a.kind), ['stale', 'contradiction']);
});

test('deterministic and stable: same input, same order; an unknown output is skipped', () => {
  const input = base({ deliverables: [dl('a1', 'الف', 1)], stale: [{ deliverableId: 'zzz', reasons: [] }, { deliverableId: 'a1', reasons: [] }], proposedCount: 1 });
  assert.deepEqual(homeActions(input), homeActions(input));
  assert.deepEqual(homeActions(input).top.map((a) => a.id), ['stale:a1', 'proposals']);
});

test('targets: an output goes to the assets, a decision opens, the rest scroll to their section', () => {
  const r = homeActions(base({ deliverables: [dl('a1', 'الف', 1)], stale: [{ deliverableId: 'a1', reasons: [] }], ready: [{ id: 'o3', title: 'کانال' }], proposedCount: 1, contradictions: [{ id: 'c', titleA: 'الف', titleB: 'ب', idA: 'o' }], weekly: { due: true, changes: 1 }, dueCount: 1 }));
  const t = Object.fromEntries([...r.top, ...r.rest].map((a) => [a.kind, a.target]));
  assert.deepEqual(t.stale, { type: 'asset', id: 'a1' });
  assert.deepEqual(t.ready, { type: 'object', id: 'o3' });
  assert.deepEqual(t.contradiction, { type: 'contradictions' });
  assert.deepEqual(t.proposals, { type: 'proposals' });
  assert.deepEqual(t.weekly, { type: 'weekly' });
  assert.deepEqual(t.due, { type: 'due' });
});
