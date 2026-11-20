import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStaleAssets, impactMessage, newlyStale } from './impactEngine';
import type { ContextChange, ContextObject } from '../types';

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

test('moving a Node does not stale an asset when its used Context and dependency graph are unchanged', () => {
  const movement: ContextChange = { id: 'move', workspaceId: 'w', objectId: 'node:offer', fromVersion: 0, toVersion: 0, kind: 'node_moved', actor: 'user', at: '2026-06-01T00:00:00Z' };
  assert.deepEqual(computeStaleAssets([asset('a', [['c1', 1]])], [obj({ id: 'c1', version: 1 })], { relationships: [], changes: [movement] }), []);
});

test('newlyStale counts only assets that became stale because of this change', () => {
  const dels = [asset('a1', [['c1', 1]]), asset('a2', [['c2', 1]]), asset('a3', [['c1', 1], ['c2', 1]])];
  const before = computeStaleAssets(dels, [obj({ id: 'c1' }), obj({ id: 'c2', version: 2 })]); // a2, a3 already stale
  const after = computeStaleAssets(dels, [obj({ id: 'c1', version: 2 }), obj({ id: 'c2', version: 2 })]);
  assert.deepEqual(newlyStale(before, after).map((s) => s.deliverableId).sort(), ['a1', 'a3']);
  assert.equal(impactMessage(2), 'این تغییر روی ۲ خروجی اثر دارد.');
  assert.equal(impactMessage(0), '');
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

test('a draft edit reaches only what consumed that version: an asset built from c1@v2 is untouched by drafts of another object, and an unconsumed draft affects nothing', () => {
  const assets = [asset('a_uses_c1', [['c1', 2]]), asset('a_uses_c2', [['c2', 1]])];
  // c3 is a Proposed draft edited three times: no asset consumed it (a Proposed object is never injected), so no asset is stale
  const objs = [obj({ id: 'c1', version: 2 }), obj({ id: 'c2', version: 1 }), obj({ id: 'c3', status: 'Proposed', version: 4 })];
  assert.deepEqual(computeStaleAssets(assets, objs), []);
  // editing c1 (a new version) makes ONLY the asset that used c1 stale
  const after = computeStaleAssets(assets, objs.map((o) => (o.id === 'c1' ? { ...o, version: 3 } : o)));
  assert.deepEqual(after.map((s) => s.deliverableId), ['a_uses_c1']);
  // an asset built from c1@v3 stays fresh when only c3's drafts move on
  assert.deepEqual(computeStaleAssets([asset('a_v3', [['c1', 3]])], objs.map((o) => (o.id === 'c1' ? { ...o, version: 3 } : o.id === 'c3' ? { ...o, version: 9 } : o))), []);
});

// ── a monitored number (owner decision §۴۲): only outputs that carried the number go stale ──
import { buildContextPack } from './contextPack';
import { DEFAULT_TREE_NODES } from './specs';
import type { Measurement, Metric } from '../types';

const fact = obj({ id: 'f_fund', type: 'Fact', title: 'صندوق اضطراری', nodeId: 'business' });
const other = obj({ id: 'f_other', type: 'Fact', title: 'شهر محل زندگی', nodeId: 'business' });
const metric: Metric = { id: 'm1', workspaceId: 'w', name: 'صندوق اضطراری', unit: 'میلیون', direction: 'up', objectId: 'f_fund', cadence: 'month', createdAt: '', updatedAt: '' };
const mz = (id: string, value: number, at: string, status: Measurement['status'] = 'Confirmed'): Measurement => ({ id, workspaceId: 'w', metricId: 'm1', value, at, source: 'manual', status, createdAt: `${at}T00:00:00Z` });

test('a pack that carries a monitored number records which number on its truth\'s ref; a pack without the truth does not carry it', () => {
  const ms = [mz('x1', 12, '2026-10-01'), mz('x2', 14, '2026-11-01')];
  const withFund = buildContextPack({ packId: 'p1', workspaceName: 'w', nodes: DEFAULT_TREE_NODES, objects: [fact, other], metrics: { metrics: [metric], measurements: ms, changes: [] } });
  assert.match(withFund.markdown, /صندوق اضطراری/);
  assert.deepEqual(withFund.refs.find((r) => r.id === 'f_fund')?.number, { metricId: 'm1', measurementId: 'x2', value: 14, at: '2026-11-01' });
  // a monitor goes into the text only with its truth: a pack without «صندوق اضطراری» carries neither the number nor a number ref
  const without = buildContextPack({ packId: 'p2', workspaceName: 'w', nodes: DEFAULT_TREE_NODES, objects: [other], metrics: { metrics: [metric], measurements: ms, changes: [] } });
  assert.doesNotMatch(without.markdown, /اندازه‌گیری‌ها/);
  assert.ok(without.refs.every((r) => !r.number));
});

test('a newer number with another value makes only the outputs that carried the number stale, with «از Y به Z»', () => {
  const carried = { id: 'carried', usedContext: [{ id: 'f_fund', version: 1, number: { metricId: 'm1', measurementId: 'x2', value: 14, at: '2026-11-01' } }] };
  const plain = { id: 'plain', usedContext: [{ id: 'f_fund', version: 1 }, { id: 'f_other', version: 1 }] };
  const numbers = (ms: Measurement[], m: Metric = metric) => ({ relationships: [], changes: [], numbers: { metrics: [m], measurements: ms } });
  const base = [mz('x1', 12, '2026-10-01'), mz('x2', 14, '2026-11-01')];
  // nothing new: neither is stale
  assert.deepEqual(computeStaleAssets([carried, plain], [fact, other], numbers(base)), []);
  // a newer number with another value: only the output that carried it, with a plain reason
  const after = computeStaleAssets([carried, plain], [fact, other], numbers([...base, mz('x3', 16.5, '2026-11-15')]));
  assert.deepEqual(after.map((s) => s.deliverableId), ['carried']);
  assert.equal(after[0].reasons[0].kind, 'number_changed');
  assert.equal(after[0].reasons[0].message, 'عدد «صندوق اضطراری» از ۱۴ میلیون به ۱۶٫۵ میلیون رسید.');
  // the same value again, a proposed number, or a stopped monitor: not stale
  assert.deepEqual(computeStaleAssets([carried], [fact], numbers([...base, mz('x3', 14, '2026-11-15')])), []);
  assert.deepEqual(computeStaleAssets([carried], [fact], numbers([...base, mz('x3', 20, '2026-11-15', 'Proposed')])), []);
  assert.deepEqual(computeStaleAssets([carried], [fact], numbers([...base, mz('x3', 20, '2026-11-15')], { ...metric, archived: true })), []);
  // a still newer number changes the signature (so «newlyStale» says so again)
  const s1 = computeStaleAssets([carried], [fact], numbers([...base, mz('x3', 16, '2026-11-15')]));
  const s2 = computeStaleAssets([carried], [fact], numbers([...base, mz('x3', 16, '2026-11-15'), mz('x4', 18, '2026-11-22')]));
  assert.equal(newlyStale(s1, s2).length, 1);
  // without the numbers (old callers) nothing changes
  assert.deepEqual(computeStaleAssets([carried], [fact], { relationships: [], changes: [] }), []);
});

test('IMPACT-01: a move to another section makes an output that recorded the place stale; moving back, or an old output, does not', () => {
  const placed = { id: 'a1', usedContext: [{ id: 'c1', version: 2, nodeId: 'business' }] };
  assert.deepEqual(computeStaleAssets([placed], [obj({ id: 'c1', version: 2 })]), [], 'same place, same version: fresh');
  const moved = computeStaleAssets([placed], [obj({ id: 'c1', version: 2, nodeId: 'offer' })]);
  assert.equal(moved[0].reasons[0].kind, 'scope_changed');
  assert.equal(moved[0].reasons[0].message, '«مخاطب اصلی» به بخش دیگری منتقل شد.');
  const further = computeStaleAssets([placed], [obj({ id: 'c1', version: 2, nodeId: 'brand' })]);
  assert.notEqual(further[0].signature, moved[0].signature, 'a second move is a new reason (newlyStale sees it)');
  assert.equal(computeStaleAssets([placed], [obj({ id: 'c1', version: 3, nodeId: 'offer' })])[0].reasons[0].kind, 'version_changed', 'a text change says the stronger thing');
  assert.deepEqual(computeStaleAssets([asset('a2', [['c1', 2]])], [obj({ id: 'c1', version: 2, nodeId: 'offer' })]), [], 'an output that never recorded the place is not guessed at');
});

test('IMPACT-01b: moving the whole section elsewhere in the tree makes an output built from its items stale', () => {
  const tree = (parent: string) => [
    { id: 'business', label: 'ک', description: '', order: 0 },
    { id: 'offer', label: 'پ', parentId: 'business', description: '', order: 0 },
    { id: 'brand', label: 'ب', parentId: 'business', description: '', order: 1 },
    { id: 'pricing', label: 'ق', parentId: parent, description: '', order: 0 },
  ];
  const built = { id: 'a1', usedContext: [{ id: 'c1', version: 1, nodeId: 'pricing', place: 'pricing<offer<business' }] };
  const objs = [obj({ id: 'c1', version: 1, nodeId: 'pricing', title: 'قیمت پایه' })];
  const graph = (parent: string) => ({ relationships: [], changes: [], nodes: tree(parent) });
  assert.deepEqual(computeStaleAssets([built], objs, graph('offer')), [], 'the section did not move');
  const moved = computeStaleAssets([built], objs, graph('brand'));
  assert.equal(moved[0].reasons[0].kind, 'scope_changed');
  assert.equal(moved[0].reasons[0].message, '«قیمت پایه» با بخشش به جای دیگری از درخت رفت.');
  assert.deepEqual(computeStaleAssets([built], objs), [], 'without the tree only a change of section is seen');
});
