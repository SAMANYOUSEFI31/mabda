import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStaleAssets, halfPriceRebuildAvailable, impactMessage, newlyStale } from './impactEngine';
import type { ContextObject } from '../types';

const obj = (o: Partial<ContextObject> & { id: string }): ContextObject => ({
  workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'مخاطب اصلی', content: 'x', nodeId: 'business', version: 1, createdAt: '', updatedAt: '', ...o,
});
const asset = (id: string, used: Array<[string, number]>) => ({ id, usedContext: used.map(([i, version]) => ({ id: i, version })) });

test('fresh assets are not stale', () => {
  assert.deepEqual(computeStaleAssets([asset('a1', [['c1', 2]])], [obj({ id: 'c1', version: 2 })]), []);
});

test('edit bumps version → asset is stale with a Persian reason', () => {
  const stale = computeStaleAssets([asset('a1', [['c1', 2]])], [obj({ id: 'c1', version: 3 })]);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].reasons[0].message, '«مخاطب اصلی» از نسخهٔ ۲ به ۳ تغییر کرد.');
});

test('supersede chain resolves to the head version', () => {
  const objs = [obj({ id: 'c1', status: 'Superseded', supersededById: 'c2', version: 2 }), obj({ id: 'c2', version: 3, title: 'مخاطب اصلی' })];
  const [s] = computeStaleAssets([asset('a1', [['c1', 2]])], objs);
  assert.equal(s.reasons[0].kind, 'superseded');
  assert.equal(s.reasons[0].currentId, 'c2');
  assert.match(s.reasons[0].message, /از نسخهٔ ۲ به ۳/);
});

test('archived head and removed objects are reasons too; assets without lineage are never stale', () => {
  assert.equal(computeStaleAssets([asset('a', [['c1', 1]])], [obj({ id: 'c1', status: 'Archived' })])[0].reasons[0].kind, 'archived');
  assert.equal(computeStaleAssets([asset('a', [['gone', 1]])], [])[0].reasons[0].kind, 'removed');
  assert.deepEqual(computeStaleAssets([asset('a', [])], []), []);
});

test('status-only change (Proposed → Confirmed) does not make an asset stale', () => {
  assert.deepEqual(computeStaleAssets([asset('a', [['c1', 1]])], [obj({ id: 'c1', version: 1, status: 'Confirmed' })]), []);
});

test('newlyStale counts only assets that became stale because of this change', () => {
  const dels = [asset('a1', [['c1', 1]]), asset('a2', [['c2', 1]]), asset('a3', [['c1', 1], ['c2', 1]])];
  const before = computeStaleAssets(dels, [obj({ id: 'c1' }), obj({ id: 'c2', version: 2 })]); // a2, a3 already stale
  const after = computeStaleAssets(dels, [obj({ id: 'c1', version: 2 }), obj({ id: 'c2', version: 2 })]);
  assert.deepEqual(newlyStale(before, after).map((s) => s.deliverableId).sort(), ['a1', 'a3']);
  assert.equal(impactMessage(2), 'این تغییر روی ۲ دارایی اثر دارد.');
  assert.equal(impactMessage(0), '');
});

test('half-price rebuild: once per distinct change set', () => {
  const [s] = computeStaleAssets([asset('a', [['c1', 1]])], [obj({ id: 'c1', version: 2 })]);
  assert.equal(halfPriceRebuildAvailable({}, s), true);
  assert.equal(halfPriceRebuildAvailable({ halfPriceUsedFor: s.signature }, s), false);
  const [s2] = computeStaleAssets([asset('a', [['c1', 1]])], [obj({ id: 'c1', version: 3 })]);
  assert.equal(halfPriceRebuildAvailable({ halfPriceUsedFor: s.signature }, s2), true, 'a new change re-opens the discount');
  assert.equal(halfPriceRebuildAvailable({}, undefined), false);
});

test('dependency_changed: an asset made from a dependent goes stale when what it rests on changes; reviewing clears it', () => {
  const rel = (from: string, to: string) => ({ id: `${from}>${to}`, sourceId: from, targetId: to, type: 'depends_on' as const, createdAt: '' });
  const chg = (objectId: string, kind: 'created' | 'edited' | 'review_accepted', at: string, after?: Record<string, unknown>) => ({ id: objectId + kind + at, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 2, kind, actor: 'user' as const, at, ...(after ? { after } : {}) });
  const objects = [obj({ id: 'A', title: 'بودجه', version: 2 }), obj({ id: 'B', title: 'کانال', version: 1 })];
  const dels = [asset('a1', [['B', 1]]), asset('a2', [['A', 2]])];
  const graph = { relationships: [rel('B', 'A')], changes: [chg('A', 'created', '2026-01-01T00:00:00Z'), chg('B', 'created', '2026-01-01T00:00:00Z'), chg('A', 'edited', '2026-02-01T00:00:00Z', { content: 'x' })] };
  const stale = computeStaleAssets(dels, objects, graph);
  assert.deepEqual(stale.map((s) => s.deliverableId), ['a1'], 'only the asset built from the dependent B; A itself is at the used version');
  assert.equal(stale[0].reasons[0].kind, 'dependency_changed');
  assert.equal(stale[0].reasons[0].dependencyId, 'A');
  assert.match(stale[0].reasons[0].message, /«کانال» به «بودجه» وابسته است/);
  assert.deepEqual(computeStaleAssets(dels, objects), [], 'without the graph input nothing changes (old callers)');

  const reviewed = { ...graph, changes: [...graph.changes, chg('B', 'review_accepted', '2026-02-02T00:00:00Z')] };
  assert.deepEqual(computeStaleAssets(dels, objects, reviewed), [], 'reviewed without change → fresh again');

  const later = { ...graph, changes: [...reviewed.changes, chg('A', 'edited', '2026-03-01T00:00:00Z', { content: 'y' })] };
  const again = computeStaleAssets(dels, objects, later);
  assert.equal(again.length, 1, 'a newer change flags it again');
  assert.notEqual(again[0].signature, stale[0].signature, 'new change set → the one-time half-price rebuild is available again');
});

test('dependency_changed in a cycle and with several dependents terminates and flags each dependent once', () => {
  const rel = (from: string, to: string) => ({ id: `${from}>${to}`, sourceId: from, targetId: to, type: 'depends_on' as const, createdAt: '' });
  const objects = [obj({ id: 'A' }), obj({ id: 'B' }), obj({ id: 'C' })];
  const changes = [{ id: 'e', workspaceId: 'w', objectId: 'A', fromVersion: 1, toVersion: 2, kind: 'edited' as const, actor: 'user' as const, at: '2026-02-01T00:00:00Z', after: { content: 'x' } }];
  const stale = computeStaleAssets([asset('x', [['B', 1], ['C', 1]])], objects, { relationships: [rel('A', 'B'), rel('B', 'A'), rel('C', 'B')], changes });
  assert.equal(stale.length, 1);
  assert.deepEqual(stale[0].reasons.map((r) => r.objectId).sort(), ['B', 'C']);
});

test('dependency_changed only counts changes AFTER the asset was built (a rebuild settles it)', () => {
  const rel = [{ id: 'r', sourceId: 'B', targetId: 'A', type: 'depends_on' as const, createdAt: '' }];
  const changes = [{ id: 'e', workspaceId: 'w', objectId: 'A', fromVersion: 1, toVersion: 2, kind: 'edited' as const, actor: 'user' as const, at: '2026-02-01T00:00:00Z', after: { content: 'x' } }];
  const objects = [obj({ id: 'A' }), obj({ id: 'B' })];
  const before = { ...asset('old', [['B', 1]]), createdAt: '2026-01-15T00:00:00Z' };
  const after = { ...asset('rebuilt', [['B', 1]]), createdAt: '2026-02-10T00:00:00Z' };
  assert.deepEqual(computeStaleAssets([before, after], objects, { relationships: rel, changes }).map((s) => s.deliverableId), ['old']);
});
