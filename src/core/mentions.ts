/**
 * «@» references in the text of an object or a note: typing `@` offers the names of objects; choosing one writes
 * `@«عنوان»` into the text. A reference only SUGGESTS a relationship: on save the user is asked «این متن به X اشاره می‌کند؛
 * رابطهٔ وابسته‌به بسازم؟» and nothing is linked unless she says yes (then the normal dependency path records the Change).
 * Pure.
 */

import type { ContextObject, ContextRelationship } from '../types';
import { normalizeFa } from './contextEngine';
import { buildSearchIndex, searchIndex } from './globalSearch';

const RE = /@«([^»\n]{1,120})»/g;
const live = (o: ContextObject) => !o.sample && o.status !== 'Archived' && o.status !== 'Superseded';
/** the text written between « » for an object: the title without characters that would end the reference */
export const mentionTitle = (o: Pick<ContextObject, 'title'>): string => o.title.replace(/[»\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
export const mentionText = (o: Pick<ContextObject, 'title'>): string => `@«${mentionTitle(o)}»`;

export interface Mention { start: number; end: number; title: string; /** the object it names; absent when no object has that title, or several do */ objectId?: string; ambiguous?: boolean }

/** every `@«…»` in a text and the object it names (matched on the normalised title; two objects with one title = ambiguous, never guessed) */
export function extractMentions(text: string, objects: ContextObject[]): Mention[] {
  const byTitle = new Map<string, ContextObject[]>();
  for (const o of objects) if (live(o)) { const k = normalizeFa(mentionTitle(o)); byTitle.set(k, [...(byTitle.get(k) ?? []), o]); }
  const out: Mention[] = [];
  for (const m of text.matchAll(RE)) {
    const hit = byTitle.get(normalizeFa(m[1]));
    out.push({ start: m.index!, end: m.index! + m[0].length, title: m[1], ...(hit?.length === 1 ? { objectId: hit[0].id } : hit && hit.length > 1 ? { ambiguous: true } : {}) });
  }
  return out;
}

export interface LinkSuggestion { targetId: string; title: string }

/**
 * Which «وابسته به» links the text suggests: named objects that are not the object itself, not archived / superseded / still
 * only proposed (a dependency is on knowledge), not linked yet and not turned down before. Never creates anything.
 */
export function suggestLinks(input: { text: string; selfId?: string; objects: ContextObject[]; relationships: ContextRelationship[]; dismissed?: Iterable<string> }): LinkSuggestion[] {
  const have = new Set(input.relationships.filter((r) => r.type === 'depends_on' && r.sourceId === input.selfId).map((r) => r.targetId));
  const no = new Set(input.dismissed ?? []);
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const seen = new Set<string>();
  const out: LinkSuggestion[] = [];
  for (const m of extractMentions(input.text, input.objects)) {
    const id = m.objectId;
    if (!id || seen.has(id) || id === input.selfId || have.has(id) || no.has(id)) continue;
    const t = byId.get(id)!;
    if (t.status === 'Proposed') continue;
    seen.add(id);
    out.push({ targetId: id, title: t.title });
  }
  return out;
}

/** the `@word` being typed at the caret (it must start the text or follow a space); null when the caret is not in one */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/[\s(،؛:]/.test(before[at - 1])) return null;
  const typed = before.slice(at + 1).replace(/^«/, '');
  if (/[»\n]/.test(typed) || typed.length > 40) return null;
  return { start: at, query: typed };
}

/** objects offered for `@query` (names that start with, or contain, what is typed; the object being edited is left out) */
export function mentionCandidates(query: string, objects: ContextObject[], selfId?: string, limit = 6): ContextObject[] {
  const pool = objects.filter((o) => live(o) && o.id !== selfId);
  const byId = new Map(pool.map((o) => [o.id, o]));
  if (!query.trim()) return [...pool].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, limit);
  const q = normalizeFa(query);
  // title matches first (starts-with, then contains), then the BM25 search over title + text
  const titled = pool.filter((o) => normalizeFa(o.title).includes(q)).sort((a, b) => Number(!normalizeFa(a.title).startsWith(q)) - Number(!normalizeFa(b.title).startsWith(q)) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const ranked = searchIndex(buildSearchIndex({ nodes: [], objects: pool }), query, { limitPerGroup: limit }).object.map((h) => byId.get(h.id)!).filter(Boolean);
  return [...new Map([...titled, ...ranked].map((o) => [o.id, o])).values()].slice(0, limit);
}

/** writes the chosen object in place of the typed `@query` and says where the caret goes */
export function applyMention(text: string, active: { start: number }, caret: number, o: Pick<ContextObject, 'title'>): { text: string; caret: number } {
  const rest = text.slice(caret);
  const ins = /^[\s،.؛:؟!)]/.test(rest) ? mentionText(o) : `${mentionText(o)} `; // no second space when one already follows
  return { text: text.slice(0, active.start) + ins + rest, caret: active.start + ins.length };
}
