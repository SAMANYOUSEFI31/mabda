import test from 'node:test';
import assert from 'node:assert/strict';
import { goTarget, SHORTCUTS } from './shortcuts';

test('G then a physical key: the four places and the first nine spaces; anything else is nothing', () => {
  assert.deepEqual(goTarget('KeyH'), { tab: 'home' });
  assert.deepEqual(goTarget('KeyS'), { tab: 'context' });
  assert.deepEqual(goTarget('Digit3'), { space: 2 });
  assert.equal(goTarget('Digit0'), null);
  assert.equal(goTarget('KeyX'), null);
});

test('every single-key shortcut is marked, so turning them off is complete (WCAG 2.1.4)', () => {
  for (const s of SHORTCUTS) if (s.keys.length === 1 || s.keys[0] === 'G') assert.ok(s.letter, s.label);
});
