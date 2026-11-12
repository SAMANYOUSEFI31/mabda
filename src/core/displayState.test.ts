import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictPartners, displayState } from './displayState';
import type { ContextObject } from '../types';

const obj = (id: string, content: string, extra: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'اجارهٔ ماهانه', content, nodeId: 'n',
  version: 1, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...extra,
} as ContextObject);

test('the contradiction engine overrides the stored status, everywhere the same', () => {
  const a = obj('a', 'اجارهٔ ماهانه ۲۲ میلیون تومان است.'), b = obj('b', 'اجارهٔ ماهانه ۱۸ میلیون تومان است.');
  const p = conflictPartners([a, b]);
  assert.equal(displayState(a, p), 'conflict');
  assert.equal(p.get('b')?.id, 'a');
  assert.equal(displayState(a), 'truth', 'without the engine it is the stored status');
});

test('stored statuses map to the dot names; past wins over a conflict', () => {
  assert.equal(displayState({ id: 'x', status: 'Needs Review' }), 'stale');
  assert.equal(displayState({ id: 'x', status: 'Proposed' }), 'proposed');
  assert.equal(displayState({ id: 'x', status: 'Archived' }, new Map([['x', 1]])), 'past');
  assert.equal(conflictPartners([obj('s', 'اجاره ۱', { sample: true }), obj('t', 'اجاره ۲', { sample: true })]).size, 0);
});
