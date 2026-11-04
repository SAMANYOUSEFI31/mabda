/**
 * Several thoughts in one go: «paste or write → look → confirm». One line = one thought. The kind of each line is decided by
 * rules, never guessed by an AI: an explicit marker ([ایده] [سؤال] [فرض] [تصمیم باز]) wins; a line that ends with «؟» is a
 * question; every other line gets the batch's default kind (the user picks it above the preview). «فرض» and «تصمیم باز» are
 * never guessed from words. Pure.
 */

import { MARKER_OF, parseThinking } from './thinkingMarkers';
import type { ThinkingKind } from './thinkingMarkers';

export interface BatchLine {
  /** stable within one parse: the 0-based index of the (non-empty) source line */
  id: number;
  text: string;
  /** what rules decided (marker → that kind; ؟ → question; otherwise the default) */
  kind: ThinkingKind;
  how: 'marker' | 'question' | 'default';
}

const BULLET = /^[\s‌‏‎]*(?:[-*•–—]|[\d۰-۹٠-٩]+[.)])\s+/;

/** the non-empty, non-heading lines of a pasted text, each with its rule-decided kind */
export function parseThoughtBatch(text: string, defaultKind: ThinkingKind = 'idea'): BatchLine[] {
  const out: BatchLine[] = [];
  text.replace(/\r/g, '').split('\n').forEach((raw, id) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const found = parseThinking(line)[0];
    if (found) { out.push({ id, text: found.text, kind: found.kind, how: found.inferred ? 'question' : 'marker' }); return; }
    out.push({ id, text: line.replace(BULLET, '').trim(), kind: defaultKind, how: 'default' });
  });
  return out.filter((l) => l.text);
}

/** one line (or none): the old single-thought behaviour; two or more: show the preview */
export const isBatch = (text: string) => parseThoughtBatch(text).length > 1;

export interface BatchPick { text: string; kind: ThinkingKind; nodeId: string }
export interface NotePayload { nodeId: string; content: string }

/** one note per section, one marked line per thought — every per-line feature (convertedTo, lineHash, markLine) keeps working */
export function composeThoughtBatch(picks: BatchPick[]): NotePayload[] {
  const byNode = new Map<string, string[]>();
  for (const p of picks) {
    const t = p.text.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    byNode.set(p.nodeId, [...(byNode.get(p.nodeId) ?? []), `${MARKER_OF[p.kind]} ${t}`]);
  }
  return [...byNode].map(([nodeId, lines]) => ({ nodeId, content: lines.join('\n') }));
}
