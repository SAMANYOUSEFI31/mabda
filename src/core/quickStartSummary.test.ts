import test from 'node:test';
import assert from 'node:assert/strict';
import { quickStartSummary } from './quickStartSummary';

const nodes = [{ id: 'a', label: 'الف' }, { id: 'b', label: 'ب' }];
test('quickStartSummary: per node, how many are approved and how many wait; tree order; totals', () => {
  const s = quickStartSummary([{ nodeId: 'b', status: 'Confirmed' }, { nodeId: 'a', status: 'Proposed' }, { nodeId: 'a', status: 'Confirmed' }, { nodeId: 'a', status: 'Proposed' }], nodes);
  assert.deepEqual(s.rows, [{ nodeId: 'a', label: 'الف', confirmed: 1, proposed: 2 }, { nodeId: 'b', label: 'ب', confirmed: 1, proposed: 0 }]);
  assert.deepEqual([s.confirmed, s.proposed], [2, 2]);
  assert.deepEqual(quickStartSummary([], nodes), { rows: [], confirmed: 0, proposed: 0 });
});
