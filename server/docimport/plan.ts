/**
 * Document → draft chunks (the preview), and chunk → its place in the source.
 *
 * Only measurable things decide: headings (`#`), bullets, blank lines and length. They are CANDIDATE boundaries and
 * hints, never certain: a text with no headings and no order imports as well (it is cut by length, at blank lines and sentence ends).
 * The cutting itself is server/intelligence/chunker.ts (not rebuilt here): a heading starts a new section; a section that
 * fits the budget stays one chunk; a longer one is cut by blank line → bullet → sentence → character window.
 * A text that is short but about several topics stays ONE chunk on purpose (there is no reliable measure of «the topic changed»);
 * the preview lets the user split it.
 */
import { charMeter, chunkByStructure, splitByHeadings } from '../intelligence/chunker.ts';

/** one note's worth; conservative 3 characters per token for Persian/English mixed text → about 750 characters */
export const IMPORT_BUDGET_TOKENS = 250;
const METER = charMeter(3);
/** more than this and the user is asked to split the document (a preview of hundreds of cards is not a preview) */
export const MAX_IMPORT_CHUNKS = 400;

export interface DraftChunk {
  id: string;
  text: string;
  /** the chunk STARTS with this heading (a candidate section name) */
  heading?: string;
  /** the nearest heading above (or at) the chunk: where it would sit if the user asks for sections. Never applied by itself. */
  sectionHint?: string;
}

const HEADING_LINE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
export const headingText = (line: string): string | undefined => HEADING_LINE.exec(line)?.[1]?.trim() || undefined;

/** the last heading in the leading run of heading/blank lines, and whether any body text follows */
function leadingHeading(section: string): { heading?: string; hasBody: boolean } {
  let heading: string | undefined;
  for (const line of section.split('\n')) {
    if (!line.trim()) continue;
    const h = headingText(line);
    if (h) { heading = h; continue; }
    return { heading, hasBody: true };
  }
  return { heading, hasBody: false };
}

export function planChunks(normalized: string): DraftChunk[] {
  const text = normalized.trim();
  if (!text) return [];
  // a heading with nothing under it (a title right above a subtitle) belongs with what follows
  const sections: string[] = [];
  const raw = splitByHeadings(text);
  let carry = '';
  raw.forEach((sec, i) => {
    const joined = carry ? `${carry}\n\n${sec}` : sec;
    if (!leadingHeading(sec).hasBody && i < raw.length - 1) { carry = joined; return; }
    sections.push(joined);
    carry = '';
  });

  const out: DraftChunk[] = [];
  for (const sec of sections) {
    const { heading } = leadingHeading(sec);
    chunkByStructure(sec, IMPORT_BUDGET_TOKENS, METER).forEach((c, i) => {
      out.push({ id: `c${out.length + 1}`, text: c.text, ...(i === 0 && heading ? { heading } : {}), ...(heading ? { sectionHint: heading } : {}) });
    });
  }
  return out;
}

/**
 * Where `chunk` sits in `source` (character range), searching from `from` so a repeated passage maps to its own turn.
 * An unchanged chunk is found whole; a merged chunk (parts joined by a blank line) by its head and tail. null = not found (never guessed).
 */
export function locateInSource(source: string, chunk: string, from = 0): { start: number; end: number } | null {
  const t = chunk.trim();
  if (!t) return null;
  const whole = source.indexOf(t, from);
  if (whole >= 0) return { start: whole, end: whole + t.length };
  // a merged chunk is its parts joined by a blank line: find its first line, then the last line that ends a span about as long as the chunk
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines[0].slice(0, 80);
  const tail = lines[lines.length - 1].slice(-80);
  for (const f of [from, 0]) {
    const st = source.indexOf(head, f);
    if (st < 0) continue;
    let first = -1;
    for (let e = source.indexOf(tail, st); e >= 0; e = source.indexOf(tail, e + 1)) {
      if (first < 0) first = e;
      if (e + tail.length - st >= t.length * 0.8) return { start: st, end: e + tail.length };
    }
    if (first >= 0) return { start: st, end: first + tail.length };
  }
  return null;
}
