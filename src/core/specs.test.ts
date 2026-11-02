import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSTREAM_SPECS, currentSpecIds, enabledBuiltInSpecs } from './specs';

test('workstream library: absent enabledSpecIds = every built-in (old workspaces unchanged); a list picks; an empty list shows none', () => {
  assert.equal(enabledBuiltInSpecs({}).length, WORKSTREAM_SPECS.length);
  assert.equal(enabledBuiltInSpecs(undefined).length, WORKSTREAM_SPECS.length);
  assert.deepEqual(enabledBuiltInSpecs({ enabledSpecIds: [WORKSTREAM_SPECS[1].id] }).map((s) => s.id), [WORKSTREAM_SPECS[1].id]);
  assert.deepEqual(enabledBuiltInSpecs({ enabledSpecIds: [] }), []);
  assert.deepEqual(currentSpecIds({}), WORKSTREAM_SPECS.map((s) => s.id), 'what «all» means once a workspace starts choosing');
  assert.deepEqual(currentSpecIds({ enabledSpecIds: ['unknown'] }), []);
});

import { LIBRARY, LEGACY_SPEC_IDS, DEFAULT_TREE_NODES } from './specs';
import { topologicalOrder } from './specGraph';

test('library: the three originals + seven general frameworks, each naming its public source; a workspace that never chose still sees only the originals', () => {
  assert.equal(LIBRARY.length, 10);
  assert.deepEqual(LEGACY_SPEC_IDS.filter((id) => LIBRARY.some((s) => s.id === id)), LEGACY_SPEC_IDS);
  assert.deepEqual(enabledBuiltInSpecs({}).map((s) => s.id), LEGACY_SPEC_IDS, 'old workspaces: unchanged');
  assert.deepEqual(enabledBuiltInSpecs({ enabledSpecIds: ['lib_icp', 'lib_offer'] }).map((s) => s.id), ['lib_icp', 'lib_offer']);
  const added = LIBRARY.filter((s) => !LEGACY_SPEC_IDS.includes(s.id));
  assert.equal(added.length, 7);
  assert.deepEqual(added.map((s) => s.id).sort(), ['lib_brand_voice', 'lib_content_pillars', 'lib_icp', 'lib_launch_plan', 'lib_offer', 'lib_sales_page', 'lib_support_policy']);
});

test('every library workstream is well-formed: a source, real tree nodes, required items, deliverables in a cycle-free order, unique ids', () => {
  const nodeIds = new Set(DEFAULT_TREE_NODES.map((n) => n.id));
  assert.equal(new Set(LIBRARY.map((s) => s.id)).size, LIBRARY.length);
  for (const s of LIBRARY.filter((x) => x.id.startsWith('lib_'))) {
    assert.ok(s.reference && s.reference.length > 10, `${s.id} names its source`);
    assert.ok(s.requiredContext.length >= 3 && s.deliverables.length >= 2, s.id);
    for (const c of [...s.requiredContext, ...s.suggestedContext]) assert.ok(nodeIds.has(c.nodeId), `${s.id}/${c.key} → ${c.nodeId}`);
    assert.equal(new Set([...s.requiredContext, ...s.suggestedContext].map((c) => c.key)).size, s.requiredContext.length + s.suggestedContext.length, `${s.id}: unique keys`);
    assert.equal(topologicalOrder(s.deliverables).length, s.deliverables.length);
    assert.ok(s.deliverables.every((d) => d.acceptanceCriteria.length >= 1 && (d.dependsOn ?? []).every((x) => s.deliverables.some((y) => y.id === x))));
  }
  assert.equal(new Set(LIBRARY.flatMap((s) => s.deliverables.map((d) => d.id))).size, LIBRARY.flatMap((s) => s.deliverables).length, 'deliverable ids are unique across the library');
});
