import test from 'node:test';
import assert from 'node:assert/strict';
import { actorOfSource, diffFields, isBaselineChange, isContentChange, splitSupersedeReason, statusChangeKind } from './changeLog';

test('diffFields keeps only what changed (null and undefined are the same «empty»)', () => {
  assert.deepEqual(diffFields({ title: 'الف', content: 'ب', slotKey: undefined }, { title: 'الف', content: 'پ', slotKey: undefined }), { before: { content: 'ب' }, after: { content: 'پ' } });
  assert.equal(diffFields({ title: 'x' }, { title: 'x' }), undefined);
  assert.deepEqual(diffFields({ nodeId: 'a' }, { nodeId: 'b' }, ['nodeId']), { before: { nodeId: 'a' }, after: { nodeId: 'b' } });
});

test('status transitions map to the right kind', () => {
  assert.equal(statusChangeKind('Proposed', 'Confirmed'), 'proposal_accepted');
  assert.equal(statusChangeKind('Proposed', 'Archived'), 'proposal_rejected');
  assert.equal(statusChangeKind('Confirmed', 'Archived'), 'archived');
  assert.equal(statusChangeKind('Confirmed', 'Needs Review'), 'status_changed');
});

test('actor follows the source; no source = the user', () => {
  assert.deepEqual(actorOfSource(), { actor: 'user' });
  assert.deepEqual(actorOfSource({ kind: 'mcp', label: 'Claude', at: 't' }), { actor: 'mcp', label: 'Claude' });
  assert.equal(actorOfSource({ kind: 'paste', at: 't' }).actor, 'import');
  assert.equal(actorOfSource({ kind: 'coach', at: 't' }).actor, 'coach');
});

test('content change vs. status/move/review for the review baseline', () => {
  assert.equal(isContentChange({ kind: 'edited', after: { content: 'x' } }), true);
  assert.equal(isContentChange({ kind: 'edited', after: { nodeId: 'b' } }), false, 'a move says nothing new');
  assert.equal(isContentChange({ kind: 'superseded' }), true);
  assert.equal(isContentChange({ kind: 'status_changed', after: { status: 'Needs Review' } }), false);
  assert.equal(isBaselineChange({ kind: 'review_accepted' }), true);
  assert.equal(isBaselineChange({ kind: 'edited', after: { nodeId: 'b' } }), false);
});

test('splitSupersedeReason removes the glued reason (multi-line, brackets inside, none)', () => {
  assert.deepEqual(splitSupersedeReason('متن تصمیم\n\n[دلیل جایگزینی: بودجه کم شد]'), { content: 'متن تصمیم', reason: 'بودجه کم شد' });
  assert.deepEqual(splitSupersedeReason('الف\nب\n\n[دلیل جایگزینی: دلیل [مهم]\nدو خطی]\n'), { content: 'الف\nب', reason: 'دلیل [مهم]\nدو خطی' });
  assert.deepEqual(splitSupersedeReason('متن بدون دلیل'), { content: 'متن بدون دلیل' });
  assert.deepEqual(splitSupersedeReason('در وسط [دلیل جایگزینی: x] و ادامه'), { content: 'در وسط [دلیل جایگزینی: x] و ادامه' }, 'only the tail form is removed');
});
