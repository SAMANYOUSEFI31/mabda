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

// ── no syntax needed: a line that ends with ؟ / ? is a question by itself ──
import { isQuestionLine, kindOfLine, markLine, MARKER_OF } from './thinkingMarkers';

test('a line ending with ؟ or ? is a question — Persian, Latin, ZWNJ, closing quotes and invisible marks after it', () => {
  const t = parseThinking([
    'آیا دانه را آسیاب‌شده هم بفرستیم؟',
    'Should we ship ground beans?',
    'می‌شود قیمت را عوض کرد؟‌',
    '«چرا این‌قدر دیر؟»',
    'تمدید می‌کنند؟ ‏',
    '- بستهٔ هدیه چطور؟',
    '۱. کدام کانال بهتر است؟',
    'یک جملهٔ عادی است.',
    'وسط؟ خط است',
    'https://example.com/a?',
    '؟',
    '??',
    '## عنوان بخش؟',
  ].join('\n'));
  assert.deepEqual(t.map((i) => [i.line, i.kind, i.inferred]), [[0, 'question', true], [1, 'question', true], [2, 'question', true], [3, 'question', true], [4, 'question', true], [5, 'question', true], [6, 'question', true]]);
  assert.equal(t[5].text, 'بستهٔ هدیه چطور؟', 'the bullet is not part of the text');
  assert.equal(t[0].hash, lineHash('آیا دانه را آسیاب‌شده هم بفرستیم'), 'ZWNJ and the mark do not change the hash');
});

test('an explicit marker wins over the question mark; the bracket syntax keeps working; the same line is never two items', () => {
  const t = parseThinking('[فرض] آیا مشتری تمدید می‌کند؟\n[سؤال] کدام روز؟\n[ایده] جعبه؟');
  assert.deepEqual(t.map((i) => [i.kind, i.inferred ?? false]), [['assumption', false], ['question', false], ['idea', false]]);
  assert.equal(t.length, 3);
});

test('isQuestionLine / kindOfLine', () => {
  assert.equal(isQuestionLine('چرا؟'), true);
  assert.equal(isQuestionLine('چرا ؟'), true);
  assert.equal(isQuestionLine('چرا?'), true);
  assert.equal(isQuestionLine('چرا.'), false);
  assert.equal(isQuestionLine('؟'), false);
  assert.equal(isQuestionLine('# چرا؟'), false);
  assert.equal(kindOfLine('[تصمیم باز] چه روزی؟'), 'open_decision');
  assert.equal(kindOfLine('چه روزی؟'), 'question');
  assert.equal(kindOfLine('یک خط'), null);
});

test('markLine: the user picks from a menu, the marker is written for her; only that line changes; bullets stay; it is reversible', () => {
  const note = 'اول\n- می‌خواهیم قیمت را عوض کنیم\n۱. چرا؟\nآخر';
  const a = markLine(note, 1, 'open_decision');
  assert.equal(a, 'اول\n- [تصمیم باز] می‌خواهیم قیمت را عوض کنیم\n۱. چرا؟\nآخر');
  assert.deepEqual(parseThinking(a).filter((i) => i.line === 1).map((i) => i.kind), ['open_decision']);
  assert.equal(markLine(a, 1, null), note, 'removing the marker restores the line exactly');
  assert.equal(markLine(a, 1, 'assumption'), 'اول\n- [فرض] می‌خواهیم قیمت را عوض کنیم\n۱. چرا؟\nآخر', 'another kind replaces the marker');
  // no-ops
  assert.equal(markLine(note, 2, 'question'), note, 'already a question by its ؟');
  assert.equal(markLine(a, 1, 'open_decision'), a);
  assert.equal(markLine(note, 99, 'idea'), note);
  assert.equal(markLine('اول\n\nسوم', 1, 'idea'), 'اول\n\nسوم', 'a blank line takes no marker');
  assert.equal(markLine(note, 0, null), note);
  // a marked question keeps its hash, so a conversion made before still matches
  const before = parseThinking('تمدید می‌کنند؟')[0];
  const after = parseThinking(markLine('تمدید می‌کنند؟', 0, 'assumption'))[0];
  assert.equal(before.hash, after.hash);
  assert.equal(MARKER_OF.question, '[سؤال]');
  assert.equal(markLine('a\r\nb', 1, 'idea'), 'a\r\n[ایده] b');
});
