import test from 'node:test';
import assert from 'node:assert/strict';
import { diffWords, isSame, sidesOf, titleSimilarity, tokenize } from './textDiff';

const join = (segs: ReturnType<typeof diffWords>, kind: string) => segs.filter((s) => s.kind === kind).map((s) => s.text);

test('tokenize keeps Persian words (with half-space) whole, splits punctuation and whitespace', () => {
  assert.deepEqual(tokenize('می‌خواهیم، بفروشیم.'), ['می‌خواهیم', '،', ' ', 'بفروشیم', '.']);
  assert.deepEqual(tokenize('قیمت 5M تومان'), ['قیمت', ' ', '5M', ' ', 'تومان']);
});

test('a changed word is shown as removed + added; the rest stays', () => {
  const d = diffWords('قیمت پایه ماهانه پنج میلیون تومان است', 'قیمت پایه ماهانه هفت میلیون تومان است');
  assert.deepEqual(join(d, 'del'), ['پنج']);
  assert.deepEqual(join(d, 'add'), ['هفت']);
  assert.equal(sidesOf(d).before.map((s) => s.text).join(''), 'قیمت پایه ماهانه پنج میلیون تومان است');
  assert.equal(sidesOf(d).after.map((s) => s.text).join(''), 'قیمت پایه ماهانه هفت میلیون تومان است');
});

test('inserted and deleted words, mixed RTL/LTR text, identical text', () => {
  const ins = diffWords('مخاطب ما طراحان هستند', 'مخاطب اصلی ما طراحان فریلنسر هستند');
  assert.deepEqual(join(ins, 'add').map((x) => x.trim()), ['اصلی', 'فریلنسر']);
  assert.deepEqual(join(ins, 'del'), []);
  const mixed = diffWords('از Notion و Slack استفاده می‌کنیم', 'از Linear و Slack استفاده می‌کنیم');
  assert.deepEqual([join(mixed, 'del'), join(mixed, 'add')], [['Notion'], ['Linear']]);
  assert.equal(isSame(diffWords('الف ب', 'الف ب')), true);
  assert.equal(isSame(diffWords('', '')), true);
  assert.deepEqual(diffWords('', 'تازه'), [{ kind: 'add', text: 'تازه' }]);
  assert.deepEqual(diffWords('قدیمی', ''), [{ kind: 'del', text: 'قدیمی' }]);
});

test('reassembling either side always gives back the original text (fuzz)', () => {
  const words = ['الف', 'ب', 'پ', 'قیمت', 'می‌شود', '،', '.', ' ', 'X1', 'تومان'];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const text = () => Array.from({ length: Math.floor(rnd() * 25) }, () => words[Math.floor(rnd() * words.length)]).join(' ');
  for (let i = 0; i < 200; i++) {
    const a = text(), b = text();
    const sides = sidesOf(diffWords(a, b));
    assert.equal(sides.before.map((s) => s.text).join(''), a);
    assert.equal(sides.after.map((s) => s.text).join(''), b);
  }
});

test('very long texts do not hang (fall back to one replaced block)', () => {
  const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(' ');
  const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(' ');
  const t0 = Date.now();
  const d = diffWords(a, b);
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(d.map((s) => s.kind), ['del', 'add']);
});

test('titleSimilarity: close titles score high, unrelated ones low', () => {
  assert.ok(titleSimilarity('قیمت پایه محصول', 'قیمت پایه ماهانهٔ محصول') > 0.5);
  assert.ok(titleSimilarity('قیمت پایه', 'لحن برند') < 0.2);
  assert.equal(titleSimilarity('', 'x'), 0);
});

import { diffStats, diffSummary } from './textDiff';
import { versionTexts } from './versionHistory';
import type { ContextChange } from '../types';

test('diffStats / diffSummary: words removed and added, in plain Persian', () => {
  const s = diffWords('قیمت ماهانه ۳۰۰ هزار تومان است', 'قیمت ماهانه ۴۵۰ هزار تومان برای چهار بسته است');
  assert.deepEqual(diffStats(s), { removed: 1, added: 4 });
  assert.equal(diffSummary(s), '1 کلمه حذف، 4 کلمه اضافه');
  assert.equal(diffSummary(diffWords('الف ب', 'الف ب')), 'متن تغییری نکرده');
  assert.equal(diffSummary(diffWords('الف ب', 'الف')), '1 کلمه حذف');
  assert.equal(diffSummary(diffWords('الف ب', 'الف ب.')), 'فقط نشانه‌گذاری یا فاصله عوض شد');
  assert.equal(diffSummary(diffWords('a', 'b c'), (n) => `«${n}»`), '«1» کلمه حذف، «2» کلمه اضافه');
});

const ch = (id: string, p: Partial<ContextChange>): ContextChange => ({ id, workspaceId: 'w', objectId: 'o1', fromVersion: 0, toVersion: 1, kind: 'edited', actor: 'user', at: '2026-01-01T00:00:00Z', ...p } as ContextChange);
test('versionTexts: every version of one object rebuilt from its Change records', () => {
  const v = versionTexts([
    ch('c3', { fromVersion: 2, toVersion: 3, at: '2026-01-03T00:00:00Z', before: { content: 'دو' }, after: { content: 'سه' } }),
    ch('c1', { kind: 'created', fromVersion: 0, toVersion: 1, at: '2026-01-01T00:00:00Z', after: { title: 'عنوان', content: 'یک' } }),
    ch('c2', { fromVersion: 1, toVersion: 2, at: '2026-01-02T00:00:00Z', before: { content: 'یک' }, after: { content: 'دو', title: 'عنوان تازه' } }),
    ch('m', { kind: 'status_changed', fromVersion: 3, toVersion: 3, at: '2026-01-04T00:00:00Z', before: { status: 'Proposed' }, after: { status: 'Confirmed' } }),
  ]);
  assert.deepEqual(v.map((x) => [x.version, x.title, x.content]), [[1, 'عنوان', 'یک'], [2, 'عنوان تازه', 'دو'], [3, 'عنوان تازه', 'سه']]);
  assert.deepEqual(versionTexts([]), []);
  // only an edit is known (no creation record): its before and after are still two comparable versions
  assert.deepEqual(versionTexts([ch('x', { fromVersion: 4, toVersion: 5, before: { content: 'الف' }, after: { content: 'ب' } })]).map((x) => [x.version, x.content]), [[4, 'الف'], [5, 'ب']]);
});
