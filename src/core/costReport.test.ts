import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, costReport, isOurCost } from './costReport';

const e = (mode: string, cost: number, byok?: boolean) => ({ mode: mode as never, estimatedAiCostUsd: cost, byok });

test('manager ledger excludes legacy user-paid rows from platform cost and groups the rest by use', () => {
  const r = costReport([e('gap_judge', 1), e('coach', 0.5), e('file_processing', 0.25), e('auto', 99, true)]);
  assert.equal(r.ourCostUsd, 1.75);
  assert.deepEqual(r.lines.map((l) => l.category), ['judgments', 'coach', 'fileProcessing']);
  assert.equal('priceUsd' in r, false, 'no plan price to compare with');
  assert.equal(isOurCost({ byok: undefined }), true);
  assert.equal(categoryOf('chat_deep'), 'generation');
});
