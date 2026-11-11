import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlotProvider, registerSlotProvider, slotsActive } from './suggestionSlots.ts';

test('بدون فراهم‌کننده همه‌چیز خاموش است', () => {
  assert.equal(slotsActive(), false);
  for (const s of ['place', 'kind', 'duplicate', 'related'] as const) assert.equal(getSlotProvider(s), null);
});

test('ثبت و لغو فراهم‌کننده', async () => {
  const off = registerSlotProvider('place', async () => [{ slot: 'place', label: 'قیمت' }]);
  assert.equal(slotsActive(), true);
  assert.equal((await getSlotProvider('place')!({ text: 'x' }))[0]!.label, 'قیمت');
  off();
  assert.equal(getSlotProvider('place'), null);
});
