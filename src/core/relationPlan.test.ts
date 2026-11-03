import test from 'node:test';
import assert from 'node:assert/strict';
import { affectPlan, affectedBy, restsOn } from './relationPlan';

const dep = (s: string, t: string) => ({ type: 'depends_on' as const, sourceId: s, targetId: t });
const rels = [dep('b', 'a'), dep('c', 'a'), dep('c', 'z'), { type: 'supersedes' as const, sourceId: 'q', targetId: 'a' }];

test('«روی چه اثر دارد» is depends_on read the other way: who depends on A, and what A depends on', () => {
  assert.deepEqual(affectedBy('a', rels).sort(), ['b', 'c']);
  assert.deepEqual(restsOn('c', rels).sort(), ['a', 'z']);
  assert.deepEqual(affectedBy('a', []), []);
});

test('affectPlan: only the objects whose dependency set changes, each with its full new set; never itself; no new relation kind', () => {
  assert.deepEqual(affectPlan('a', ['b', 'c'], rels), [], 'nothing to change');
  assert.deepEqual(affectPlan('a', ['b', 'd', 'a'], rels), [{ objectId: 'c', dependsOn: ['z'] }, { objectId: 'd', dependsOn: ['a'] }]);
  assert.deepEqual(affectPlan('a', [], rels), [{ objectId: 'b', dependsOn: [] }, { objectId: 'c', dependsOn: ['z'] }]);
  assert.deepEqual(affectPlan('n', ['c'], rels), [{ objectId: 'c', dependsOn: ['a', 'z', 'n'] }], 'a new object can affect an existing one');
});
