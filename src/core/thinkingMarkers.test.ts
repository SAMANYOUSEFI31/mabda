import test from 'node:test';
import assert from 'node:assert/strict';
import { canSplit, convertedTo, findItem, headingSections, lineHash, parseThinking, thinkingOf } from './thinkingMarkers';

test('the four markers (Persian and Latin) at the start of a line are thinking items; the text is kept as written', () => {
  const items = parseThinking('[ایده] اشتراک هدیه برای عید\n[سؤال] آیا دانه را آسیاب‌شده بفرستیم؟\n[فرض] مشتری‌ها پیام‌رسان را بیشتر می‌خوانند\n[تصمیم باز] قیمت کارگاه گروهی\n[Idea] gift box\n[Question] shipping day?\n[Assumption] churn is low\n[Open Decision] pricing tier');
  assert.deepEqual(items.map((i) => i.kind), ['idea', 'question', 'assumption', 'open_decision', 'idea', 'question', 'assumption', 'open_decision']);
  assert.equal(items[1].text, 'آیا دانه را آسیاب‌شده بفرستیم؟');
  assert.deepEqual(items.map((i) => i.line), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('a marker in the middle of a line is NOT a marker; an empty marker is not an item; blank lines and plain lines are skipped', () => {
  assert.deepEqual(parseThinking('این یک [فرض] وسط خط است'), []);
  assert.deepEqual(parseThinking('متن ساده\n\n   \n[سؤال]\n[فرض]   '), []);
  const x = parseThinking('سلام\n\n[فرض] یک\n\nپایان');
  assert.deepEqual(x.map((i) => [i.kind, i.line]), [['assumption', 2]]);
});

test('Persian text details: ZWNJ in the marker and the text, Arabic ي/ك, bullets, leading marks, spacing, a colon after the marker', () => {
  const a = parseThinking('[تصمیم‌باز] می‌خواهیم قیمت را عوض کنیم');
  assert.equal(a[0]?.kind, 'open_decision');
  assert.equal(parseThinking('- [سوال]: كدام روز؟')[0].kind, 'question');
  assert.equal(parseThinking('‏* [ فرض ] ‌تست')[0].kind, 'assumption');
  assert.equal(parseThinking('۱. [ایده] چیزی')[0].kind, 'idea');
  assert.equal(parseThinking('[IDEA] x')[0].kind, 'idea');
  assert.equal(parseThinking('[open   decision] x')[0].kind, 'open_decision');
  assert.equal(lineHash('می‌خواهیم  قیمت را عوض کنیم'), lineHash('میخواهیم قیمت را عوض کنیم.'), 'ZWNJ, spacing and punctuation do not change the hash');
  assert.equal(lineHash('كدام روز؟'), lineHash('کدام روز'), 'Arabic letters fold');
});

test('thinkingOf: keys are note id + hash; a repeated line gets #2; notes are not changed', () => {
  const notes = [{ id: 'n1', nodeId: 'a', content: '[سؤال] چرا؟\n[سؤال] چرا؟\n[فرض] x' }, { id: 'n2', nodeId: 'b', content: '[فرض] x' }];
  const before = JSON.stringify(notes);
  const items = thinkingOf(notes);
  assert.equal(new Set(items.map((i) => i.key)).size, 4, 'all keys differ');
  assert.ok(items[1].key.endsWith('#2'));
  assert.deepEqual(items.map((i) => [i.noteId, i.nodeId]), [['n1', 'a'], ['n1', 'a'], ['n1', 'a'], ['n2', 'b']]);
  assert.equal(JSON.stringify(notes), before);
});

test('soft matching: a small edit of the line still finds the item and its conversion mark; a different line does not', () => {
  const old = parseThinking('[فرض] مشتری‌ها پیام‌رسان را از ایمیل بیشتر می‌خوانند')[0];
  const edited = parseThinking('[فرض] مشتری‌ها پیام‌رسان را از ایمیل بیشتر می‌خوانند، مخصوصاً جوان‌ها');
  assert.equal(findItem(edited, { kind: 'assumption', hash: old.hash, text: old.text })?.text.includes('جوان‌ها'), true);
  assert.equal(findItem(parseThinking('[فرض] قیمت ثابت می‌ماند'), { kind: 'assumption', hash: old.hash, text: old.text }), undefined);
  assert.equal(findItem(edited, { kind: 'question', hash: old.hash, text: old.text }), undefined, 'the kind must match');
  const item = thinkingOf([{ id: 'n1', nodeId: 'a', content: '[فرض] مشتری‌ها پیام‌رسان را از ایمیل بیشتر می‌خوانند، مخصوصاً جوان‌ها' }])[0];
  const obj = { id: 'o1', status: 'Proposed' as const, source: { kind: 'note' as const, noteId: 'n1', lineKey: old.hash, quote: old.text, at: '' } };
  assert.equal(convertedTo(item, [obj]), 'o1', 'converted ✓ survives the edit');
  assert.equal(convertedTo(item, [{ ...obj, status: 'Archived' as const }]), undefined);
  assert.equal(convertedTo(item, [{ ...obj, source: { ...obj.source, noteId: 'other' } }]), undefined);
});

test('headingSections: two or more ## headings = a note that has grown; ### is not a section', () => {
  const t = 'مقدمه\n## قیمت\nمتن یک\n### جزئیات\n## ارسال\nمتن دو';
  assert.deepEqual(headingSections(t), [{ title: 'قیمت', body: 'متن یک\n### جزئیات' }, { title: 'ارسال', body: 'متن دو' }]);
  assert.equal(canSplit(t), true);
  assert.equal(canSplit('## فقط یکی\nمتن'), false);
  assert.equal(canSplit('بدون تیتر'), false);
});
