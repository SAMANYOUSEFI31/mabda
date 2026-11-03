import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, FEATURE_KEYS, isFeatureKey, summarizeUsage } from './usage';

test('the catalog: unique keys of a fixed shape, each with a Persian label and a level', () => {
  assert.equal(new Set(FEATURES.map((f) => f.key)).size, FEATURES.length);
  for (const f of FEATURES) { assert.match(f.key, /^[a-z]+\.[a-z-]+$/); assert.match(f.label, /[؀-ۿ]/); assert.ok([1, 2, 3].includes(f.level)); }
  assert.equal(FEATURE_KEYS.size, FEATURES.length);
});

test('only a catalog key is a feature: free text, ids and titles can never become a counter', () => {
  assert.equal(isFeatureKey('dialog.ai-request'), true);
  for (const bad of ['dialog.nope', 'قیمت اشتراک', 'dm_price2', '', null, undefined, 42, 'view.home; DROP']) assert.equal(isFeatureKey(bad), false, String(bad));
});

test('summarizeUsage: used most-first, unused by level; unknown stored keys are ignored', () => {
  const s = summarizeUsage([
    { feature: 'view.home', count: 3, lastAt: '2026-06-01T10:00:00Z' },
    { feature: 'dialog.record', count: 9, lastAt: '2026-06-02T10:00:00Z' },
    { feature: 'old.removed', count: 99, lastAt: '2026-01-01T00:00:00Z' },
  ]);
  assert.deepEqual(s.used.map((r) => r.key), ['dialog.record', 'view.home']);
  assert.ok(!s.used.some((r) => r.key === 'old.removed') && !s.unused.some((r) => r.key === 'old.removed'));
  assert.equal(s.used.length + s.unused.length, FEATURES.length);
  assert.ok(s.unused[0].level <= s.unused[s.unused.length - 1].level, 'what is unused is listed level 1 first: a core feature nobody opens is the loudest finding');
});
