import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftInto } from './keyboard.ts';

const band = { top: 100, bottom: 400 };

test('a field already inside the visible band does not move', () => {
  assert.equal(shiftInto({ top: 150, bottom: 200 }, band), 0);
});

test('a field under the keyboard scrolls up just enough to sit above it', () => {
  assert.equal(shiftInto({ top: 500, bottom: 550 }, band), 150);
});

test('a field above the band (under a pinned head, or scrolled away) comes back down to its top', () => {
  assert.equal(shiftInto({ top: 40, bottom: 90 }, band), -60);
});

test('a field taller than the band shows its top part, not its bottom', () => {
  assert.equal(shiftInto({ top: 300, bottom: 900 }, band), 200, 'its top lands at the top of the band');
  assert.equal(shiftInto({ top: 100, bottom: 900 }, band), 0);
});

test('no room at all (a sliver of screen) leaves the page alone', () => {
  assert.equal(shiftInto({ top: 500, bottom: 550 }, { top: 300, bottom: 300 }), 0);
});
