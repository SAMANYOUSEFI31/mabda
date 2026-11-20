import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeIndex, readingLineY } from './readingLine';

const desk = { pinned: 64, viewport: 900, scrollHeight: 9000 };
const phone = { pinned: 250, viewport: 844, scrollHeight: 9000 };

test('the line is a quarter of the readable height under the pinned bars', () => {
  assert.equal(readingLineY({ ...desk, scrollTop: 1000 }), 64 + (900 - 64) * 0.25);
  assert.equal(readingLineY({ ...phone, scrollTop: 1000 }), 250 + (844 - 250) * 0.25);
});

test('desktop, three sections in view: the one whose heading is in the upper quarter is «اکنون», not the one scrolled past', () => {
  // the first section's heading left the window long ago; the second's is at 180 (in the upper quarter); the third's at 600
  const line = readingLineY({ ...desk, scrollTop: 2000 });
  assert.equal(activeIndex([-1400, 180, 600], line), 1);
  // the rule of §۵۲ (just under the bars) kept the first one lit
  assert.equal(activeIndex([-1400, 180, 600], desk.pinned + 12), 0);
});

test('a jump lands a heading 8px under the bars: it is «اکنون» at once', () => {
  const line = readingLineY({ ...phone, scrollTop: 3000 });
  assert.equal(activeIndex([-900, phone.pinned + 8, 700], line), 1);
});

test('the last screen: the line reaches the bottom at the end, so each short last section is «اکنون» in turn', () => {
  const g = { ...desk, scrollHeight: 5000 }; // maxScroll 4100
  const tops = [-2000, 300, 520, 700, 820]; // the last three are short and all on the last screen
  const seen = new Set<number>();
  for (let s = 3200; s <= 4100; s += 50) seen.add(activeIndex(tops.map((t) => t - (s - 4100)), readingLineY({ ...g, scrollTop: s })));
  assert.ok([2, 3, 4].every((i) => seen.has(i)), `every short last section is reached: ${[...seen]}`);
  assert.equal(activeIndex(tops, readingLineY({ ...g, scrollTop: 4100 })), 4, 'the very end is the last section');
});

test('a page shorter than two screens: the top is the first section, the end the last', () => {
  const g = { pinned: 64, viewport: 900, scrollHeight: 1200 };
  assert.equal(activeIndex([100, 500, 1000], readingLineY({ ...g, scrollTop: 0 })), 0);
  assert.equal(activeIndex([-200, 200, 700], readingLineY({ ...g, scrollTop: 300 })), 2);
});

test('the line only moves down as she scrolls down (no flicker)', () => {
  let prev = -Infinity;
  for (let s = 0; s <= 8100; s += 100) { const y = readingLineY({ ...desk, scrollTop: s }); assert.ok(y >= prev - 1e-9); prev = y; }
});
