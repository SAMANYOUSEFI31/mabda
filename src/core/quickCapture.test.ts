import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSectionFor, findExactDuplicate, normalizeForDuplicate, QUICK_CAPTURE_EVENT, requestQuickCapture } from './quickCapture.ts';
import type { ContextObject, Thought, TreeNode } from '../types';

const th = (id: string, text: string, status: 'open' | 'resolved' = 'open'): Thought => ({ id, workspaceId: 'w', nodeId: '', kind: 'idea', text, status, createdAt: '', updatedAt: '' });
const ob = (id: string, title: string, content: string, status: ContextObject['status'] = 'Confirmed'): ContextObject => ({ id, workspaceId: 'w', type: 'Fact', status, provenance: 'User Input', title, content, nodeId: 'n', version: 1 } as ContextObject);

test('نرمال‌سازی: یی/کاف عربی، نیم‌فاصله، رقم، اعراب، نشانهٔ نوع و فاصله‌ها یکی می‌شوند', () => {
  const a = normalizeForDuplicate('[ایده] قيمت اشتراك ۳ ماهه  می‌خواهیم');
  const b = normalizeForDuplicate('قیمت اشتراک 3 ماهه می خواهیم');
  assert.equal(a, b);
  assert.equal(normalizeForDuplicate('سلامٌ'), normalizeForDuplicate('سلام'));
});

test('خط‌های یک فکر چندخطی با `\\` پایان خط هم‌ارز متن یک‌خطی است', () => {
  assert.equal(normalizeForDuplicate('[سؤال] قیمت چقدر باشد\\\nبرای مشتری تازه؟'), normalizeForDuplicate('قیمت چقدر باشد برای مشتری تازه؟'));
});

test('تکراری فقط وقتی دقیقاً یکسان باشد؛ شبیه‌بودن کافی نیست', () => {
  const thoughts = [th('t1', 'قیمت اشتراک را بالا ببریم')];
  assert.equal(findExactDuplicate('قیمت اشتراک را بالا ببریم', thoughts, [])?.id, 't1');
  assert.equal(findExactDuplicate('  قیمت اشتراك را   بالا ببريم ', thoughts, [])?.id, 't1');
  assert.equal(findExactDuplicate('قیمت اشتراک را کمی بالا ببریم', thoughts, []), null);
});

test('فکر حل‌شده و دانش بایگانی‌شده تکراری حساب نمی‌شوند؛ دانش فعال می‌شود', () => {
  assert.equal(findExactDuplicate('الف ب', [th('t', 'الف ب', 'resolved')], []), null);
  assert.equal(findExactDuplicate('الف ب', [], [ob('o', 'x', 'الف ب', 'Archived')]), null);
  assert.deepEqual(findExactDuplicate('الف ب', [], [ob('o', 'x', 'الف ب')]), { kind: 'object', id: 'o', text: 'x' });
});

test('متن خالی یا یک حرفی هرگز تکراری نیست', () => {
  assert.equal(findExactDuplicate('', [th('t', '')], []), null);
  assert.equal(findExactDuplicate('ا', [th('t', 'ا')], []), null);
});

test('بخش پیش‌فرض: بخش فعلی اگر در درخت هست، وگرنه «تازه‌ها»', () => {
  const nodes = [{ id: 'a', label: 'الف' }] as TreeNode[];
  assert.equal(defaultSectionFor('a', nodes), 'a');
  assert.equal(defaultSectionFor('gone', nodes), '');
  assert.equal(defaultSectionFor(null, nodes), '');
});

test('requestQuickCapture بدون window بی‌اثر و بی‌خطاست', () => {
  assert.equal(typeof QUICK_CAPTURE_EVENT, 'string');
  assert.doesNotThrow(() => requestQuickCapture('x'));
});
