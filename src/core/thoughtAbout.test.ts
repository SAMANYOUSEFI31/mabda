import test from 'node:test';
import assert from 'node:assert/strict';
import { aboutOf, aboutToken, stripAbout, thoughtInScope, thoughtsAbout } from './thoughtAbout.ts';
import { thinkingSpace } from './thinkingSpace.ts';
import type { ContextObject, TreeNode } from '../types';

const nodes = [{ id: 'price', label: 'قیمت اشتراک' }, { id: 'ship', label: 'ارسال' }, { id: 'brand', label: 'برند' }] as unknown as TreeNode[];
const ob = (id: string, title: string, nodeId: string, status = 'Confirmed') => ({ id, title, nodeId, status, type: 'Decision', content: 'x', version: 1 }) as unknown as ContextObject;
const objs = [ob('o1', 'تخفیف سالانه', 'price'), ob('o2', 'هزینهٔ ارسال', 'ship')];

test('دربارهٔ: دانش بر بخش همنام مقدم است؛ بخش با برچسب خودش؛ ناشناخته نادیده', () => {
  const a = aboutOf(`چه کنیم ${aboutToken('تخفیف سالانه')} ${aboutToken('ارسال')} ${aboutToken('هیچ')}`, objs, nodes);
  assert.deepEqual(a, { objectIds: ['o1'], nodeIds: ['ship'] });
});

test('stripAbout جمله را بدون هدف‌ها نشان می‌دهد', () => {
  assert.equal(stripAbout(`قیمت را کم کنیم ${aboutToken('تخفیف سالانه')}`), 'قیمت را کم کنیم');
});

test('فکر در فیلتر هر بخشی که به آن اشاره می‌کند دیده می‌شود، نه فقط خانه‌اش', () => {
  const notes = [{ id: 'n1', nodeId: 'brand', content: `[ایده] قیمت و ارسال یکی شود ${aboutToken('قیمت اشتراک')} ${aboutToken('هزینهٔ ارسال')}` }];
  const inPrice = thinkingSpace({ objects: objs, notes, nodes }, { nodeId: 'price' });
  const inShip = thinkingSpace({ objects: objs, notes, nodes }, { nodeId: 'ship' });
  const inBrandOnly = thinkingSpace({ objects: objs, notes: [{ ...notes[0], nodeId: 'brand', content: '[ایده] فقط برند' }], nodes }, { nodeId: 'price' });
  assert.equal(inPrice.thoughts.length, 1);
  assert.equal(inShip.thoughts.length, 1, 'via the knowledge it names');
  assert.equal(inBrandOnly.thoughts.length, 0);
});

test('فکرهای باز دربارهٔ یک دانش', () => {
  const t = [{ text: `الف ${aboutToken('تخفیف سالانه')}` }, { text: 'ب' }];
  assert.deepEqual(thoughtsAbout(t, 'o1', objs, nodes), [t[0]]);
  assert.equal(thoughtInScope({ nodeId: 'brand', text: t[0].text }, new Set(['price']), objs, nodes), true);
});
