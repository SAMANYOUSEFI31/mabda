import test from 'node:test';
import assert from 'node:assert/strict';
import { ADD_KINDS, defaultAddKind } from './addRequest';

test('«افزودن»: three kinds in order, and the default follows the page', () => {
  assert.deepEqual(ADD_KINDS.map((k) => k.label), ['فکر', 'حقیقت', 'فایل']);
  assert.equal(defaultAddKind('context'), 'truth');
  assert.equal(defaultAddKind('thinking'), 'thought');
  assert.equal(defaultAddKind('home'), 'thought');
  assert.equal(defaultAddKind('files'), 'file');
});
