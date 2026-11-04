import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLines, insertSoftBreak, joinToPrevious, splitFromPrevious } from './batchLines.ts';
import { composeThoughtBatch, isBatch, parseThoughtBatch } from './thoughtBatch.ts';
import { parseKnowledgeBatch } from './knowledgeBatch.ts';
import { continuationLines, markLine, parseThinking, thinkingOf } from './thinkingMarkers.ts';
import { composeThought, resolveThoughtLine } from './thoughts.ts';
import { optionsOf } from './decisionOptions.ts';

test('Enter = فکر بعدی، Shift+Enter = خط تازه در همان فکر (خط تورفته)', () => {
  const g = groupLines('قیمت را کم کنیم\n  چون رقیب ارزان‌تر است\n  و فروش افت کرده\nارسال رایگان شود؟');
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].rest.map((r) => r.text), ['چون رقیب ارزان‌تر است', 'و فروش افت کرده']);
  const r = insertSoftBreak('الف', 3);
  assert.equal(r.value, 'الف\n  ');
  assert.equal(r.caret, 6);
});

test('به قبلی بچسبان / جدا کن، رفت‌وبرگشتی', () => {
  const t = 'الف\nب\nج';
  const joined = joinToPrevious(t, 1);
  assert.equal(joined, 'الف\n  ب\nج');
  assert.equal(groupLines(joined).length, 2);
  assert.equal(splitFromPrevious(joined, 1), t);
  assert.equal(joinToPrevious(t, 0), t, 'the first line has no previous');
});

test('پیش‌نمایش: فکر چندخطی یکی است؛ سؤال از آخرین خط؛ برچسب از اولین خط', () => {
  const r = parseThoughtBatch('[فرض] مشتری‌ها جوانند\n  ولی کم‌درآمدند\nقیمت چقدر باشد\n  برای سه ماهه؟\nساده');
  assert.deepEqual(r.map((x) => [x.kind, x.how]), [['assumption', 'marker'], ['question', 'question'], ['idea', 'default']]);
  assert.equal(r[0].text, 'مشتری‌ها جوانند\nولی کم‌درآمدند');
  assert.equal(isBatch('یک فکر\n  با ادامه'), false, 'one thought over two lines is not a batch');
});

test('ذخیره: هر خط جز آخرین با \\ تمام می‌شود و دوباره همان فکر خوانده می‌شود (رفت‌وبرگشت)', () => {
  const [note] = composeThoughtBatch([{ text: 'الف\nب\nج', kind: 'idea', nodeId: 'n' }, { text: 'تک‌خطی', kind: 'question', nodeId: 'n' }]);
  assert.equal(note.content, '[ایده] الف\\\nب\\\nج\n[سؤال] تک‌خطی');
  const items = parseThinking(note.content);
  assert.equal(items.length, 2);
  assert.equal(items[0].text, 'الف\nب\nج');
  assert.deepEqual([items[0].line, items[0].endLine], [0, 2]);
  assert.equal(items[1].line, 3);
  assert.deepEqual([...continuationLines(note.content)], [1, 2]);
  assert.equal(thinkingOf([{ id: 'n1', nodeId: 'n', content: note.content }]).length, 2);
});

test('یادداشت‌ها و فکرهای موجود سالم می‌مانند: بک‌اسلش بدون برچسب چیزی را عوض نمی‌کند', () => {
  const legacy = 'متن عادی با بک‌اسلش \\\nخط بعد؟\n[ایده] تک‌خطی قدیمی\n[سؤال] قدیمی؟';
  const items = parseThinking(legacy);
  assert.deepEqual(items.map((i) => [i.kind, i.text]), [['question', 'خط بعد؟'], ['idea', 'تک‌خطی قدیمی'], ['question', 'قدیمی؟']]);
  assert.ok(items.every((i) => i.endLine === undefined));
});

test('composeThought چندخطی، علامت‌زدن و تبدیل به بخش فقط همان فکر را عوض می‌کند', () => {
  const content = `${composeThought('الف\nب', 'idea')}\n[ایده] دیگری`;
  assert.equal(content, '[ایده] الف\\\nب\n[ایده] دیگری');
  assert.equal(markLine(content, 0, 'question').split('\n')[0], '[سؤال] الف\\');
  const item = parseThinking(content)[0];
  const done = resolveThoughtLine(content, item, 'قیمت');
  assert.equal(done.split('\n').length, 2, 'two lines of the thought became one record line');
  assert.ok(done.startsWith('الف ب ✓'));
  assert.ok(done.endsWith('[ایده] دیگری'));
});

test('گزینه‌های تصمیم بعد از آخرین خط یک پرسش چندخطی شروع می‌شوند', () => {
  const content = '[تصمیم باز] کانال فروش\\\nکارگاه چه باشد؟\n- اینستاگرام\n- حضوری';
  assert.deepEqual(optionsOf(content, 0, [], []).map((o) => o.title), ['اینستاگرام', 'حضوری']);
});

test('چند دانش: همان قاعده؛ محتوای چندخطی، عنوان از خط اول', () => {
  const r = parseKnowledgeBatch('[تصمیم] کانال اصلی اینستاگرام است\n  و تلگرام فقط پشتیبانی\nلحن ما گرم است');
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].type, r[0].content, r[0].rest], ['Decision', 'کانال اصلی اینستاگرام است\nو تلگرام فقط پشتیبانی', [1]]);
});
