import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  precisionAtK, recallAtK, wrongLinkRateAtK, meanDefined, ndcgAtK, thresholdSweep, suggestThreshold,
  confusion, calibration, selectiveAccuracy, twoFoldThreshold,
  normalizeFa, editDistance, cer, wer, percentile, summarizeLatency,
  type Relevant,
} from './metrics.ts';

const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.ok(a !== null && Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
};

const rel = (): Relevant => new Map<string, 1 | 2>([['a', 2], ['b', 1], ['c', 1]]);

test('precisionAtK: basics, k beyond list, empty, k=0', () => {
  const ranked = ['a', 'x', 'b', 'y'];
  close(precisionAtK(ranked, rel(), 2), 0.5);
  close(precisionAtK(ranked, rel(), 10), 0.5); // denominator is min(k, len) = 4
  close(precisionAtK(ranked, rel(), 1), 1);
  assert.equal(precisionAtK([], rel(), 5), 0);
  assert.equal(precisionAtK(ranked, rel(), 0), 0);
  assert.equal(precisionAtK(ranked, new Map(), 3), 0);
});

test('recallAtK: basics, k beyond list, null when no relevant', () => {
  const ranked = ['a', 'x', 'b', 'y'];
  close(recallAtK(ranked, rel(), 1), 1 / 3);
  close(recallAtK(ranked, rel(), 3), 2 / 3);
  close(recallAtK(ranked, rel(), 100), 2 / 3);
  assert.equal(recallAtK(ranked, new Map(), 3), null);
  assert.equal(recallAtK([], rel(), 3), 0);
});

test('wrongLinkRateAtK: wrong and hard-negative fractions', () => {
  const ranked = ['a', 'x', 'b', 'y'];
  const hn = new Set(['x']);
  const r = wrongLinkRateAtK(ranked, rel(), hn, 4);
  close(r.wrong, 0.5);
  close(r.hardNegative, 0.25);
  const r2 = wrongLinkRateAtK(ranked, rel(), hn, 2);
  close(r2.wrong, 0.5);
  close(r2.hardNegative, 0.5);
  assert.deepEqual(wrongLinkRateAtK([], rel(), hn, 5), { wrong: 0, hardNegative: 0 });
  const r3 = wrongLinkRateAtK(ranked, rel(), hn, 100); // k larger than list
  close(r3.wrong, 0.5);
});

test('meanDefined ignores nulls', () => {
  close(meanDefined([1, null, 3]), 2);
  assert.equal(meanDefined([null, null]), null);
  assert.equal(meanDefined([]), null);
  close(meanDefined([0, 0, null]), 0);
});

test('ndcgAtK: perfect, reversed, none relevant, empty ranking', () => {
  const r = new Map<string, 1 | 2>([['a', 2], ['b', 1]]);
  close(ndcgAtK(['a', 'b'], r, 2), 1);
  const dcg = 1 / Math.log2(2) + 2 / Math.log2(3);
  const idcg = 2 / Math.log2(2) + 1 / Math.log2(3);
  close(ndcgAtK(['b', 'a'], r, 2), dcg / idcg);
  assert.ok(ndcgAtK(['b', 'a'], r, 2)! < 1);
  assert.equal(ndcgAtK(['a'], new Map(), 5), null);
  assert.equal(ndcgAtK([], r, 5), 0);
  close(ndcgAtK(['a', 'b'], r, 50), 1); // k beyond list
  close(ndcgAtK(['x', 'a'], r, 1), 0); // nothing relevant at rank 1
});

const scored = [
  { score: 0.9, relevant: true },
  { score: 0.8, relevant: true },
  { score: 0.7, relevant: false },
  { score: 0.6, relevant: true },
  { score: 0.5, relevant: false },
];

test('thresholdSweep: ascending thresholds with precision/recall/kept', () => {
  const s = thresholdSweep(scored);
  assert.deepEqual(s.map(p => p.threshold), [0.5, 0.6, 0.7, 0.8, 0.9]);
  assert.deepEqual(s.map(p => p.kept), [5, 4, 3, 2, 1]);
  close(s[0].precision, 0.6);
  close(s[0].recall, 1);
  close(s[3].precision, 1);
  close(s[3].recall, 2 / 3);
  close(s[4].recall, 1 / 3);
});

test('thresholdSweep: ties collapse to one threshold, totalRelevant override, empty', () => {
  const s = thresholdSweep([{ score: 1, relevant: true }, { score: 1, relevant: false }]);
  assert.equal(s.length, 1);
  assert.equal(s[0].kept, 2);
  close(s[0].precision, 0.5);
  const s2 = thresholdSweep(scored, 6);
  close(s2[0].recall, 0.5);
  assert.deepEqual(thresholdSweep([]), []);
  assert.equal(thresholdSweep([{ score: 1, relevant: false }])[0].recall, 0);
});

test('suggestThreshold: lowest threshold meeting precision; null if none', () => {
  const s = thresholdSweep(scored);
  assert.equal(suggestThreshold(s, 0.7), 0.6);
  assert.equal(suggestThreshold(s, 1), 0.8);
  assert.equal(suggestThreshold(s, 1.1), null);
  assert.equal(suggestThreshold([], 0.5), null);
  assert.equal(suggestThreshold(s, 0), 0.5);
});

test('confusion: matrix, per-label stats, unanswered', () => {
  const c = confusion([
    { expected: 'a', predicted: 'a' },
    { expected: 'a', predicted: 'b' },
    { expected: 'b', predicted: 'b' },
    { expected: 'b', predicted: null },
  ]);
  assert.deepEqual(c.labels, ['a', 'b']);
  assert.deepEqual(c.matrix.a, { a: 1, b: 1, '∅': 0 });
  assert.deepEqual(c.matrix.b, { a: 0, b: 1, '∅': 1 });
  close(c.accuracy, 0.5);
  assert.equal(c.unanswered, 1);
  close(c.perLabel.a.precision, 1);
  close(c.perLabel.a.recall, 0.5);
  close(c.perLabel.a.f1, 2 / 3);
  close(c.perLabel.b.precision, 0.5);
  close(c.perLabel.b.recall, 0.5);
  close(c.perLabel.b.f1, 0.5);
  assert.equal(c.perLabel.b.support, 2);
});

test('confusion: never-predicted label has null precision; empty input', () => {
  const c = confusion([{ expected: 'x', predicted: 'y' }]);
  assert.equal(c.perLabel.x.precision, null);
  assert.equal(c.perLabel.x.f1, null);
  assert.equal(c.perLabel.y.recall, null); // support 0
  assert.equal(c.perLabel.y.support, 0);
  close(c.accuracy, 0);
  const e = confusion([]);
  assert.deepEqual(e.labels, []);
  assert.equal(e.accuracy, 0);
  assert.equal(e.unanswered, 0);
});

test('calibration: bins, ece, withoutConfidence', () => {
  const r = calibration([
    { confidence: 0.95, correct: true },
    { confidence: 0.95, correct: false },
    { confidence: 0.6, correct: true },
    { confidence: 0.3, correct: false },
    { confidence: undefined, correct: true },
  ]);
  assert.equal(r.withoutConfidence, 1);
  assert.deepEqual(r.bins.map(b => b.count), [1, 1, 0, 2]);
  assert.deepEqual(r.bins.map(b => b.accuracy), [0, 1, null, 0.5]);
  assert.equal(r.bins[0].from, 0);
  assert.equal(r.bins[3].to, 1.0001);
  close(r.ece, 0.25 * 0.3 + 0.25 * 0.4 + 0.5 * 0.45);
});

test('calibration: no confidence at all, boundary values, out of range', () => {
  const r = calibration([{ confidence: undefined, correct: true }]);
  assert.equal(r.ece, null);
  assert.equal(r.withoutConfidence, 1);
  const b = calibration([{ confidence: 0.5, correct: true }, { confidence: 1, correct: true }, { confidence: -1, correct: false }, { confidence: 7, correct: true }]);
  assert.deepEqual(b.bins.map(x => x.count), [1, 1, 0, 2]); // 0.5 goes to [0.5,0.7); 1 and 7 to last bin; -1 to first
  assert.equal(calibration([]).ece, null);
});

test('selectiveAccuracy: coverage and accuracies, null-safe', () => {
  const s = selectiveAccuracy([
    { answered: true, correct: true },
    { answered: true, correct: false },
    { answered: false, correct: false },
    { answered: true, correct: true },
  ]);
  close(s.coverage, 0.75);
  close(s.accuracyWhenAnswered, 2 / 3);
  close(s.accuracyOverall, 0.5);
  assert.deepEqual(selectiveAccuracy([]), { coverage: null, accuracyWhenAnswered: null, accuracyOverall: null });
  const none = selectiveAccuracy([{ answered: false, correct: false }]);
  assert.equal(none.accuracyWhenAnswered, null);
  close(none.coverage, 0);
  close(none.accuracyOverall, 0);
});

test('twoFoldThreshold: separable data gives perfect honest score', () => {
  const items = [0.9, 0.9, 0.1, 0.1, 0.8, 0.8, 0.2, 0.2].map(score => ({ score, positive: score >= 0.5 }));
  const r = twoFoldThreshold(items);
  close(r.f1, 1);
  close(r.precision, 1);
  close(r.recall, 1);
  assert.deepEqual(r.thresholds, [0.8, 0.8]);
  assert.equal(r.bestThresholdAll, 0.8);
});

test('twoFoldThreshold: ties pick higher threshold; noisy data is not above optimistic', () => {
  const tie = twoFoldThreshold([
    { score: 1, positive: true }, { score: 2, positive: false }, { score: 2.5, positive: false }, { score: 3, positive: true },
  ]);
  assert.equal(tie.bestThresholdAll, 3);
  const noisy = Array.from({ length: 20 }, (_, i) => ({ score: (i * 7) % 10, positive: i % 3 === 0 }));
  const r = twoFoldThreshold(noisy);
  assert.ok(r.f1 >= 0 && r.f1 <= 1 && r.precision >= 0 && r.precision <= 1 && r.recall >= 0 && r.recall <= 1);
  assert.equal(r.thresholds.length, 2);
});

test('twoFoldThreshold: empty and single item do not throw', () => {
  const e = twoFoldThreshold([]);
  assert.equal(e.f1, 0);
  assert.equal(e.bestThresholdAll, Infinity);
  const one = twoFoldThreshold([{ score: 1, positive: true }]);
  assert.equal(one.thresholds[1], Infinity);
  assert.equal(typeof one.f1, 'number');
});

test('normalizeFa: ZWNJ and space variants compare equal', () => {
  assert.equal(normalizeFa('می‌خواهم'), normalizeFa('می خواهم'));
  assert.equal(normalizeFa('می‌خواهم'), 'می خواهم');
  assert.equal(normalizeFa('  سلام   دنیا  '), 'سلام دنیا');
});

test('normalizeFa: Arabic letter variants and digits', () => {
  assert.equal(normalizeFa('كتاب'), 'کتاب');
  assert.equal(normalizeFa('علي'), 'علی');
  assert.equal(normalizeFa('خانۀ من'), 'خانه من');
  assert.equal(normalizeFa('۱۲۳'), '123');
  assert.equal(normalizeFa('١٢٣'), '123');
  assert.equal(normalizeFa('سال ۱۴۰۳ و ٢٠٢۴'), 'سال 1403 و 2024');
});

test('normalizeFa: diacritics, tatweel, punctuation, latin case', () => {
  assert.equal(normalizeFa('مُحَمَّد'), 'محمد');
  assert.equal(normalizeFa('سلـــام'), 'سلام');
  assert.equal(normalizeFa('سلام، دنیا؟ «خوب»؛ بله…'), 'سلام دنیا خوب بله');
  assert.equal(normalizeFa('Hello, World!'), 'hello world');
  assert.equal(normalizeFa('...'), '');
  assert.equal(normalizeFa(''), '');
});

test('editDistance: strings, arrays, empties', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('', ''), 0);
  assert.equal(editDistance(['a', 'b', 'c'], ['a', 'c']), 1);
  assert.equal(editDistance('سلام', 'سلام'), 0);
  assert.equal(editDistance([1, 2, 3], [3, 2, 1]), 2);
});

test('cer: normalization-insensitive, spaces count, may exceed 1', () => {
  assert.equal(cer('می‌خواهم', 'می خواهم'), 0);
  assert.equal(cer('سلام، دنیا!', 'سلام دنیا'), 0);
  close(cer('سلام', 'سلا'), 0.25);
  assert.equal(cer('كتاب ۱', 'کتاب 1'), 0);
  close(cer('a', 'xyz'), 3);
  close(cer('ab', 'abcd'), 1);
  // a wrongly merged word costs one edit (the space)
  close(cer('به خانه', 'بهخانه'), 1 / 7);
});

test('cer/wer: empty reference', () => {
  assert.equal(cer('', ''), 0);
  assert.equal(cer('', 'سلام'), 1);
  assert.equal(cer('!!!', ''), 0); // reference is empty after normalization
  assert.equal(wer('', ''), 0);
  assert.equal(wer('', 'سلام'), 1);
});

test('wer: word-level edits', () => {
  close(wer('من به مدرسه رفتم', 'من مدرسه رفتم'), 0.25);
  close(wer('من به مدرسه رفتم', 'من به دانشگاه رفتم'), 0.25);
  assert.equal(wer('من می‌خواهم بروم', 'من می خواهم بروم'), 0); // ZWNJ vs space
  close(wer('من می‌خواهم بروم', 'من می‌خواهم بروم الان'), 1 / 4); // ZWNJ splits "می‌خواهم" into 2 words
  close(wer('سلام', 'سلام دنیا خوبی'), 2);
});

test('percentile: interpolation, edges, empty', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([7], 95), 7);
  close(percentile([1, 2, 3, 4], 50), 2.5);
  close(percentile([4, 1, 3, 2], 50), 2.5); // order-independent
  close(percentile([10, 20, 30, 40, 50], 25), 20);
  close(percentile([0, 100], 95), 95);
  assert.equal(percentile([1, 2, 3], 0), 1);
  assert.equal(percentile([1, 2, 3], 100), 3);
  assert.equal(percentile([1, 2, 3], 150), 3); // clamped
});

test('summarizeLatency', () => {
  const s = summarizeLatency([100, 200, 300, 400, 1000]);
  assert.equal(s.count, 5);
  close(s.p50, 300);
  close(s.p95, 880);
  close(s.mean, 400);
  assert.equal(s.max, 1000);
  assert.deepEqual(summarizeLatency([]), { count: 0, p50: null, p95: null, mean: null, max: null });
  assert.equal(summarizeLatency([5]).p95, 5);
});
