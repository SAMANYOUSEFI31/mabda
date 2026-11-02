import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceSentence, buildWeeklyReview, outputsUsing, readinessPerWorkstream, reviewDue } from './weeklyReview';
import { WORKSTREAM_SPECS } from './specs';
import type { ContextChange, ContextObject, GeneratedDeliverable } from '../types';

const NOW = new Date('2026-03-10T12:00:00Z');
const obj = (id: string, o: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: id, nodeId: 'business', version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...o });
const chg = (id: string, objectId: string, kind: ContextChange['kind'], at: string, o: Partial<ContextChange> = {}): ContextChange => ({ id, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 2, kind, actor: 'user', at, ...o });
const dep = (from: string, to: string) => ({ id: `${from}>${to}`, sourceId: from, targetId: to, type: 'depends_on' as const, createdAt: '' });

test('three sections: what changed, what needs a review, which decisions wait', () => {
  const objects = [obj('A', { version: 2 }), obj('B'), obj('P', { status: 'Proposed' }), obj('Q', { status: 'Proposed' })];
  const rels = [dep('B', 'A'), dep('P', 'B'), dep('Q', 'P')];
  const changes = [chg('1', 'A', 'edited', '2026-03-09T10:00:00Z', { after: { content: 'x' } })];
  const w = buildWeeklyReview({ objects, relationships: rels, changes, deliverables: [], now: NOW });
  assert.equal(w.digest.total, 1);
  assert.deepEqual(w.reviews.map((r) => [r.object.id, r.dependencyTitles]), [['B', ['عنوان A']]]);
  assert.deepEqual(w.waiting.ready.map((u) => u.ids), [['P']], 'P rests on B, which is Confirmed (a review hint does not block it)');
  assert.deepEqual(w.waiting.blocked.map((u) => [u.ids, u.blockedBy]), [[['Q'], ['P']]]);
  assert.equal(w.total, 1 + 1 + 1 + 1);
});

test('an empty week has nothing to review and no marker', () => {
  const w = buildWeeklyReview({ objects: [obj('A')], relationships: [], changes: [], deliverables: [], now: NOW });
  assert.equal(w.total, 0);
  assert.equal(reviewDue(null, w, NOW), false);
});

test('reviewDue: only when something is waiting AND a week has passed since the last review (or never)', () => {
  const some = { total: 3 };
  assert.equal(reviewDue(null, some, NOW), true);
  assert.equal(reviewDue('2026-03-08T12:00:00Z', some, NOW), false);
  assert.equal(reviewDue('2026-03-03T12:00:00Z', some, NOW), true);
  assert.equal(reviewDue('2026-03-03T12:00:00Z', { total: 0 }, NOW), false);
});

test('readiness per workstream is the deterministic engine result; outputsUsing + the closing sentence', () => {
  const r = readinessPerWorkstream(WORKSTREAM_SPECS.slice(0, 2), [], []);
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.score >= 0 && x.score <= 100 && ['ready', 'needs_work', 'blocked'].includes(x.status)));
  const dels = [{ usedContext: [{ id: 'A', version: 1 }] }, { usedContext: [{ id: 'A', version: 2 }, { id: 'B', version: 1 }] }, { usedContext: [] }] as unknown as GeneratedDeliverable[];
  assert.equal(outputsUsing('A', dels), 2);
  assert.equal(outputsUsing('Z', dels), 0);
  assert.equal(acceptanceSentence('قیمت', 2, (n) => `«${n}»`), 'چون «قیمت» را تأیید کردی، «2» خروجی تو از آن استفاده می‌کنند.');
  assert.equal(acceptanceSentence('قیمت', 0, String), '');
});
