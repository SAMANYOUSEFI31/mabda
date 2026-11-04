/**
 * The one rule behind «چند فکر» and «چند دانش با هم»: a pasted or typed text is a list where each non-empty line is ONE item,
 * unless the line is INDENTED (two or more spaces, or a tab) — then it continues the item above it. Enter makes the next item,
 * Shift+Enter (or the «خط تازه» button, which a phone needs) makes an indented line in the same item, «به قبلی بچسبان» indents a
 * pasted line, «جدا کن» removes the indent. Pure.
 */

export interface LineGroup {
  /** 0-based source line of the first line of the item (a stable id while the text is not edited) */
  id: number;
  /** the first line, without a bullet or number */
  first: string;
  /** the continuation lines (trimmed) and where they are in the source */
  rest: Array<{ index: number; text: string }>;
}

const BULLET = /^[\s‌‏‎]*(?:[-*•–—]|[\d۰-۹٠-٩]+[.)])\s+/;
/** a line that continues the one above it */
export const isContinuation = (raw: string): boolean => /^(?: {2,}|\t)\S/.test(raw);
/** a markdown heading or a blank line is never an item */
const skip = (raw: string) => !raw.trim() || raw.trim().startsWith('#');

export function groupLines(text: string): LineGroup[] {
  const out: LineGroup[] = [];
  text.replace(/\r/g, '').split('\n').forEach((raw, index) => {
    if (skip(raw)) return;
    const body = raw.trim();
    if (isContinuation(raw) && out.length) { out[out.length - 1].rest.push({ index, text: body }); return; }
    out.push({ id: index, first: body.replace(BULLET, '').trim(), rest: [] });
  });
  return out.filter((g) => g.first);
}

/** Shift+Enter: a new line INSIDE the same item (the next line starts with two spaces) */
export function insertSoftBreak(value: string, start: number, end = start): { value: string; caret: number } {
  const ins = '\n  ';
  return { value: value.slice(0, start) + ins + value.slice(end), caret: start + ins.length };
}

/** «به قبلی بچسبان»: indent source line `index` so it continues the item above */
export function joinToPrevious(text: string, index: number): string {
  const lines = text.replace(/\r/g, '').split('\n');
  if (index <= 0 || index >= lines.length || !lines[index].trim() || isContinuation(lines[index])) return text;
  lines[index] = `  ${lines[index].trim()}`;
  return lines.join('\n');
}

/** «جدا کن»: remove the indent of source line `index` so it is an item of its own again */
export function splitFromPrevious(text: string, index: number): string {
  const lines = text.replace(/\r/g, '').split('\n');
  if (index < 0 || index >= lines.length || !isContinuation(lines[index])) return text;
  lines[index] = lines[index].trim();
  return lines.join('\n');
}
