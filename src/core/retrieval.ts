/**
 * File chunks + retrieval (decisions v3.1 §6): ~800-token chunks, simple BM25 keyword ranking,
 * only relevant chunks inside the context budget are injected.
 */

import { estimateTokens } from './tokens';

export const CHUNK_TARGET_TOKENS = 800;

export interface Chunk {
  fileId: string;
  index: number;
  text: string;
  tokens: number;
}

/** Paragraph-aware chunking; a paragraph longer than the target is cut on sentence/space boundaries. */
export function chunkText(fileId: string, text: string, targetTokens = CHUNK_TARGET_TOKENS): Chunk[] {
  const maxChars = Math.floor(targetTokens * 2.2);
  const paras = text.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= maxChars) { pieces.push(p); continue; }
    let rest = p;
    while (rest.length > maxChars) {
      const window = rest.slice(0, maxChars);
      const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('؟ '), window.lastIndexOf('. '), window.lastIndexOf('\n'), window.lastIndexOf(' '));
      const at = cut > maxChars * 0.5 ? cut + 1 : maxChars;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
  }
  const chunks: Chunk[] = [];
  let cur = '';
  const flush = () => {
    if (!cur) return;
    chunks.push({ fileId, index: chunks.length, text: cur, tokens: estimateTokens(cur) });
    cur = '';
  };
  for (const piece of pieces) {
    if (cur && cur.length + piece.length + 2 > maxChars) flush();
    cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  flush();
  return chunks;
}

const STOP = new Set(['و', 'در', 'به', 'از', 'که', 'این', 'آن', 'را', 'با', 'برای', 'است', 'شد', 'شده', 'می', 'یک', 'هم', 'یا', 'تا', 'بر', 'the', 'and', 'of', 'to', 'in', 'a', 'is']);

/** Persian-aware normalization: Arabic ي/ك → ی/ک, all digits → latin, ZWNJ → space, diacritics out, lower-case. */
export function normalizeText(s: string): string {
  return s
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[‌‏‎]/g, ' ')
    .toLowerCase();
}

export function tokenize(s: string): string[] {
  return normalizeText(s).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2 && !STOP.has(t));
}

export interface Scored<T> { chunk: T; score: number }

/** Okapi BM25 over the given chunks. Returns only chunks with score > 0, best first. */
export function bm25Rank<T extends Pick<Chunk, 'text'>>(query: string, chunks: T[], k1 = 1.5, b = 0.75): Array<Scored<T>> {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => tokenize(c.text));
  const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const out: Array<Scored<T>> = [];
  docs.forEach((d, i) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
    }
    if (score > 0) out.push({ chunk: chunks[i], score });
  });
  return out.sort((a, c) => c.score - a.score);
}

/** Take the best chunks that fit the token budget (never a partial chunk). */
export function selectWithinBudget<T extends Pick<Chunk, 'tokens'>>(ranked: Array<Scored<T>>, budgetTokens: number, maxChunks = 6): T[] {
  const out: T[] = [];
  let used = 0;
  for (const { chunk } of ranked) {
    if (out.length >= maxChunks) break;
    if (used + chunk.tokens > budgetTokens) continue;
    out.push(chunk);
    used += chunk.tokens;
  }
  return out;
}
