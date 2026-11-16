import test from 'node:test';
import assert from 'node:assert/strict';
import { bm25Rank, chunkText, selectWithinBudget, tokenize } from './retrieval';
import { estimateTokens } from './tokens';

test('chunks are ~800 tokens and keep paragraph order', () => {
  const para = 'این یک جملهٔ نمونه دربارهٔ بازار هدف است. '.repeat(40); // ~1700 chars
  const text = Array.from({ length: 12 }, (_, i) => `بند ${i}\n${para}`).join('\n\n');
  const chunks = chunkText('f1', text);
  assert.ok(chunks.length >= 6);
  for (const c of chunks) assert.ok(c.tokens <= 900, `chunk ${c.index} has ${c.tokens} tokens`);
  assert.deepEqual(chunks.map((c) => c.index), chunks.map((_, i) => i));
  assert.ok(chunks[0].text.startsWith('بند 0'));
});

test('a single huge paragraph is split', () => {
  const chunks = chunkText('f', 'کلمه '.repeat(3000));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.tokens <= 820));
});

test('tokenize normalizes Arabic letters, digits and ZWNJ', () => {
  assert.deepEqual(tokenize('كتاب‌های ۱۲۳ علي'), ['کتاب', 'های', '123', 'علی']);
});

test('BM25 ranks the relevant chunk first and drops the unrelated ones', () => {
  const chunks = [
    { text: 'قیمت‌گذاری بسته‌های اشتراک ماهانه و تخفیف سالانه', tokens: 30 },
    { text: 'تاریخچهٔ شرکت و تیم مؤسس در سال ۱۳۹۸', tokens: 30 },
    { text: 'مخاطب اصلی ما فریلنسرهای طراح هستند', tokens: 30 },
  ];
  const ranked = bm25Rank('قیمت اشتراک', chunks);
  assert.equal(ranked[0].chunk, chunks[0]);
  assert.equal(ranked.length, 1);
  assert.deepEqual(bm25Rank('', chunks), []);
});

test('budget: only whole chunks that fit, best first', () => {
  const mk = (t: number, score: number) => ({ chunk: { tokens: t, id: `${t}` }, score });
  const out = selectWithinBudget([mk(800, 9), mk(800, 8), mk(300, 7)], 1200);
  assert.deepEqual(out.map((c) => c.id), ['800', '300']);
  assert.equal(selectWithinBudget([mk(10, 1), mk(10, 1), mk(10, 1)], 1000, 2).length, 2);
});

test('estimateTokens is monotonic', () => assert.ok(estimateTokens('aaaa') < estimateTokens('aaaa'.repeat(10))));

