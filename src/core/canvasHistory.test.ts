import test from 'node:test';
import assert from 'node:assert/strict';
import { canRedo, canUndo, createHistory, record, redo, undo } from './canvasHistory.ts';
import type { HistoryEntry } from './canvasHistory.ts';

const move = (id: string, from: 'thinking' | 'confirmed', to: 'thinking' | 'confirmed'): HistoryEntry => ({ label: `انتقال ${id}`, undo: [{ type: 'move', objectId: id, lane: from }], redo: [{ type: 'move', objectId: id, lane: to }] });

test('undo returns the entry whose undo actions restore the state; redo returns it again; a new gesture clears the future', () => {
  let h = createHistory();
  assert.deepEqual([canUndo(h), canRedo(h)], [false, false]);
  h = record(h, move('a', 'thinking', 'confirmed'));
  h = record(h, move('b', 'confirmed', 'thinking'));
  assert.equal(h.past.length, 2);
  let r = undo(h);
  assert.equal(r.entry?.label, 'انتقال b');
  assert.deepEqual(r.entry?.undo, [{ type: 'move', objectId: 'b', lane: 'confirmed' }]);
  h = r.history;
  assert.deepEqual([canUndo(h), canRedo(h)], [true, true]);
  r = redo(h);
  assert.equal(r.entry?.label, 'انتقال b');
  h = r.history;
  assert.equal(canRedo(h), false);
  // undo twice, then a new gesture: the undone ones can no longer be redone
  h = undo(undo(h).history).history;
  assert.equal(h.past.length, 0);
  assert.equal(h.future.length, 2);
  h = record(h, move('c', 'thinking', 'confirmed'));
  assert.equal(canRedo(h), false);
  assert.equal(h.past.length, 1);
});

test('nothing to undo / redo is a no-op, and the stack is bounded', () => {
  const h = createHistory(3);
  assert.deepEqual(undo(h), { history: h });
  assert.deepEqual(redo(h), { history: h });
  let g = h;
  for (let i = 0; i < 10; i++) g = record(g, move(`o${i}`, 'thinking', 'confirmed'));
  assert.equal(g.past.length, 3);
  assert.equal(g.past[0].label, 'انتقال o7', 'the oldest entries fall off');
  assert.equal(h.past.length, 0, 'the original value is never mutated');
});
