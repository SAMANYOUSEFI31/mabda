import test from 'node:test';
import assert from 'node:assert/strict';
import { MORE_CONTEXT_VIEWS, PRIMARY_CONTEXT_VIEWS, visibleFeatures } from './visibleFeatures';
import type { FeatureState } from './visibleFeatures';

const NOW = new Date('2026-06-10T10:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const empty = (p: Partial<FeatureState> = {}): FeatureState => ({ now: NOW, changes: [], relationships: [], contradictions: 0, metrics: 0, savedPacks: 0, proposed: 0, ...p });

test('a new workspace shows none of the level-2 features', () => {
  assert.deepEqual(visibleFeatures(empty()), { weeklyReview: false, waitingDecisions: false, contradictions: false, metrics: false, packs: false, proposals: false });
});

test('weekly review: only when something changed in the last 7 days (a metric or node record is not a knowledge change)', () => {
  assert.equal(visibleFeatures(empty({ changes: [{ objectId: 'o1', at: day(3) }] })).weeklyReview, true);
  assert.equal(visibleFeatures(empty({ changes: [{ objectId: 'o1', at: day(8) }] })).weeklyReview, false);
  assert.equal(visibleFeatures(empty({ changes: [{ objectId: 'metric:m1', at: day(1) }, { objectId: 'node:n1', at: day(1) }] })).weeklyReview, false);
  assert.equal(visibleFeatures(empty({ changes: [{ objectId: 'o1', at: day(7) }] })).weeklyReview, true, 'exactly seven days ago still counts');
});

test('waiting decisions need a dependency; contradictions, metrics, packs and proposals need one of their own', () => {
  assert.equal(visibleFeatures(empty({ relationships: [{ type: 'supersedes' }, { type: 'overrides' }] })).waitingDecisions, false, 'only depends_on makes an order');
  assert.equal(visibleFeatures(empty({ relationships: [{ type: 'depends_on' }] })).waitingDecisions, true);
  assert.equal(visibleFeatures(empty({ contradictions: 1 })).contradictions, true);
  assert.equal(visibleFeatures(empty({ metrics: 2 })).metrics, true);
  assert.equal(visibleFeatures(empty({ savedPacks: 1 })).packs, true);
  assert.equal(visibleFeatures(empty({ proposed: 3 })).proposals, true);
});

test('the features are independent: showing one never shows another', () => {
  const v = visibleFeatures(empty({ metrics: 1 }));
  assert.deepEqual(Object.entries(v).filter(([, on]) => on).map(([k]) => k), ['metrics']);
});

test('the table view is not a primary view; nothing is removed (it is listed under «⋯»)', () => {
  assert.deepEqual([...PRIMARY_CONTEXT_VIEWS], ['doc', 'read', 'canvas']);
  assert.deepEqual([...MORE_CONTEXT_VIEWS], ['table']);
  assert.equal(new Set([...PRIMARY_CONTEXT_VIEWS, ...MORE_CONTEXT_VIEWS]).size, 4);
});
