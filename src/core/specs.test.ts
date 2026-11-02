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
