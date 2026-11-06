import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveContext } from './contextStatus.ts';

test('isActiveContext distinguishes live contexts from archived and superseded ones', () => {
  assert.equal(isActiveContext({ status: 'Confirmed' }), true);
  assert.equal(isActiveContext({ status: 'Proposed' }), true);
  assert.equal(isActiveContext({ status: 'Needs Review' }), true);
  assert.equal(isActiveContext({ status: 'Archived' }), false);
  assert.equal(isActiveContext({ status: 'Superseded' }), false);
});
