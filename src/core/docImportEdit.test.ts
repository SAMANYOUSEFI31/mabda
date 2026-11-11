import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWithNext, splitAt } from './docImportEdit.ts';
import type { ImportChunk } from './docImportEdit.ts';

const base: ImportChunk[] = [
  { id: 'c1', text: '# قیمت\nاشتراک ماهانه', heading: 'قیمت', sectionHint: 'قیمت' },
  { id: 'c2', text: 'تخفیف سالانه', sectionHint: 'قیمت' },
  { id: 'c3', text: '# مخاطب\nفریلنسرها', heading: 'مخاطب', sectionHint: 'مخاطب' },
];

test('merge joins a chunk with the next one and keeps the first one heading; the last chunk cannot merge', () => {
  const r = mergeWithNext(base, 'c1');
  assert.equal(r.length, 2);
  assert.equal(r[0].text, '# قیمت\nاشتراک ماهانه\n\nتخفیف سالانه');
  assert.equal(r[0].heading, 'قیمت');
  assert.equal(mergeWithNext(base, 'c3'), base);
  assert.equal(mergeWithNext(base, 'nope'), base);
});

test('split cuts at a caret, keeps order and unique ids, finds a heading in the second half; an edge caret does nothing', () => {
  const one: ImportChunk[] = [{ id: 'c1', text: 'الف ب\n\n# بخش دوم\nج', sectionHint: 'اول' }];
  const at = one[0].text.indexOf('# بخش');
  const r = splitAt(one, 'c1', at);
  assert.deepEqual(r.map((c) => c.text), ['الف ب', '# بخش دوم\nج']);
  assert.equal(r[1].heading, 'بخش دوم');
  assert.equal(r[1].sectionHint, 'بخش دوم');
  assert.equal(r[0].sectionHint, 'اول');
  assert.equal(new Set(r.map((c) => c.id)).size, 2);
  assert.equal(splitAt(one, 'c1', 0), one);
  assert.equal(splitAt(one, 'c1', one[0].text.length), one);
  // splitting again never reuses an id
  const r2 = splitAt(r, r[0].id, 2);
  assert.equal(new Set(r2.map((c) => c.id)).size, 3);
});

test('merge then split of unchanged text returns the same words (nothing is lost)', () => {
  const merged = mergeWithNext(base, 'c1');
  const back = splitAt(merged, 'c1', merged[0].text.indexOf('تخفیف'));
  assert.deepEqual(back.slice(0, 2).map((c) => c.text), ['# قیمت\nاشتراک ماهانه', 'تخفیف سالانه']);
});
