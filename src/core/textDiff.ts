/**
 * Word-level text comparison for the «قبل / بعد» views. Pure, no dependencies.
 * Tokens are words (letters/digits/marks, including the Persian half-space U+200C inside a word), runs of whitespace
 * and single punctuation marks — so Persian text and mixed RTL/LTR text diff by meaning units, not by bytes.
 */

export type DiffKind = 'same' | 'del' | 'add';
export interface DiffSegment { kind: DiffKind; text: string }

const TOKEN = /\s+|[\p{L}\p{N}\p{M}‌‍_]+|[^\s\p{L}\p{N}\p{M}]/gu;
export const tokenize = (s: string): string[] => s.match(TOKEN) ?? [];

/** Above this many cells the middle part is compared as one replaced block (keeps the UI responsive on huge texts). */
const MAX_CELLS = 4_000_000;

function push(out: DiffSegment[], kind: DiffKind, text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text; else out.push({ kind, text });
}

export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }

  const out: DiffSegment[] = [];
  push(out, 'same', a.slice(0, s).join(''));
  const A = a.slice(s, ea), B = b.slice(s, eb);
  if (A.length * B.length > MAX_CELLS || !A.length || !B.length) {
    push(out, 'del', A.join(''));
    push(out, 'add', B.join(''));
  } else {
    // classic LCS table over the differing middle
    const w = B.length + 1;
    const t = new Uint32Array((A.length + 1) * w);
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) {
      t[i * w + j] = A[i] === B[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { push(out, 'same', A[i]); i++; j++; }
      else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) { push(out, 'del', A[i]); i++; }
      else { push(out, 'add', B[j]); j++; }
    }
    while (i < A.length) push(out, 'del', A[i++]);
    while (j < B.length) push(out, 'add', B[j++]);
  }
  push(out, 'same', a.slice(ea).join(''));
  return out;
}

/** the two sides of a comparison: «قبل» = same + removed, «بعد» = same + added */
export function sidesOf(segments: DiffSegment[]): { before: DiffSegment[]; after: DiffSegment[] } {
  return { before: segments.filter((s) => s.kind !== 'add'), after: segments.filter((s) => s.kind !== 'del') };
}

/** true when nothing differs */
export const isSame = (segments: DiffSegment[]) => segments.every((s) => s.kind === 'same');

/** cheap similarity of two titles (0..1, Jaccard over words) — used to pick «related» items, never shown to the user */
export function titleSimilarity(a: string, b: string): number {
  const w = (s: string) => new Set(tokenize(s.toLowerCase()).filter((t) => /[\p{L}\p{N}]/u.test(t)));
  const x = w(a), y = w(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const t of x) if (y.has(t)) n++;
  return n / (x.size + y.size - n);
}

/** how many WORDS were removed and added (whitespace and single punctuation are not counted) */
export function diffStats(segments: DiffSegment[]): { removed: number; added: number } {
  const words = (t: string) => (t.match(/[\p{L}\p{N}\p{M}‌‍_]+/gu) ?? []).length;
  let removed = 0, added = 0;
  for (const s of segments) { if (s.kind === 'del') removed += words(s.text); else if (s.kind === 'add') added += words(s.text); }
  return { removed, added };
}

/** «۲ کلمه حذف، ۳ کلمه اضافه» — the one line above a before/after (`fa` formats numbers) */
export function diffSummary(segments: DiffSegment[], fa: (n: number) => string = String): string {
  const { removed, added } = diffStats(segments);
  if (!removed && !added) return segments.some((s) => s.kind !== 'same') ? 'فقط نشانه‌گذاری یا فاصله عوض شد' : 'متن تغییری نکرده';
  const parts: string[] = [];
  if (removed) parts.push(`${fa(removed)} کلمه حذف`);
  if (added) parts.push(`${fa(added)} کلمه اضافه`);
  return parts.join('، ');
}
