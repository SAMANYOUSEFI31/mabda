/**
 * «از کجا آمده / به چه تبدیل شد»: the chain around one piece of knowledge, from data that already exists —
 *   thought     the note line it was made from (`source.kind = 'note'` + `noteId` + `lineKey`, the same tie as «✓ converted»)
 *   source      the AI answer / file / chat / MCP client it came from (`source`)
 *   replaced    the versions it replaced (`supersedes` relations: new → old)
 *   replacedBy  what replaced it
 *   output      the outputs built from it (`usedContext`), with the version they used
 * Each link says what it is and where to go. Pure; nothing is invented — a link exists only if its data does.
 */

import type { ContextObject, ContextRelationship, GeneratedDeliverable, Note } from '../types';
import { thinkingOf } from './thinkingMarkers';

export type ProvenanceKind = 'thought' | 'source' | 'replaced' | 'replacedBy' | 'output';
export interface ProvenanceLink {
  kind: ProvenanceKind;
  /** one short line for the user */
  text: string;
  /** where a click goes */
  target?: { type: 'note'; noteId: string; nodeId: string } | { type: 'object'; objectId: string } | { type: 'output'; deliverableId: string };
}
export interface Provenance { links: ProvenanceLink[]; /** the pieces, grouped for a sentence like «از فکر X آمد؛ در ۲ خروجی رفت» */ counts: { outputs: number; replaced: number } }

const SOURCE_FA: Record<NonNullable<ContextObject['source']>['kind'], string> = {
  mcp: 'AI بیرونی', chat: 'گفتگو', coach: 'مربی دانش', file: 'فایل', note: 'یادداشت', paste: 'پاسخ چسبانده‌شده', user: 'خودت', asset: 'خروجی ساخته‌شده',
};

export function provenanceOf(input: { objectId: string; objects: ContextObject[]; relationships: ContextRelationship[]; notes: Pick<Note, 'id' | 'nodeId' | 'content'>[]; deliverables: Array<Pick<GeneratedDeliverable, 'id' | 'title' | 'usedContext' | 'archivedAt'>> }): Provenance {
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const o = byId.get(input.objectId);
  if (!o) return { links: [], counts: { outputs: 0, replaced: 0 } };
  const links: ProvenanceLink[] = [];

  const src = o.source;
  if (src?.kind === 'note' && src.noteId) {
    const note = input.notes.find((n) => n.id === src.noteId);
    const line = note ? thinkingOf([note]).find((t) => t.hash === src.lineKey || (!!src.quote && t.text.replace(/\s+/g, ' ').trim() === src.quote.replace(/\s+/g, ' ').trim())) : undefined;
    if (note) links.push({ kind: 'thought', text: line ? `از فکری آمد: «${line.text.slice(0, 90)}»` : 'از یک یادداشت آمد', target: { type: 'note', noteId: note.id, nodeId: note.nodeId } });
    else links.push({ kind: 'thought', text: 'از یک یادداشت آمد (یادداشت دیگر نیست)' });
  } else if (src) {
    links.push({ kind: 'source', text: `از ${SOURCE_FA[src.kind] ?? 'منبع دیگر'}${src.label ? ` («${src.label}»)` : ''} آمد${src.quote ? `: «${src.quote.slice(0, 90)}»` : ''}` });
  }

  const supersedes = input.relationships.filter((r) => r.type === 'supersedes');
  for (const r of supersedes.filter((x) => x.sourceId === o.id)) { const old = byId.get(r.targetId); if (old) links.push({ kind: 'replaced', text: `جای «${old.title}» را گرفت`, target: { type: 'object', objectId: old.id } }); }
  for (const r of supersedes.filter((x) => x.targetId === o.id)) { const neu = byId.get(r.sourceId); if (neu) links.push({ kind: 'replacedBy', text: `جایش را «${neu.title}» گرفت`, target: { type: 'object', objectId: neu.id } }); }

  const outs = input.deliverables.filter((d) => !d.archivedAt && (d.usedContext ?? []).some((u) => u.id === o.id));
  for (const d of outs) {
    const v = d.usedContext!.find((u) => u.id === o.id)!.version;
    links.push({ kind: 'output', text: `در «${d.title}» استفاده شد${v !== o.version ? ` (نسخهٔ ${v})` : ''}`, target: { type: 'output', deliverableId: d.id } });
  }
  return { links, counts: { outputs: outs.length, replaced: links.filter((l) => l.kind === 'replaced').length } };
}
