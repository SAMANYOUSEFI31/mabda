/**
 * Writing a thought down without knowing any syntax. A thought is a LINE of a note with a marker (`[ایده]` …): the marker is
 * written FOR the user from a chip; the brackets stay a professional shortcut. The kind is decided by rules, never guessed by an
 * AI: a text that ends with «؟» / «?» is a question. Converting a thought to knowledge only PREFILLS the knowledge form — the
 * user looks, edits and saves; the line stays where it was and the new knowledge remembers it (`source`). Pure.
 */

import type { ContextDraft, ObjectSource } from '../types';
import { guessTitle } from './knowledgeGuess';
import { MARKER_OF, THINKING_FA, isQuestionLine, parseThinking } from './thinkingMarkers';
import type { NoteThinkingItem, ThinkingKind } from './thinkingMarkers';

export const THOUGHT_KINDS: ThinkingKind[] = ['idea', 'question', 'assumption', 'open_decision'];
export { THINKING_FA };

/** idea by default; a text that ends with a question mark is a question (the user can change the chip) */
export const guessThoughtKind = (text: string): ThinkingKind => (isQuestionLine(text.trim().split('\n').pop() ?? '') ? 'question' : 'idea');

/** the note text to save: the marker of the chosen kind on the first line, the rest of the lines as typed */
export function composeThought(text: string, kind: ThinkingKind): string {
  const lines = text.replace(/\r/g, '').split('\n').map((l, i) => (i === 0 ? l : l.trim()));
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return '';
  const body = lines.slice(first).filter((l, i) => i === 0 || l.trim()).map((l, i) => (i === 0 ? `${MARKER_OF[kind]} ${l.replace(/^\s*\[[^\]]*\]\s*/, '').trim()}` : l.trim()));
  // one thought over several lines: every line but the last ends with a hard break, so the note keeps them together
  return body.map((l, i) => (i < body.length - 1 ? `${l.replace(/\\\s*$/, '')}\\` : l)).join('\n');
}

/**
 * The knowledge form, prefilled from a thought: question and open decision and idea → a Decision (a question to decide),
 * assumption → a Fact flagged as an assumption. Always PROPOSED (it waits in the thinking space for a yes), with the line as its quote.
 */
export function thoughtToDraft(item: NoteThinkingItem, workspaceId: string, now: string): ContextDraft {
  const assumption = item.kind === 'assumption';
  const source: ObjectSource = { kind: 'note', noteId: item.noteId, lineKey: item.hash, quote: item.text, at: now };
  return {
    workspaceId, type: assumption ? 'Fact' : 'Decision', status: 'Proposed', provenance: 'User Input',
    title: guessTitle(item.text), content: item.text, nodeId: item.nodeId, source,
    ...(assumption ? { assumption: true } : {}),
  };
}

/**
 * A thought that became a SECTION (a tree node) is done: its line stays in the note as a plain record — no marker and not a
 * question any more — so the open-thought lists stop counting it. Only that line changes; every other line is as she typed it.
 */
export function resolveThoughtLine(content: string, item: Pick<NoteThinkingItem, 'line' | 'text'> & { endLine?: number }, sectionLabel: string): string {
  const lines = content.split(/\r?\n/);
  if (item.line < 0 || item.line >= lines.length) return content;
  // a thought of several lines becomes ONE plain record line (its lines are joined with a space)
  const end = parseThinking(content).find((i) => i.line === item.line)?.endLine ?? item.endLine ?? item.line;
  lines.splice(item.line, end - item.line + 1, `${item.text.replace(/\s*\n\s*/g, ' ')} ✓ (بخش «${sectionLabel.replace(/[»\n]+/g, ' ').trim()}» از همین ساخته شد)`);
  return lines.join('\n');
}

/** a name for the section made from a thought: the first sentence, short */
export function sectionNameFromThought(text: string): string {
  const first = text.replace(/\s+/g, ' ').trim().split(/[.!؟?،:؛]/)[0].trim();
  const words = first.split(' ').slice(0, 6).join(' ');
  return words.slice(0, 48);
}
