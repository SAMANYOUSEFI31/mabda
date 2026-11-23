import test from 'node:test';
import assert from 'node:assert/strict';
import { importLabel } from './importLabel';

test('1B-5.3: the menus promise «یا حافظه» only while the memory import really exists (managed AI on)', () => {
  assert.equal(importLabel(false), 'وارد کردن سند');
  assert.equal(importLabel(true), 'وارد کردن سند یا حافظه');
});
