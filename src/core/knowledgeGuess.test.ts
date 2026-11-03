import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_TITLE, guessTitle, guessType } from './knowledgeGuess';

test('red line: a strong prohibition, or a weak negative with no decision words', () => {
  for (const t of ['تخفیف نداریم', 'هرگز تخفیف نمی‌دهیم', 'نباید قیمت را پنهان کنیم', 'بازگشت وجه ممنوع است', 'این یک خط قرمز است: پیام شبانه نمی‌فرستیم', 'ما شعبهٔ حضوری ندارد']) assert.equal(guessType(t), 'Constraint', t);
});

test('decision: «تصمیم گرفتیم / انتخاب کردیم / قرار شد …»; it beats a weak negative', () => {
  for (const t of ['تصمیم گرفتیم اینستاگرام کانال اصلی باشد', 'انتخاب کردیم ارسال را با پست پیشتاز انجام بدهیم', 'قرار شد قیمت از ماه بعد عوض شود', 'تصمیم گرفتیم تخفیف ندهیم']) assert.equal(guessType(t), 'Decision', t);
});

test('a strong prohibition wins over a decision; everything else is a fact', () => {
  assert.equal(guessType('تصمیم گرفتیم هرگز تخفیف ندهیم'), 'Constraint');
  for (const t of ['مخاطب اصلی ما فریلنسرهای طراح‌اند', 'قیمت اشتراک ماهانه پانصد هزار تومان است', '', '   ']) assert.equal(guessType(t), 'Fact', t);
});

test('Arabic letters, ZWNJ and punctuation do not matter', () => {
  assert.equal(guessType('تخفيف نمي‌دهيم'.replace('نمي‌دهيم', 'نمی‌دهیم')), 'Constraint');
  assert.equal(guessType('«هرگز» تخفیف نمیدهیم!'), 'Constraint');
  assert.equal(guessType('تصمیم‌ گرفتیم، کانال تلگرام باشد.'.replace('تصمیم‌ ', 'تصمیم ')), 'Decision');
});

test('title: the first sentence, no list marker, no trailing punctuation, never cut mid-word, a mention loses its @«»', () => {
  assert.equal(guessTitle('مخاطب اصلی ما فریلنسرهای طراح‌اند. بیشترشان زیر سی سال دارند.'), 'مخاطب اصلی ما فریلنسرهای طراح‌اند');
  assert.equal(guessTitle('- قیمت پایه: پانصد هزار تومان\nخط دوم'), 'قیمت پایه: پانصد هزار تومان');
  assert.equal(guessTitle('## لحن برند\nمتن'), 'لحن برند');
  const long = guessTitle('این یک جملهٔ بسیار بلند است که هیچ نقطه‌ای ندارد و باید در مرز یک واژه بریده شود نه وسط آن');
  assert.ok(long.length <= 60 && !long.endsWith(' ') && 'این یک جملهٔ بسیار بلند است که هیچ نقطه‌ای ندارد و باید در مرز یک واژه بریده شود نه وسط آن'.startsWith(long));
  assert.equal(guessTitle('بر پایهٔ @«قیمت پایه» عمل می‌کنیم'), 'بر پایهٔ قیمت پایه عمل می‌کنیم');
  assert.equal(guessTitle(''), FALLBACK_TITLE);
  assert.equal(guessTitle('   \n  '), FALLBACK_TITLE);
  assert.equal(guessTitle('فقط یک کلمه'), 'فقط یک کلمه');
});
