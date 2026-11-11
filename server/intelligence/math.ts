import { createHash } from 'node:crypto';

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Ranked { id: string; score: number }

/** ترکیب رتبه‌ای وزن‌دار (Reciprocal Rank Fusion): امتیاز هر فهرست قابل‌مقایسه با دیگری نیست، رتبه‌ها هستند. */
export function rrf(lists: Array<{ ranked: Ranked[]; weight: number }>, k: number): Ranked[] {
  const acc = new Map<string, number>();
  for (const { ranked, weight } of lists) ranked.forEach((r, i) => acc.set(r.id, (acc.get(r.id) ?? 0) + weight / (k + i + 1)));
  return [...acc].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

/** نرمال‌سازی نرم متن برای هش: یکسان‌سازی ي/ك، فاصله‌های اضافه، پایان خط. فقط برای کلید ذخیره، نه برای فرستادن به مدل. */
export const normalizeForHash = (s: string): string => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();

export const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex');

export const toFloat32 = (v: number[]): Float32Array => Float32Array.from(v);
