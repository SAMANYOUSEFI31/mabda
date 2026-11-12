import test from 'node:test';
import assert from 'node:assert/strict';
import { ADD_KINDS, defaultAddKind, carryAddText } from './addRequest';

test('«افزودن»: three kinds in order, and the default follows the page', () => {
  assert.deepEqual(ADD_KINDS.map((k) => k.label), ['فکر', 'حقیقت', 'فایل']);
  assert.equal(defaultAddKind('context'), 'truth');
  assert.equal(defaultAddKind('thinking'), 'thought');
  assert.equal(defaultAddKind('home'), 'thought');
  assert.equal(defaultAddKind('files'), 'file');
});


test('carryAddText: the words survive حقیقت ← فایل ← فکر and are not handed twice', () => {
  assert.equal(carryAddText('truth', 'file', 'بودجه ۲۰ میلیون'), '');
  assert.equal(carryAddText('file', 'thought', undefined), 'بودجه ۲۰ میلیون');
  assert.equal(carryAddText('thought', 'truth', 'تازه'), 'تازه');
  assert.equal(carryAddText('file', 'truth', undefined), '');
});
