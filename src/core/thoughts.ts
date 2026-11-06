/**
 * User-facing helpers for writing and explicitly promoting Thoughts. Note markers remain the lightweight input syntax;
 * persistence, identity and promotion are handled by the Thought repository.
 */

import type { ContextDraft, ContextType, ObjectSource } from '../types';
import { guessTitle } from './knowledgeGuess';
import { MARKER_OF, THINKING_FA, isQuestionLine, parseThinking } from './thinkingMarkers';
import type { NoteThinkingItem, ThinkingKind } from './thinkingMarkers';

export const THOUGHT_KINDS: ThinkingKind[] = ['idea', 'question', 'assumption', 'open_decision'];
export { THINKING_FA };

export function promotionTypesForThought(kind: ThinkingKind): ContextType[] {
  if (kind === 'assumption') return ['Fact'];
  if (kind === 'open_decision') return ['Decision'];
  return ['Fact', 'Decision', 'Constraint'];
}

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
 * The target meaning is chosen explicitly; assumptions and open decisions keep their domain meaning.
 * Always PROPOSED, with the stable Thought identity and its original Material reference.
 */
export function thoughtToDraft(item: NoteThinkingItem, workspaceId: string, now: string, type: ContextType): ContextDraft {
  if (!item.id) throw new Error('Thought identity is required before promotion.');
  if (!promotionTypesForThought(item.kind).includes(type)) throw new Error('The selected Knowledge type does not match this Thought.');
  const assumption = item.kind === 'assumption';
  const source: ObjectSource = {
    kind: item.noteId ? 'note' : 'user', thoughtId: item.id, ...(item.noteId ? { noteId: item.noteId } : {}),
    ...(item.sourceLineKey ? { lineKey: item.sourceLineKey } : { lineKey: item.hash }),
    quote: item.text, at: now,
  };
  return {
    workspaceId, type, status: 'Proposed', provenance: 'User Input',
    title: guessTitle(item.text), content: item.text, nodeId: item.nodeId, source,
    ...(assumption ? { assumption: true } : {}),
  };
}

/**
 * Legacy text rewrite retained for old line-derived records; current section promotion leaves the source Note unchanged.
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
