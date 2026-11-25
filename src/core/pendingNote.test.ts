import test from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_NOTE, isPendingNote } from './pendingNote.ts';

test('a note under a local id is pending; a stored one is not', () => {
  assert.equal(isPendingNote(`${PENDING_NOTE}2026-11-25T10:00:00.000Z-abc123`), true);
  assert.equal(isPendingNote('note_01HZX'), false);
  assert.equal(isPendingNote(''), false);
});
