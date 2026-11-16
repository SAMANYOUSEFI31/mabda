import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { OWNER_ACCESS_NOTICE, OWNER_NOTICE_VERSION } from './ownerNotice.ts';

// the text each version was accepted with; changing the notice means: add a line here AND raise OWNER_NOTICE_VERSION
const ACCEPTED: Record<number, string> = { 1: '35ab948bc97c133a' };

test('a changed owner-access notice comes with a new version (so everyone is asked again)', () => {
  const now = crypto.createHash('sha256').update(OWNER_ACCESS_NOTICE).digest('hex').slice(0, 16);
  assert.equal(ACCEPTED[OWNER_NOTICE_VERSION], now, 'the notice text changed: raise OWNER_NOTICE_VERSION and record the new text here');
});
