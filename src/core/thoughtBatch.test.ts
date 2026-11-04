import test from 'node:test';
import assert from 'node:assert/strict';
import { composeThoughtBatch, isBatch, parseThoughtBatch } from './thoughtBatch.ts';
import { parseThinking } from './thinkingMarkers.ts';

test('هر خط یک فکر؛ خالی و تیتر نادیده؛ نقطه‌ها برداشته می‌شوند', () => {
  const r = parseThoughtBatch('# جلسه\n\n- قیمت را کم کنیم\n۲. فروش نوروزی\n');
  assert.deepEqual(r.map((l) => l.text), ['قیمت را کم کنیم', 'فروش نوروزی']);
});

test('نوع: برچسب صریح، سپس ؟، سپس پیش‌فرض؛ فرض و تصمیم باز حدس زده نمی‌شوند', () => {
  const r = parseThoughtBatch('[فرض] مشتری‌ها جوانند\nقیمت چقدر باشد؟\nما فرض می‌کنیم و تصمیم باز است\nساده', 'open_decision');
  assert.deepEqual(r.map((l) => [l.kind, l.how]), [['assumption', 'marker'], ['question', 'question'], ['open_decision', 'default'], ['open_decision', 'default']]);
});

test('یک خط = رفتار قدیمی؛ چند خط = پیش‌نمایش', () => {
  assert.equal(isBatch('فقط یک فکر'), false);
  assert.equal(isBatch('یکی\nدوتا'), true);
});

test('هر بخش یک یادداشت؛ هر خط با برچسب خودش و دوباره خوانده می‌شود', () => {
  const notes = composeThoughtBatch([
    { text: 'الف', kind: 'idea', nodeId: 'n1' }, { text: 'ب؟', kind: 'question', nodeId: 'n2' }, { text: 'ج', kind: 'assumption', nodeId: 'n1' },
  ]);
  assert.equal(notes.length, 2);
  const kinds = parseThinking(notes[0].content).map((i) => [i.kind, i.text]);
  assert.deepEqual(kinds, [['idea', 'الف'], ['assumption', 'ج']]);
});
