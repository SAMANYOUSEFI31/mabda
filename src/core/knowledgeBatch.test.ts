import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKnowledgeBatch } from './knowledgeBatch.ts';

test('هر خط یک پیشنهاد؛ تیتر و خط خالی نادیده', () => {
  const r = parseKnowledgeBatch('# برند\n\n- لحن ما گرم است\n۲. هرگز تخفیف بیش از ۲۰٪ نمی‌دهیم');
  assert.equal(r.length, 2);
  assert.equal(r[0].type, 'Fact');
  assert.equal(r[1].type, 'Constraint');
});

test('برچسب صریح بر قاعده مقدم است و از متن برداشته می‌شود', () => {
  const r = parseKnowledgeBatch('[تصمیم] هرگز نمی‌فروشیم');
  assert.deepEqual([r[0].type, r[0].how, r[0].content], ['Decision', 'label', 'هرگز نمی‌فروشیم']);
});
