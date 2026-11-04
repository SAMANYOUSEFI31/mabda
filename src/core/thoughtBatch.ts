/**
 * Several thoughts in one go: «paste or write → look → confirm». One item = one line, or one line plus the indented lines under it
 * (src/core/batchLines.ts). The kind of each item is decided by rules, never guessed by an AI: an explicit marker ([ایده] [سؤال]
 * [فرض] [تصمیم باز]) on its first line wins; an item whose LAST line ends with «؟» is a question; every other item gets the batch's
 * default kind (the user picks it above the preview). «فرض» and «تصمیم باز» are never guessed from words. A thought of several
 * lines is saved with a trailing `\` on every line but the last (src/core/thinkingMarkers.ts). Pure.
 */

import { groupLines } from './batchLines';
import { MARKER_OF, isQuestionLine, parseThinking } from './thinkingMarkers';
import type { ThinkingKind } from './thinkingMarkers';

export interface BatchLine {
  /** stable within one parse: the 0-based source line of the item's first line */
  id: number;
  /** the whole thought; several lines are joined with a line break */
  text: string;
  /** the source lines of the continuation lines (to «جدا کن» one of them) */
  rest: number[];
  /** what rules decided (marker → that kind; ؟ → question; otherwise the default) */
  kind: ThinkingKind;
  how: 'marker' | 'question' | 'default';
}

/** the non-empty, non-heading items of a pasted text, each with its rule-decided kind */
export function parseThoughtBatch(text: string, defaultKind: ThinkingKind = 'idea'): BatchLine[] {
  const out: BatchLine[] = [];
  for (const g of groupLines(text)) {
    const marked = parseThinking(g.first)[0];
    const firstText = marked && !marked.inferred ? marked.text : g.first;
    const lines = [firstText, ...g.rest.map((r) => r.text)].filter(Boolean);
    if (!lines.length) continue;
    const rest = g.rest.map((r) => r.index);
    if (marked && !marked.inferred) { out.push({ id: g.id, text: lines.join('\n'), rest, kind: marked.kind, how: 'marker' }); continue; }
    if (isQuestionLine(lines[lines.length - 1])) { out.push({ id: g.id, text: lines.join('\n'), rest, kind: 'question', how: 'question' }); continue; }
    out.push({ id: g.id, text: lines.join('\n'), rest, kind: defaultKind, how: 'default' });
  }
  return out;
}

/** one thought (or none): the old single-thought behaviour; two or more: show the preview */
export const isBatch = (text: string) => parseThoughtBatch(text).length > 1;

export interface BatchPick { text: string; kind: ThinkingKind; nodeId: string }
export interface NotePayload { nodeId: string; content: string }

/** the note lines of ONE thought: the marker on the first, a trailing `\` on every line but the last */
export function thoughtLines(text: string, kind: ThinkingKind): string {
  const parts = text.split('\n').map((l) => l.replace(/\s+/g, ' ').replace(/\\\s*$/, '').trim()).filter(Boolean);
  if (!parts.length) return '';
  return parts.map((l, i) => `${i === 0 ? `${MARKER_OF[kind]} ` : ''}${l}${i < parts.length - 1 ? '\\' : ''}`).join('\n');
}

/** one note per section, one marked thought per item — every per-line feature (convertedTo, lineHash, markLine) keeps working */
export function composeThoughtBatch(picks: BatchPick[]): NotePayload[] {
  const byNode = new Map<string, string[]>();
  for (const p of picks) {
    const block = thoughtLines(p.text, p.kind);
    if (!block) continue;
    byNode.set(p.nodeId, [...(byNode.get(p.nodeId) ?? []), block]);
  }
  return [...byNode].map(([nodeId, lines]) => ({ nodeId, content: lines.join('\n') }));
}
