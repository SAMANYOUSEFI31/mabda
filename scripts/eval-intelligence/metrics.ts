/**
 * Pure metric functions for the Persian intelligence evaluation script
 * (retrieval, classification/judgment, speech-to-text, latency).
 * No I/O, no randomness, no dependencies. Every function is deterministic.
 */

// ───────────────────────── Retrieval ─────────────────────────

/** Graded relevance: item id -> grade (1 = weak, 2 = strong). */
export type Relevant = Map<string, 1 | 2>;

function topK(ranked: string[], k: number): string[] {
  const n = Math.max(0, Math.min(Math.floor(k), ranked.length));
  return ranked.slice(0, n);
}

/**
 * Precision@k: relevant hits in the top-k divided by min(k, ranked.length).
 * Returns 0 when the ranked list is empty (or k <= 0).
 */
export function precisionAtK(ranked: string[], relevant: Relevant, k: number): number {
  const top = topK(ranked, k);
  if (top.length === 0) return 0;
  return top.filter(id => relevant.has(id)).length / top.length;
}

/**
 * Recall@k: relevant items found in the top-k divided by relevant.size.
 * Returns null when relevant.size === 0 (such queries are excluded from means via meanDefined).
 */
export function recallAtK(ranked: string[], relevant: Relevant, k: number): number | null {
  if (relevant.size === 0) return null;
  const top = topK(ranked, k);
  return top.filter(id => relevant.has(id)).length / relevant.size;
}

/**
 * Wrong-link rates over the top-min(k, len) results:
 *  - wrong: fraction NOT in `relevant`;
 *  - hardNegative: fraction that are in `hardNegatives`.
 * Both are 0 when the list is empty.
 */
export function wrongLinkRateAtK(
  ranked: string[],
  relevant: Relevant,
  hardNegatives: Set<string>,
  k: number,
): { wrong: number; hardNegative: number } {
  const top = topK(ranked, k);
  if (top.length === 0) return { wrong: 0, hardNegative: 0 };
  return {
    wrong: top.filter(id => !relevant.has(id)).length / top.length,
    hardNegative: top.filter(id => hardNegatives.has(id)).length / top.length,
  };
}

/** Mean of the non-null values; null when there are none. */
export function meanDefined(values: Array<number | null>): number | null {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    sum += v;
    n++;
  }
  return n === 0 ? null : sum / n;
}

/**
 * nDCG@k with gain = grade (1 or 2) and discount 1/log2(rank+1) (rank starting at 1).
 * The ideal ranking sorts all relevant grades descending and is cut at k.
 * Returns null when relevant.size === 0 (undefined ideal), 0 for an empty ranking.
 */
export function ndcgAtK(ranked: string[], relevant: Relevant, k: number): number | null {
  if (relevant.size === 0) return null;
  const top = topK(ranked, k);
  let dcg = 0;
  top.forEach((id, i) => {
    const g = relevant.get(id) ?? 0;
    dcg += g / Math.log2(i + 2);
  });
  const ideal = [...relevant.values()].sort((a, b) => b - a).slice(0, Math.max(0, Math.floor(k)));
  let idcg = 0;
  ideal.forEach((g, i) => { idcg += g / Math.log2(i + 2); });
  return idcg === 0 ? 0 : dcg / idcg;
}

export interface SweepPoint { threshold: number; precision: number; recall: number; kept: number }

/**
 * Threshold sweep: for every distinct score t (ascending) keep items with score >= t and report
 * precision = relevantKept / kept, recall = relevantKept / totalRelevant, kept = count.
 * `totalRelevant` defaults to the number of relevant items inside `scored`; pass a larger number
 * when some relevant items were never retrieved at all. recall is 0 when totalRelevant is 0.
 */
export function thresholdSweep(
  scored: Array<{ score: number; relevant: boolean }>,
  totalRelevant?: number,
): SweepPoint[] {
  const total = totalRelevant ?? scored.filter(s => s.relevant).length;
  const thresholds = [...new Set(scored.map(s => s.score))].sort((a, b) => a - b);
  return thresholds.map(threshold => {
    let kept = 0;
    let tp = 0;
    for (const s of scored) {
      if (s.score >= threshold) { kept++; if (s.relevant) tp++; }
    }
    return { threshold, precision: kept === 0 ? 0 : tp / kept, recall: total === 0 ? 0 : tp / total, kept };
  });
}

/**
 * Lowest threshold in the sweep whose precision >= minPrecision and kept >= 1
 * (lowest threshold = highest recall at that precision). null if none qualifies.
 * Works on any order of input; the sweep is not required to be sorted.
 */
export function suggestThreshold(sweep: SweepPoint[], minPrecision: number): number | null {
  let best: number | null = null;
  for (const p of sweep) {
    if (p.kept >= 1 && p.precision >= minPrecision && (best === null || p.threshold < best)) best = p.threshold;
  }
  return best;
}

// ───────────────────────── Classification ─────────────────────────

export interface LabelStats { precision: number | null; recall: number | null; f1: number | null; support: number }
export interface Confusion {
  labels: string[];
  matrix: Record<string, Record<string, number>>;
  accuracy: number;
  perLabel: Record<string, LabelStats>;
  unanswered: number;
}

/**
 * Confusion matrix. matrix[expected][predicted]; a null prediction is counted in column '∅'
 * (and in `unanswered`) and is wrong for accuracy. `labels` = sorted union of expected labels and
 * non-null predictions. precision = TP / predicted-as-label (null if never predicted),
 * recall = TP / support (null if support 0), f1 null if either is null or both are 0.
 * accuracy = correct / total (0 for empty input).
 */
export function confusion(pairs: Array<{ expected: string; predicted: string | null }>): Confusion {
  const set = new Set<string>();
  for (const p of pairs) { set.add(p.expected); if (p.predicted !== null) set.add(p.predicted); }
  const labels = [...set].sort();
  const cols = [...labels, '∅'];
  const matrix: Record<string, Record<string, number>> = {};
  for (const l of labels) { matrix[l] = {}; for (const c of cols) matrix[l][c] = 0; }
  let correct = 0;
  let unanswered = 0;
  for (const p of pairs) {
    const col = p.predicted === null ? '∅' : p.predicted;
    matrix[p.expected][col]++;
    if (p.predicted === null) unanswered++;
    else if (p.predicted === p.expected) correct++;
  }
  const perLabel: Record<string, LabelStats> = {};
  for (const l of labels) {
    const tp = matrix[l][l];
    const support = cols.reduce((s, c) => s + matrix[l][c], 0);
    const predictedAs = labels.reduce((s, r) => s + matrix[r][l], 0);
    const precision = predictedAs === 0 ? null : tp / predictedAs;
    const recall = support === 0 ? null : tp / support;
    const f1 = precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
    perLabel[l] = { precision, recall, f1, support };
  }
  return { labels, matrix, accuracy: pairs.length === 0 ? 0 : correct / pairs.length, perLabel, unanswered };
}

export interface CalibrationBin { from: number; to: number; count: number; accuracy: number | null; meanConfidence: number | null }
export interface Calibration { bins: CalibrationBin[]; withoutConfidence: number; ece: number | null }

/**
 * Calibration. Bin i covers [bins[i], bins[i+1]); confidences below the first edge go to the first
 * bin and at/above the last edge to the last bin. Items with undefined/NaN confidence are only
 * counted in `withoutConfidence`. ece = sum over bins of (count/N) * |accuracy - meanConfidence|
 * where N counts items that have a confidence; null if N = 0.
 */
export function calibration(
  items: Array<{ confidence: number | undefined; correct: boolean }>,
  bins: number[] = [0, 0.5, 0.7, 0.9, 1.0001],
): Calibration {
  const nBins = Math.max(0, bins.length - 1);
  const acc = Array.from({ length: nBins }, () => ({ count: 0, correct: 0, conf: 0 }));
  let withoutConfidence = 0;
  let n = 0;
  for (const it of items) {
    const c = it.confidence;
    if (c === undefined || Number.isNaN(c)) { withoutConfidence++; continue; }
    if (nBins === 0) continue;
    let idx = nBins - 1;
    for (let i = 0; i < nBins; i++) {
      if (c < bins[i + 1]) { idx = i; break; }
    }
    acc[idx].count++;
    acc[idx].conf += c;
    if (it.correct) acc[idx].correct++;
    n++;
  }
  let ece = 0;
  const out: CalibrationBin[] = acc.map((a, i) => {
    if (a.count > 0) ece += (a.count / n) * Math.abs(a.correct / a.count - a.conf / a.count);
    return {
      from: bins[i],
      to: bins[i + 1],
      count: a.count,
      accuracy: a.count === 0 ? null : a.correct / a.count,
      meanConfidence: a.count === 0 ? null : a.conf / a.count,
    };
  });
  return { bins: out, withoutConfidence, ece: n === 0 ? null : ece };
}

/**
 * Selective accuracy (abstention-aware).
 *  - coverage = answered / total (null if total 0);
 *  - accuracyWhenAnswered = correct answered / answered (null if none answered);
 *  - accuracyOverall = correct answered / total (unanswered count as wrong; null if total 0).
 * `correct` is ignored for unanswered items.
 */
export function selectiveAccuracy(items: Array<{ answered: boolean; correct: boolean }>): {
  coverage: number | null; accuracyWhenAnswered: number | null; accuracyOverall: number | null;
} {
  const total = items.length;
  const answered = items.filter(i => i.answered);
  const right = answered.filter(i => i.correct).length;
  return {
    coverage: total === 0 ? null : answered.length / total,
    accuracyWhenAnswered: answered.length === 0 ? null : right / answered.length,
    accuracyOverall: total === 0 ? null : right / total,
  };
}

// ───────────────────────── Threshold classification ─────────────────────────

function prf(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function counts(items: Array<{ score: number; positive: boolean }>, t: number): { tp: number; fp: number; fn: number } {
  let tp = 0, fp = 0, fn = 0;
  for (const it of items) {
    const pred = it.score >= t;
    if (pred && it.positive) tp++;
    else if (pred) fp++;
    else if (it.positive) fn++;
  }
  return { tp, fp, fn };
}

/** F1-maximising threshold (predict positive when score >= t); ties go to the HIGHER threshold.
 *  Empty input returns Infinity (predicts nothing). */
function bestF1Threshold(items: Array<{ score: number; positive: boolean }>): number {
  const ts = [...new Set(items.map(i => i.score))].sort((a, b) => a - b);
  let best = Infinity;
  let bestF1 = -1;
  for (const t of ts) {
    const { tp, fp, fn } = counts(items, t);
    const f = prf(tp, fp, fn).f1;
    if (f >= bestF1) { bestF1 = f; best = t; } // ascending + ">=": later (higher) thresholds win ties
  }
  return best;
}

/**
 * Honest two-fold evaluation of a score threshold. Items are split deterministically (even index
 * = fold A, odd index = fold B). On each fold the F1-maximising threshold for the positive class is
 * picked (ties -> higher threshold) and evaluated on the OTHER fold; TP/FP/FN of both evaluations are
 * pooled to give `precision`, `recall`, `f1` (these are the trustworthy numbers).
 * `thresholds` = [picked on A (applied to B), picked on B (applied to A)]; a fold with no items gives Infinity.
 * `bestThresholdAll` is the F1-maximising threshold on ALL data: it is OPTIMISTIC (tuned and scored on
 * the same data) and should only be used as the suggested production value, never as a quality estimate.
 */
export function twoFoldThreshold(items: Array<{ score: number; positive: boolean }>): {
  f1: number; precision: number; recall: number; thresholds: [number, number]; bestThresholdAll: number;
} {
  const a = items.filter((_, i) => i % 2 === 0);
  const b = items.filter((_, i) => i % 2 === 1);
  const tA = bestF1Threshold(a);
  const tB = bestF1Threshold(b);
  const onB = counts(b, tA);
  const onA = counts(a, tB);
  const m = prf(onA.tp + onB.tp, onA.fp + onB.fp, onA.fn + onB.fn);
  return { ...m, thresholds: [tA, tB], bestThresholdAll: bestF1Threshold(items) };
}

// ───────────────────────── Speech to text ─────────────────────────

const PUNCT_RE = /[\p{P}\p{S}]/gu;

/**
 * Normalize Persian text for comparison:
 *  Arabic ي/ى -> ی, ك -> ک, ة/ۀ -> ه; Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9;
 *  remove diacritics (U+064B-U+065F, U+0670) and tatweel (U+0640); ZWNJ/ZWJ -> space
 *  (so «می‌خواهم» equals «می خواهم»); punctuation/symbols (Latin and Persian: ، ؛ ؟ « » … etc.) -> space;
 *  lowercase Latin; collapse whitespace and trim.
 */
export function normalizeFa(text: string): string {
  let s = text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[‌‍]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
  s = s.replace(PUNCT_RE, ' ').toLowerCase();
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Levenshtein edit distance (insert/delete/substitute, cost 1) between two sequences
 * (strings or arrays). O(n*m) time, O(min-row) memory via two rolling rows.
 */
export function editDistance<T>(a: ArrayLike<T>, b: ArrayLike<T>): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      cur[j] = Math.min(sub, prev[j] + 1, cur[j - 1] + 1);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}

/**
 * Character error rate on normalized text (normalizeFa). Characters INCLUDE the single spaces
 * between words (so a wrongly split/merged word costs an edit). = edits / reference length;
 * empty reference -> 0 if hypothesis is also empty, else 1. May exceed 1.
 */
export function cer(ref: string, hyp: string): number {
  const r = normalizeFa(ref);
  const h = normalizeFa(hyp);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return editDistance(r, h) / r.length;
}

/**
 * Word error rate on normalized text (normalizeFa), words split on single spaces.
 * = word edits / reference word count; empty reference -> 0 if hypothesis empty, else 1. May exceed 1.
 */
export function wer(ref: string, hyp: string): number {
  const r = normalizeFa(ref).split(' ').filter(Boolean);
  const h = normalizeFa(hyp).split(' ').filter(Boolean);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return editDistance(r, h) / r.length;
}

// ───────────────────────── Latency ─────────────────────────

/** Percentile with linear interpolation between closest ranks (p in 0..100, clamped); null on empty input. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const q = Math.min(100, Math.max(0, p)) / 100;
  const rank = q * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
}

/** Latency summary in the input unit (ms). All fields except `count` are null for empty input. */
export function summarizeLatency(ms: number[]): {
  count: number; p50: number | null; p95: number | null; mean: number | null; max: number | null;
} {
  if (ms.length === 0) return { count: 0, p50: null, p95: null, mean: null, max: null };
  return {
    count: ms.length,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    mean: ms.reduce((a, b) => a + b, 0) / ms.length,
    max: Math.max(...ms),
  };
}
