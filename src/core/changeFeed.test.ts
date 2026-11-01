import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChangeFeed, summarize } from './changeFeed';
import type { VersionRow } from './changeFeed';
import type { ContextObject, GeneratedDeliverable } from '../types';

const NOW = new Date('2026-11-10T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const obj = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'business', version: 1, createdAt: day(30), updatedAt: day(30), ...p,
});
const del = (id: string, used: Array<[string, number]>): GeneratedDeliverable => ({
  id, workspaceId: 'w', workstreamId: 's', deliverableId: 'd', title: `دارایی ${id}`, content: 'm', executionMode: 'auto', creditCost: 0, usedContext: used.map(([i, version]) => ({ id: i, version })), rebuildCount: 0, createdAt: day(20),
});
const v = (objectId: string, version: number, ago: number, content: string): VersionRow => ({ objectId, version, type: 'Decision', title: `عنوان ${objectId}`, content, createdAt: day(ago) });

test('last 7 days only: created and edited events with before/after, newest first', () => {
  const feed = buildChangeFeed({
    now: NOW, objects: [obj('a', { version: 3, updatedAt: day(1) }), obj('b', { updatedAt: day(2) })], deliverables: [],
    versions: [v('a', 1, 30, 'قدیمی'), v('a', 2, 12, 'میانی'), v('a', 3, 1, 'تازه'), v('b', 1, 2, 'ب')],
  });
  assert.deepEqual(feed.map((e) => [e.kind, e.objectId, e.version]), [['edited', 'a', 3], ['created', 'b', 1]]);
  assert.deepEqual([feed[0].before, feed[0].after], ['میانی', 'تازه'], 'the previous version may lie outside the window');
  assert.deepEqual(buildChangeFeed({ now: NOW, objects: [obj('a')], deliverables: [], versions: [v('a', 1, 8, 'x')] }), [], '8 days ago is out');
  assert.equal(buildChangeFeed({ now: NOW, days: 30, objects: [obj('a')], deliverables: [], versions: [v('a', 1, 8, 'x')] }).length, 1);
});

test('each edit lists the assets it made stale, with the reason; unrelated and already-fresh assets are not listed', () => {
  const feed = buildChangeFeed({
    now: NOW, objects: [obj('aud', { version: 2, updatedAt: day(1), title: 'مخاطب اصلی' }), obj('price')],
    deliverables: [del('a1', [['aud', 1]]), del('a2', [['price', 1]]), del('a3', [['aud', 2]])],
    versions: [v('aud', 1, 30, 'الف'), v('aud', 2, 1, 'ب')],
  });
  assert.equal(feed.length, 1);
  assert.deepEqual(feed[0].staleAssets.map((a) => a.id), ['a1']);
  assert.match(feed[0].staleAssets[0].message, /«مخاطب اصلی» از نسخهٔ ۱ به ۲ تغییر کرد/);
  assert.deepEqual(summarize(feed), { total: 1, staleAssets: 1 });
});

test('superseded and archived objects appear when they changed state inside the window', () => {
  const feed = buildChangeFeed({
    now: NOW, deliverables: [del('a1', [['old', 1]])], versions: [],
    objects: [obj('old', { status: 'Superseded', supersededById: 'new', updatedAt: day(2) }), obj('new', { version: 2 }), obj('arch', { status: 'Archived', updatedAt: day(3) }), obj('quiet', { status: 'Archived', updatedAt: day(20) })],
  });
  assert.deepEqual(feed.map((e) => [e.kind, e.objectId]), [['superseded', 'old'], ['archived', 'arch']]);
  assert.deepEqual(feed[0].staleAssets.map((a) => a.id), ['a1']);
});
