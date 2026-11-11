/**
 * Editing the preview of a document import (pure, client side): merge a chunk with the next, split one in two.
 * Only the user's own choices change the chunks; the full source text is kept whole on the server whatever she does here,
 * so merging, splitting or leaving a chunk out never loses anything.
 */
export interface ImportChunk {
  id: string;
  text: string;
  /** the chunk starts with this heading (a candidate section name) */
  heading?: string;
  /** the nearest heading above: only used if the user asks for sections */
  sectionHint?: string;
  suggestions?: Array<{ slot: string; label: string; targetId?: string; score?: number }>;
}

const HEADING_LINE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const firstHeading = (text: string): string | undefined => {
  const line = text.split('\n').find((l) => l.trim());
  return line ? HEADING_LINE.exec(line)?.[1]?.trim() || undefined : undefined;
};

/** chunk `id` + the one after it → one chunk (the first one's heading and hint win); no next chunk = unchanged */
export function mergeWithNext(chunks: ImportChunk[], id: string): ImportChunk[] {
  const i = chunks.findIndex((c) => c.id === id);
  if (i < 0 || i >= chunks.length - 1) return chunks;
  const a = chunks[i];
  const b = chunks[i + 1];
  const hint = a.sectionHint ?? b.sectionHint;
  const merged: ImportChunk = { id: a.id, text: `${a.text.trim()}\n\n${b.text.trim()}`, ...(a.heading ? { heading: a.heading } : {}), ...(hint ? { sectionHint: hint } : {}) };
  return [...chunks.slice(0, i), merged, ...chunks.slice(i + 2)];
}

/** split chunk `id` at character `at` of its text; an empty half (caret at an edge) leaves it unchanged */
export function splitAt(chunks: ImportChunk[], id: string, at: number): ImportChunk[] {
  const i = chunks.findIndex((c) => c.id === id);
  if (i < 0) return chunks;
  const c = chunks[i];
  const head = c.text.slice(0, at).trim();
  const tail = c.text.slice(at).trim();
  if (!head || !tail) return chunks;
  const used = new Set(chunks.map((x) => x.id));
  let n = 1;
  while (used.has(`${c.id}.${n}`)) n++;
  const tailHeading = firstHeading(tail);
  const tailHint = tailHeading ?? c.sectionHint;
  const first: ImportChunk = { id: c.id, text: head, ...(c.heading ? { heading: c.heading } : {}), ...(c.sectionHint ? { sectionHint: c.sectionHint } : {}) };
  const second: ImportChunk = { id: `${c.id}.${n}`, text: tail, ...(tailHeading ? { heading: tailHeading } : {}), ...(tailHint ? { sectionHint: tailHint } : {}) };
  return [...chunks.slice(0, i), first, second, ...chunks.slice(i + 1)];
}
