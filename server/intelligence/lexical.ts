import { bm25Rank } from '../../src/core/retrieval.ts';
import type { Ranked } from './math.ts';

/**
 * متخصص «قاعده»: جست‌وجوی واژه‌ای قطعی (BM25 از `src/core/retrieval.ts`؛ نرمال‌سازی فارسی همان‌جاست).
 * بدون مدل، بدون شبکه، بدون هزینه. خواندن `src/core` مجاز است؛ جهت وابستگی برعکس نیست.
 */
export interface SearchItem { id: string; text: string }

export function lexicalRank(query: string, items: SearchItem[]): Ranked[] {
  return bm25Rank(query, items).map((r) => ({ id: r.chunk.id, score: r.score }));
}
