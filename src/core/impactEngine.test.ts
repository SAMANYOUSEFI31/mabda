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
