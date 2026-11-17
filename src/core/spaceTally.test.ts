import test from 'node:test';
import assert from 'node:assert/strict';
import { spaceTally } from './spaceTally';

test('spaceTally: truth is confirmed knowledge only; stale, suggestions and thoughts are counted apart; archived, past and samples never', () => {
  const t = spaceTally([
    { status: 'Confirmed' }, { status: 'Confirmed' }, { status: 'Needs Review' }, { status: 'Proposed' },
    { status: 'Archived' }, { status: 'Superseded' }, { status: 'Confirmed', sample: true },
  ], 3);
  assert.deepEqual(t, { truth: 2, stale: 1, proposed: 1, thoughts: 3 });
  assert.deepEqual(spaceTally([], -1), { truth: 0, stale: 0, proposed: 0, thoughts: 0 });
});
