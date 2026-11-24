import test from 'node:test';
import assert from 'node:assert/strict';
import { testerCode } from './testerCode.ts';

test('a tester code is stable, short, Latin, and never contains the id', () => {
  const id = 'acc_3f9a2c71b0e44d1e9a';
  assert.equal(testerCode(id), testerCode(id));
  assert.match(testerCode(id), /^t[0-9a-z]{7}$/);
  assert.ok(!testerCode(id).includes(id.slice(4, 10)));
  const many = new Set(Array.from({ length: 1000 }, (_, i) => testerCode(`acc_${i}`)));
  assert.equal(many.size, 1000);
});
