import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerEntryFromUsage } from './ledger.ts';

test('new ledger rows mirror actual provider usage without payer flags', () => {
  const usage = {
    stages: [],
    totals: { inputTokens: 1000, cachedTokens: 4000, outputTokens: 300, thinkingTokens: 200, costUsd: 0.00123 },
  };
  const e = ledgerEntryFromUsage({ workspaceId: 'ws', action: 'گفتگو', mode: 'chat_auto', creditCost: 0, usage, now: new Date('2026-11-01T10:00:00Z'), id: 'led_x' });
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cachedTokens, e.thinkingTokens, e.estimatedAiCostUsd, e.creditCost, e.byok], [5000, 500, 4000, 200, 0.00123, 0, undefined]);
  assert.equal(e.timestamp, '2026-11-01T10:00:00.000Z');
});
