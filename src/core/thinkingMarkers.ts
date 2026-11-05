/**
 * Legacy Note-line syntax (idea, question, assumption, open decision). New user-created lines are backfilled into persisted
 * Thoughts; the parser remains for migration, compatibility, and Note-to-Thought synchronization.
 *
 *  • NO SYNTAX NEEDED: a line that ENDS with `؟` or `?` is a «question» by itself (the user never has to learn a bracket);
 *    an explicit marker on the same line wins. `markLine` writes a marker for the user from a small menu
 *  • derived, never stored: the note text is the only thing that exists, and it is never rewritten
 *  • tied to its note by note id + a hash of the line, so a soft re-match survives a small edit
 *  • a thought of SEVERAL lines: every line but the last ends with `\` (the Markdown hard line break), so `- [ایده] الف\` /
 *    `ب\` / `ج` is ONE thought whose text is «الف⏎ب⏎ج». Only a thought with an explicit marker can continue; a note that never
 *    used a trailing backslash reads exactly as before
 *  • notes are never injected into a model, so neither are their items; an item only becomes knowledge when the user
 *    converts it (always PROPOSED, with the line as its quote)
 */

import type { ContextObject, Note, ThoughtKind, ThoughtStatus } from '../types';
import { jaccard, normalizeFa, titleTokens } from './contextEngine';

export type ThinkingKind = ThoughtKind;

export const THINKING_FA: Record<ThinkingKind, string> = { idea: 'ایده', question: 'سؤال', assumption: 'فرض', open_decision: 'تصمیم باز' };

export interface ThinkingItem {
  kind: ThinkingKind;
  /** true when the kind was recognised from the line's ending (؟ / ?), not from a bracket marker */
  inferred?: boolean;
  /** the text after the marker (as the user wrote it, trimmed) */
  text: string;
  /** 0-based line of the note (the first one) */
  line: number;
  /** the last line of a thought that continues over several lines (absent = the same as `line`) */
  endLine?: number;
  /** hash of the normalised text (stable across whitespace / ZWNJ / digit-style changes) */
  hash: string;
}
export interface NoteThinkingItem extends ThinkingItem {
  noteId: string;
  nodeId: string;
  /** Stable persisted identity; legacy parser results do not have one. */
  id?: string;
  status?: ThoughtStatus;
  sourceLineKey?: string;
  /** note id + hash (+ #n for a repeated line), only for legacy-derived results */
  key: string;
}

/** Project a persisted Thought into the existing display shape without deriving identity from mutable text. */
export function thoughtItem(thought: import('../types').Thought): NoteThinkingItem | undefined {
  if (!thought.kind) return undefined;
  const hash = thought.sourceLineKey ?? thought.id;
  return {
    id: thought.id, status: thought.status, sourceLineKey: thought.sourceLineKey, kind: thought.kind, text: thought.text,
    line: thought.sourceLine ?? -1, hash, noteId: thought.sourceNoteId ?? '',
    nodeId: thought.nodeId, key: thought.id,
  };
}

const MARKS = '\\u200c\\u200d\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff';
const LEAD = new RegExp(`^[\\s${MARKS}]*(?:[-*•–—]|[\\d۰-۹٠-٩]+[.)])?[\\s${MARKS}]*`);
const MARKER = new RegExp(`^\\[[\\s${MARKS}]*(ایده|سؤال|سوال|فرض|تصمیم[\\s${MARKS}]*باز|idea|question|assumption|open[\\s${MARKS}]*decision)[\\s${MARKS}]*\\][\\s${MARKS}]*[:：\\-–—]?[\\s${MARKS}]*`, 'i');

const KIND_OF = (raw: string): ThinkingKind => {
  const w = raw.replace(new RegExp(`[\\s${MARKS}]`, 'g'), '').toLowerCase();
  if (w === 'ایده' || w === 'idea') return 'idea';
  if (w === 'سؤال' || w === 'سوال' || w === 'question') return 'question';
  if (w === 'فرض' || w === 'assumption') return 'assumption';
  return 'open_decision';
};

/** FNV-1a over the normalised text — small, deterministic, no crypto needed */
export function lineHash(text: string): string {
  const t = normalizeFa(text.replace(/\u200c/g, '')).replace(new RegExp(`[${MARKS}]`, 'g'), '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/** the line ends with ؟ or ? (closing quotes / brackets / invisible marks / spaces after it are ignored); a heading (`#`) and a bare «؟» are not questions */
const TAIL = new RegExp(`[\\s${MARKS}»"')\\]}”’]*$`);
export function isQuestionLine(line: string): boolean {
  const t = line.replace(TAIL, '');
  if (!/[؟?]$/.test(t)) return false;
  const body = line.replace(LEAD, '').trim();
  if (!/\s/.test(body) && body.includes('://')) return false; // a bare link that ends with «?»
  return !body.startsWith('#') && /[\p{L}\p{N}]/u.test(t.slice(0, -1));
}

const HARD_BREAK = /\\[ \t]*$/;

export function parseThinking(content: string): ThinkingItem[] {
  const out: ThinkingItem[] = [];
  let open: ThinkingItem | undefined; // a marked thought whose previous line ended with `\`
  content.split(/\r?\n/).forEach((raw, line) => {
    if (open) {
      open.text = `${open.text}\n${raw.replace(HARD_BREAK, '').trim()}`;
      open.endLine = line;
      open.hash = lineHash(open.text);
      if (!HARD_BREAK.test(raw)) open = undefined;
      return;
    }
    const rest = raw.replace(LEAD, '');
    const m = MARKER.exec(rest);
    if (!m) {
      // a marker in the middle of a line is not a marker; but a line that ends with a question mark is a question
      if (isQuestionLine(rest)) out.push({ kind: 'question', inferred: true, text: rest.trim(), line, hash: lineHash(rest) });
      return;
    }
    const more = HARD_BREAK.test(rest);
    const text = rest.slice(m[0].length).replace(HARD_BREAK, '').trim();
    if (!text) return;
    const item: ThinkingItem = { kind: KIND_OF(m[1]), text, line, hash: lineHash(text) };
    out.push(item);
    if (more) open = item;
  });
  return out;
}

/** the 0-based lines that only CONTINUE the thought above them (not the first line of it): no badge, no marker menu */
export function continuationLines(content: string): Set<number> {
  const s = new Set<number>();
  for (const it of parseThinking(content)) if (it.endLine !== undefined) for (let l = it.line + 1; l <= it.endLine; l++) s.add(l);
  return s;
}

/** every thinking item of the notes, each with a unique key (note id + hash, `#n` for a repeated line) */
export function thinkingOf(notes: Pick<Note, 'id' | 'nodeId' | 'content'>[]): NoteThinkingItem[] {
  const out: NoteThinkingItem[] = [];
  for (const n of notes) {
    const seen = new Map<string, number>();
    for (const it of parseThinking(n.content)) {
      const k = `${n.id}:${it.hash}`;
      const c = (seen.get(k) ?? 0) + 1;
      seen.set(k, c);
      out.push({ ...it, noteId: n.id, nodeId: n.nodeId, key: c > 1 ? `${k}#${c}` : k });
    }
  }
  return out;
}

const SOFT = 0.6;
const sameLine = (a: string, b: string) => jaccard(titleTokens(a), titleTokens(b)) >= SOFT;

/** Resolve a legacy line reference by hash/text; persisted Thoughts use their stable ID first. */
export function findItem<T extends ThinkingItem>(items: T[], ref: { kind?: ThinkingKind; hash?: string; text?: string }): T | undefined {
  const exact = ref.hash ? items.find((i) => i.hash === ref.hash && (!ref.kind || i.kind === ref.kind)) : undefined;
  if (exact || !ref.text) return exact;
  return items.find((i) => (!ref.kind || i.kind === ref.kind) && sameLine(i.text, ref.text!));
}

/** has this item been turned into an object? (the object's `source` carries the note id and the line hash; an edited line still matches softly) */
export function convertedTo(item: NoteThinkingItem, objects: Pick<ContextObject, 'id' | 'status' | 'source'>[]): string | undefined {
  if (item.id) return item.status === 'resolved' ? item.id : objects.find((o) => o.source?.thoughtId === item.id && o.status !== 'Archived')?.id;
  return objects.find((o) => o.source?.kind === 'note' && o.source.noteId === item.noteId && o.status !== 'Archived'
    && (o.source.lineKey === item.hash || (!!o.source.quote && sameLine(o.source.quote, item.text))))?.id;
}

/** `##` sections of a note: two or more headings = «this part has grown, make it a node?» */
export function headingSections(content: string): Array<{ title: string; body: string }> {
  const lines = content.split(/\r?\n/);
  const out: Array<{ title: string; lines: string[] }> = [];
  for (const l of lines) {
    const m = /^##(?!#)\s*(.+?)\s*$/.exec(l);
    if (m) out.push({ title: m[1], lines: [] });
    else if (out.length) out[out.length - 1].lines.push(l);
  }
  return out.map((s) => ({ title: s.title, body: s.lines.join('\n').trim() }));
}
export const canSplit = (content: string) => headingSections(content).length >= 2;

/** the marker written for each kind (Persian; the parser reads Latin too) */
export const MARKER_OF: Record<ThinkingKind, string> = { idea: '[ایده]', question: '[سؤال]', assumption: '[فرض]', open_decision: '[تصمیم باز]' };

/**
 * «علامت بزن»: put (or replace, or with `null` remove) the marker of line `line` — the user never types a bracket.
 * Only that line changes; its bullet / number, its text and every other line stay exactly as written. A line that is already
 * recognised as that kind (explicitly, or as a question by its «؟») is left as is. Pure.
 */
export function markLine(content: string, line: number, kind: ThinkingKind | null): string {
  const lines = content.split('\n');
  const raw = lines[line];
  if (raw === undefined) return content;
  const cr = raw.endsWith('\r') ? '\r' : '';
  const body = cr ? raw.slice(0, -1) : raw;
  const lead = LEAD.exec(body)?.[0] ?? '';
  const rest = body.slice(lead.length);
  const m = MARKER.exec(rest);
  const text = m ? rest.slice(m[0].length) : rest;
  if (!text.trim()) return content;
  if (kind === null) { if (!m) return content; lines[line] = `${lead}${text}${cr}`; return lines.join('\n'); }
  if (m && KIND_OF(m[1]) === kind) return content;
  if (!m && kind === 'question' && isQuestionLine(rest)) return content;
  lines[line] = `${lead}${MARKER_OF[kind]} ${text}${cr}`;
  return lines.join('\n');
}

/** a line as it is SHOWN: the bracket marker is not displayed (the badge says it); bullet and text stay */
export function displayLine(line: string): string {
  const lead = LEAD.exec(line)?.[0] ?? '';
  const rest = line.slice(lead.length);
  const m = MARKER.exec(rest);
  return m ? `${lead}${rest.slice(m[0].length)}` : line;
}

/** the kind a line currently has (explicit marker, or a question by its ending) — for the checked entry of the menu */
export function kindOfLine(line: string): ThinkingKind | null {
  const rest = line.replace(LEAD, '');
  const m = MARKER.exec(rest);
  if (m) return KIND_OF(m[1]);
  return isQuestionLine(rest) ? 'question' : null;
}
