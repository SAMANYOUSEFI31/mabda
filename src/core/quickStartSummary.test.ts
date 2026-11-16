import test from 'node:test';
import assert from 'node:assert/strict';
import { quickStartQuestions, quickStartSummary } from './quickStartSummary';
import { startTemplateFor } from './specs';
import { templateTree } from './startTemplate';

const nodes = [{ id: 'a', label: 'الف' }, { id: 'b', label: 'ب' }];
test('quickStartSummary: per node, how many are approved and how many wait; tree order; totals', () => {
  const s = quickStartSummary([{ nodeId: 'b', status: 'Confirmed' }, { nodeId: 'a', status: 'Proposed' }, { nodeId: 'a', status: 'Confirmed' }, { nodeId: 'a', status: 'Proposed' }], nodes);
  assert.deepEqual(s.rows, [{ nodeId: 'a', label: 'الف', confirmed: 1, proposed: 2 }, { nodeId: 'b', label: 'ب', confirmed: 1, proposed: 0 }]);
  assert.deepEqual([s.confirmed, s.proposed], [2, 2]);
  assert.deepEqual(quickStartSummary([], nodes), { rows: [], confirmed: 0, proposed: 0 });
});

test('quick start asks what fits the space: never about customers in a personal or project space; every answer lands in a branch that space starts with (FLOW-02)', () => {
  for (const purpose of ['personal', 'project', 'empty', 'work'] as const) {
    const qs = quickStartQuestions(purpose);
    const branches = new Set(templateTree(startTemplateFor(purpose)).map((n) => n.id));
    assert.ok(qs.length >= 3);
    for (const q of qs) assert.ok(branches.has(q.nodeId), `${purpose}: ${q.nodeId}`);
    if (purpose !== 'work') assert.ok(qs.every((q) => !/مشتری|کسب‌وکار|بازار/.test(q.label + q.title)), purpose);
  }
});
