/**
 * Line markers inside a note — the reference-document thinking structure (idea, question, assumption, open decision)
 * WITHOUT a separate section: a line that STARTS with `[ایده]` `[سؤال]` `[فرض]` `[تصمیم باز]` (or `[Idea]` `[Question]`
 * `[Assumption]` `[Open Decision]`) is a derived «thinking item». Pure.
 *
 *  • derived, never stored: the note text is the only thing that exists, and it is never rewritten
 *  • tied to its note by note id + a hash of the line, so a soft re-match survives a small edit
 *  • notes are never injected into a model, so neither are their items; an item only becomes knowledge when the user
 *    converts it (always PROPOSED, with the line as its quote)
 */

import type { ContextObject, Note } from '../types';
import { jaccard, normalizeFa, titleTokens } from './contextEngine';

export type ThinkingKind = 'idea' | 'question' | 'assumption' | 'open_decision';

export const THINKING_FA: Record<ThinkingKind, string> = { idea: 'ایده', question: 'سؤال', assumption: 'فرض', open_decision: 'تصمیم باز' };

export interface ThinkingItem {
  kind: ThinkingKind;
  /** the text after the marker (as the user wrote it, trimmed) */
  text: string;
  /** 0-based line of the note */
  line: number;
  /** hash of the normalised text (stable across whitespace / ZWNJ / digit-style changes) */
  hash: string;
}
export interface NoteThinkingItem extends ThinkingItem { noteId: string; nodeId: string; /** note id + hash (+ #n for a repeated line) */ key: string }

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

export function parseThinking(content: string): ThinkingItem[] {
  const out: ThinkingItem[] = [];
  content.split(/\r?\n/).forEach((raw, line) => {
    const rest = raw.replace(LEAD, '');
    const m = MARKER.exec(rest);
    if (!m) return; // a marker in the middle of a line is not a marker
    const text = rest.slice(m[0].length).trim();
    if (!text) return;
    out.push({ kind: KIND_OF(m[1]), text, line, hash: lineHash(text) });
  });
  return out;
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

/** the item of `items` that a stored (kind, hash, text) refers to: exact hash first, then a soft match of the same kind */
export function findItem<T extends ThinkingItem>(items: T[], ref: { kind?: ThinkingKind; hash?: string; text?: string }): T | undefined {
  const exact = ref.hash ? items.find((i) => i.hash === ref.hash && (!ref.kind || i.kind === ref.kind)) : undefined;
  if (exact || !ref.text) return exact;
  return items.find((i) => (!ref.kind || i.kind === ref.kind) && sameLine(i.text, ref.text!));
}

/** has this item been turned into an object? (the object's `source` carries the note id and the line hash; an edited line still matches softly) */
export function convertedTo(item: NoteThinkingItem, objects: Pick<ContextObject, 'id' | 'status' | 'source'>[]): string | undefined {
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
