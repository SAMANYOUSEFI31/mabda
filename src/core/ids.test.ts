import test from 'node:test';
import assert from 'node:assert/strict';
import { clientId } from './ids.ts';

test('clientId: the same millisecond still gives different ids (two people saving at once)', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => clientId('ws', 1_700_000_000_000)));
  assert.equal(ids.size, 1000);
  assert.match(clientId('del'), /^del_[a-z0-9]+$/);
});
