import test from 'node:test';
import assert from 'node:assert/strict';
import { ADD_KINDS, defaultAddKind, carryAddText } from './addRequest';

test('«افزودن»: three kinds in order, and the global entry opens on «فکر» on every page', () => {
  assert.deepEqual(ADD_KINDS.map((k) => k.label), ['فکر', 'حقیقت', 'فایل']);
  for (const page of ['context', 'thinking', 'home', 'files', 'workstreams']) assert.equal(defaultAddKind(page), 'thought');
});


test('carryAddText: the words survive حقیقت ← فایل ← فکر and are not handed twice', () => {
  assert.equal(carryAddText('truth', 'file', 'بودجه ۲۰ میلیون'), '');
  assert.equal(carryAddText('file', 'thought', undefined), 'بودجه ۲۰ میلیون');
  assert.equal(carryAddText('thought', 'truth', 'تازه'), 'تازه');
  assert.equal(carryAddText('file', 'truth', undefined), '');
});
