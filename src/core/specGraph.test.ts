import test from 'node:test';
import assert from 'node:assert/strict';
import { findCycle, lockOf, lockReason, topologicalOrder, validateSpec, wouldCreateCycle } from './specGraph';
import { calculateReadinessAndGaps } from './contextEngine';
import { WORKSTREAM_SPECS } from './specs';
import type { ContextObject, DeliverableSpec, WorkstreamSpec } from '../types';

const d = (id: string, order: number, dependsOn: string[] = []): DeliverableSpec => ({
  id, title: `خروجی ${id}`, type: 'Asset', description: '', order, dependsOn, baseCreditCost: { fast: 1, auto: 2, critique: 10, sensitive: 20 }, acceptanceCriteria: ['معیار'],
});

test('topological order: dependencies first, author order kept where the graph allows', () => {
  const items = [d('e', 1, ['b', 'd']), d('a', 2), d('b', 3, ['a']), d('c', 4, ['a']), d('d', 5, ['b', 'c'])];
  const order = topologicalOrder(items).map((x) => x.id);
  assert.deepEqual(order, ['a', 'b', 'c', 'd', 'e']);
  for (const x of items) for (const dep of x.dependsOn ?? []) assert.ok(order.indexOf(dep) < order.indexOf(x.id), `${dep} before ${x.id}`);
  assert.deepEqual(topologicalOrder([d('x', 2), d('y', 1)]).map((i) => i.id), ['y', 'x'], 'no dependencies → plain order');
});

test('cycle detection: direct, long, self; and the editor guard', () => {
  assert.equal(findCycle([d('a', 1), d('b', 2, ['a'])]), null);
  assert.deepEqual(findCycle([d('a', 1, ['b']), d('b', 2, ['a'])]), ['a', 'b', 'a']);
  const long = findCycle([d('a', 1, ['c']), d('b', 2, ['a']), d('c', 3, ['b'])]);
  assert.ok(long && long[0] === long[long.length - 1] && long.length === 4);
  assert.ok(findCycle([d('a', 1, ['a'])]));
  assert.throws(() => topologicalOrder([d('a', 1, ['b']), d('b', 2, ['a'])]), /cycle/);
  const items = [d('a', 1), d('b', 2, ['a']), d('c', 3, ['b'])];
  assert.equal(wouldCreateCycle(items, 'a', 'c'), true, 'a → c would close a → c → b → a');
  assert.equal(wouldCreateCycle(items, 'c', 'a'), false);
  assert.equal(wouldCreateCycle(items, 'b', 'b'), true);
});

test('a deliverable is locked, with the reason, until every dependency has been built', () => {
  const all = [d('a', 1), d('b', 2), d('c', 3, ['a', 'b'])];
  const none = lockOf(all[2], all, new Set());
  assert.equal(none.locked, true);
  assert.equal(lockReason(none), 'ابتدا بساز: «خروجی a»، «خروجی b»');
  assert.deepEqual(lockOf(all[2], all, new Set(['a'])).missing.map((m) => m.id), ['b']);
  assert.equal(lockOf(all[2], all, new Set(['a', 'b'])).locked, false);
  assert.equal(lockOf(all[0], all, new Set()).locked, false);
});

const spec = (deliverables: DeliverableSpec[]): WorkstreamSpec => ({ id: 's', title: 'ت', target: 'هدف', description: '', requiredContext: [], suggestedContext: [], optionalContext: [], deliverables });

test('validateSpec reports cycles, unknown dependencies and empty criteria', () => {
  assert.deepEqual(validateSpec(spec([d('a', 1), d('b', 2, ['a'])])), []);
  assert.match(validateSpec(spec([d('a', 1, ['b']), d('b', 2, ['a'])]))[0].message, /چرخه‌ای.*«خروجی a».*«خروجی b»/);
  assert.match(validateSpec(spec([d('a', 1, ['zzz'])]))[0].message, /وجود ندارد/);
  assert.ok(validateSpec(spec([{ ...d('a', 1), acceptanceCriteria: [' '] }])).some((i) => /معیار پذیرش/.test(i.message)));
  assert.ok(validateSpec(spec([])).some((i) => /حداقل یک خروجی/.test(i.message)));
});

const obj = (o: Partial<ContextObject>): ContextObject => ({ id: 'x', workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'مخاطب اصلی (ICP)', content: 'ب', nodeId: 'business', version: 1, createdAt: '', updatedAt: '', ...o });

test('Gap «مبهم» comes from the decision layer (per object version), never from text length', () => {
  const sp = WORKSTREAM_SPECS[0];
  const short = obj({ id: 'a', content: 'فریلنسرها' }); // very short but clear
  const long = obj({ id: 'a', content: 'مشتریان مختلفی با نیازهای متفاوت که شاید بخواهند یا نخواهند و هنوز مشخص نیست دقیقاً چه کسانی' });
  const gapOf = (objs: ContextObject[], amb = {}) => calculateReadinessAndGaps(sp, objs, [], amb).gaps.find((g) => g.key === 'target_audience');
  assert.equal(gapOf([short]), undefined, 'short text is not ambiguous by itself');
  assert.equal(gapOf([long]), undefined, 'long text is not ambiguous by itself either');
  const judged = gapOf([long], { a: { version: 1, ambiguous: true, reason: 'مخاطب مشخص نشده' } });
  assert.equal(judged?.status, 'ambiguous');
  assert.match(judged!.question, /مخاطب مشخص نشده/);
  assert.equal(gapOf([{ ...long, version: 2 }], { a: { version: 1, ambiguous: true, reason: 'x' } }), undefined, 'a judgment of an older version is ignored');
  assert.equal(gapOf([obj({ id: 'a', status: 'Needs Review' })])?.status, 'ambiguous', 'the user\'s own «Needs Review» still counts');
});
