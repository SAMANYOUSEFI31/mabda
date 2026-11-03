import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyEdges, dependentsOf, needsReview, planDecisions } from './decisionGraph';
import type { ContextChange, ContextObject, ContextRelationship } from '../types';

const obj = (id: string, o: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: id, nodeId: 'business', version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...o,
});
/** dep('B','A') = B depends on A */
const dep = (from: string, to: string): ContextRelationship => ({ id: `${from}>${to}`, sourceId: from, targetId: to, type: 'depends_on', createdAt: '2026-01-01T00:00:00Z' });
const chg = (objectId: string, kind: ContextChange['kind'], at: string, after?: Record<string, unknown>): ContextChange => ({ id: `${objectId}${kind}${at}`, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 2, kind, actor: 'user', at, ...(after ? { after } : {}) });
const ids = (layers: ReturnType<typeof planDecisions>['layers']) => layers.map((l) => l.map((u) => u.ids.join('+')));

test('chain A ← B ← C: layers follow the order; ready vs blocked vs done', () => {
  const objects = [obj('A'), obj('B', { status: 'Proposed' }), obj('C', { status: 'Proposed' })];
  const p = planDecisions(objects, [dep('B', 'A'), dep('C', 'B')]);
  assert.deepEqual(ids(p.layers), [['A'], ['B'], ['C']]);
  assert.deepEqual(p.layers.map((l) => l[0].state), ['done', 'ready', 'blocked'], 'B can be decided (A is Confirmed); C waits for B');
  assert.deepEqual(p.layers[2][0].blockedBy, ['B']);
  assert.deepEqual(p.groups, []);
});

test('a cycle is a «concurrent decision» group, not an error; layers still work around it', () => {
  const objects = [obj('X'), obj('A', { status: 'Proposed' }), obj('B', { status: 'Proposed' }), obj('C', { status: 'Proposed' })];
  const p = planDecisions(objects, [dep('A', 'B'), dep('B', 'A'), dep('A', 'X'), dep('C', 'B')]);
  assert.deepEqual(p.groups, [['A', 'B']]);
  assert.deepEqual(ids(p.layers), [['X'], ['A+B'], ['C']]);
  assert.equal(p.layers[1][0].concurrent, true);
  assert.equal(p.layers[1][0].state, 'ready', 'its outside input X is Confirmed');
  assert.equal(p.layers[2][0].state, 'blocked');
});

test('self-loop = one-member cycle; superseded/archived objects and non depends_on relations are ignored', () => {
  const objects = [obj('A', { status: 'Proposed' }), obj('B', { status: 'Superseded' }), obj('C')];
  const rels = [dep('A', 'A'), dep('A', 'B'), { ...dep('C', 'A'), type: 'supersedes' as const }];
  assert.deepEqual(dependencyEdges(objects, rels), [{ from: 'A', to: 'A' }]);
  const p = planDecisions(objects, rels);
  assert.deepEqual(p.groups, [['A']]);
  assert.deepEqual(planDecisions([obj('A')], []).layers, [], 'objects without edges are not part of the graph');
});

test('dependentsOf: transitive, nearest first, multiple dependents, cycle-safe, never itself', () => {
  const rels = [dep('B', 'A'), dep('C', 'B'), dep('D', 'A'), dep('A', 'C')];
  assert.deepEqual(dependentsOf('A', rels), ['B', 'D', 'C']);
  assert.deepEqual(dependentsOf('D', rels), []);
  const objects = [obj('A'), obj('B', { status: 'Archived' }), obj('C'), obj('D')];
  assert.deepEqual(dependentsOf('A', rels, objects), ['D'], 'C only depends on the archived B, so it drops out of the active graph');
});

test('needsReview: a changed dependency flags the dependent (and the chain behind it) until it is reviewed or rewritten', () => {
  const objects = [obj('A'), obj('B'), obj('C')];
  const rels = [dep('B', 'A'), dep('C', 'B')];
  const none = needsReview(objects, rels, [chg('A', 'created', '2026-01-01T00:00:00Z'), chg('B', 'created', '2026-01-01T00:00:00Z')]);
  assert.equal(none.size, 0, 'nothing changed yet');

  const edited = [chg('A', 'edited', '2026-02-01T00:00:00Z', { content: 'new' })];
  const r = needsReview(objects, rels, edited);
  assert.deepEqual([...r.keys()].sort(), ['B', 'C'], 'direct and transitive dependents');
  assert.deepEqual(r.get('B')!.changedDependencies, [{ id: 'A', at: '2026-02-01T00:00:00Z' }]);

  const reviewedB = [...edited, chg('B', 'review_accepted', '2026-02-02T00:00:00Z')];
  assert.deepEqual([...needsReview(objects, rels, reviewedB).keys()], ['C'], 'accepting B unchanged clears B; C is still behind A\'s change until reviewed itself');
  const bothReviewed = [...reviewedB, chg('C', 'review_accepted', '2026-02-03T00:00:00Z')];
  assert.equal(needsReview(objects, rels, bothReviewed).size, 0);

  const rewritten = [...edited, chg('B', 'edited', '2026-02-02T00:00:00Z', { content: 'adapted' })];
  assert.equal(needsReview(objects, rels, rewritten).has('B'), false, 'editing B itself counts as having looked at it');
});

test('needsReview: a move or a status change of the dependency does not count; multiple changed dependencies are all listed; superseded dependency counts', () => {
  const objects = [obj('A'), obj('P'), obj('Y')];
  const rels = [dep('Y', 'A'), dep('Y', 'P')];
  assert.equal(needsReview(objects, rels, [chg('A', 'edited', '2026-02-01T00:00:00Z', { nodeId: 'offer' }), chg('A', 'status_changed', '2026-02-02T00:00:00Z', { status: 'Needs Review' })]).size, 0);
  const r = needsReview([obj('A'), obj('P', { status: 'Superseded' }), obj('Y')], rels, [chg('A', 'edited', '2026-02-01T00:00:00Z', { title: 't' }), chg('P', 'superseded', '2026-02-05T00:00:00Z')]);
  assert.deepEqual(r.get('Y')!.changedDependencies.map((d) => d.id), ['A', 'P']);
  assert.equal(r.get('Y')!.since, '2026-02-05T00:00:00Z');
});

test('needsReview in a cycle terminates; Proposed / archived dependents are never flagged', () => {
  const objects = [obj('A'), obj('B'), obj('Q', { status: 'Proposed' })];
  const rels = [dep('A', 'B'), dep('B', 'A'), dep('Q', 'A')];
  const r = needsReview(objects, rels, [chg('A', 'edited', '2026-02-01T00:00:00Z', { content: 'x' })]);
  assert.deepEqual([...r.keys()], ['B'], 'A rewrote itself; Q is only a proposal');
});

import { flipFlops, waitingDecisions } from './decisionGraph';

test('waitingDecisions: ready / blocked (with the blocker) / concurrent; done units are not listed', () => {
  const objects = [obj('A'), obj('B', { status: 'Proposed' }), obj('C', { status: 'Proposed' }), obj('X', { status: 'Proposed' }), obj('Y', { status: 'Proposed' })];
  const w = waitingDecisions(planDecisions(objects, [dep('B', 'A'), dep('C', 'B'), dep('X', 'Y'), dep('Y', 'X')]));
  assert.deepEqual(w.ready.map((u) => u.ids), [['B']]);
  assert.deepEqual(w.blocked.map((u) => [u.ids, u.blockedBy]), [[['C'], ['B']]]);
  assert.deepEqual(w.concurrent.map((u) => u.ids), [['X', 'Y']]);
});

test('flipFlops: a decision replaced 3+ times (chain from the Change log) is flagged; fewer is not; cycles terminate', () => {
  const sup = (oldId: string, newId: string): ContextChange => chg(oldId, 'superseded', `2026-0${oldId.length}-01T00:00:00Z`, { supersededById: newId });
  const objects = [obj('d1', { status: 'Superseded' }), obj('d2', { status: 'Superseded' }), obj('d3', { status: 'Superseded' }), obj('d4'), obj('e1', { status: 'Superseded' }), obj('e2')];
  const changes = [sup('d1', 'd2'), sup('d2', 'd3'), sup('d3', 'd4'), sup('e1', 'e2')];
  assert.deepEqual(flipFlops(objects, changes), [{ id: 'd4', times: 3 }]);
  assert.deepEqual(flipFlops(objects, changes, 1).map((x) => x.id), ['d4', 'e2']);
  const cyc = [sup('p', 'q'), sup('q', 'p')];
  assert.doesNotThrow(() => flipFlops([obj('p'), obj('q')], cyc, 1));
});

test('needsReview: a relation to a suggestion (Proposed) does not make truth «need a look» — thinking never reaches the truth engines', () => {
  const objects = [obj('A'), obj('B', { status: 'Proposed' }), obj('C')];
  const rels = [dep('C', 'B')];
  const edited = [chg('B', 'edited', '2026-02-01T00:00:00Z', { content: 'new' }), chg('C', 'created', '2026-01-01T00:00:00Z')];
  assert.equal(needsReview(objects, rels, edited).size, 0, 'C rests on a suggestion that changed: not flagged');
  const approved = [obj('A'), obj('B'), obj('C')];
  assert.deepEqual([...needsReview(approved, rels, edited).keys()], ['C'], 'once B is approved the same relation is real');
});
