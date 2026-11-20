import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveThenClose } from './saveFlow';

test('a saved form closes after the save and its follow-ups', async () => {
  const order: string[] = [];
  const r = await saveThenClose(async () => { order.push('save'); return { id: 'a' }; }, () => order.push('close'), async (v) => { order.push(`after:${v.id}`); });
  assert.deepEqual(order, ['save', 'after:a', 'close']);
  assert.equal(r.ok, true);
});

test('a 409 (the caller shows the error and returns nothing) keeps the dialog open: her text is not lost', async () => {
  let closed = false;
  const r = await saveThenClose(async () => undefined, () => { closed = true; });
  assert.equal(closed, false);
  assert.equal(r.ok, false);
});

test('a thrown error keeps the dialog open too', async () => {
  let closed = false;
  const r = await saveThenClose(async () => { throw new Error('409'); }, () => { closed = true; });
  assert.equal(closed, false);
  assert.equal(r.ok, false);
});

test('the dialog does not close before the server answers', async () => {
  let release!: (v: { id: string }) => void;
  let closed = false;
  const p = saveThenClose(() => new Promise<{ id: string }>((res) => { release = res; }), () => { closed = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(closed, false, 'still open while the request is on its way');
  release({ id: 'x' });
  await p;
  assert.equal(closed, true);
});
