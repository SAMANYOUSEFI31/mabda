/**
 * «اطراف این مورد»: every DETERMINISTIC connection of one piece of knowledge in one place —
 *   relations   what it rests on · what rests on it (and how many further down) · what it replaced / what replaced it ·
 *               what it was derived from / derived from it · what it overrides / what overrides it
 *   thoughts    the open thoughts that name it (`@«…»` or a durable About)
 *   outputs     the outputs that used it (with the version they used)
 *   source      where it came from (the thought / note, an AI answer, a file, …)
 * Nothing is invented: a row exists only if its data does. The optional «مرتبط‌های معنایی» (`relatedFor`) is a SUGGESTION that comes
 * only from the `'related'` slot of `suggestionSlots` — off by default (no provider = `null` = nothing shown); it never creates a link.
 * Pure (except `relatedFor`, which asks the slot).
 */

import type { ContextObject, ContextRelationship, GeneratedDeliverable, Note, TreeNode } from '../types';
import { dependentsOf } from './decisionGraph';
import { isActiveContext } from './contextStatus';
import { provenanceOf } from './provenance';
import { getSlotProvider } from './suggestionSlots';
import { stripAbout, thoughtsAbout } from './thoughtAbout';

export type AroundGroupId = 'relations' | 'thoughts' | 'outputs' | 'source';
export type AroundTarget =
  | { type: 'object'; objectId: string }
  | { type: 'note'; noteId: string; nodeId: string }
  | { type: 'thought'; nodeId?: string }
  | { type: 'output'; deliverableId: string };
export interface AroundItem {
  key: string;
  /** the connection in a few words: «به این وابسته است» … (relations) or empty for a plain row */
  role?: string;
  /** the text of the row (a title, a thought, a sentence) */
  text: string;
  /** set when the row is another piece of knowledge, so the view can show its type and status */
  object?: ContextObject;
  /** how many further pieces of knowledge rest on it only through this one (the view writes «و N مورد دورتر») */
  far?: number;
  target?: AroundTarget;
}
export interface AroundGroup { id: AroundGroupId; title: string; empty: string; items: AroundItem[] }
export interface Around { groups: AroundGroup[]; total: number }

export interface AroundInput {
  objectId: string;
  objects: ContextObject[];
  relationships: ContextRelationship[];
  nodes: TreeNode[];
  /** open thoughts (anything with text and the durable / written About) */
  thoughts: Array<{ text: string; key?: string; nodeId?: string; aboutObjectIds?: string[] }>;
  notes: Array<Pick<Note, 'id' | 'nodeId' | 'content'>>;
  deliverables: Array<Pick<GeneratedDeliverable, 'id' | 'title' | 'usedContext' | 'archivedAt'>>;
}

export function aroundOf(input: AroundInput): Around {
  const { objectId, objects, relationships, nodes } = input;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const me = byId.get(objectId);
  const empty: Around = { groups: [], total: 0 };
  if (!me) return empty;

  // ── relations ──
  const rel: AroundItem[] = [];
  const row = (r: ContextRelationship, otherId: string, role: string, extra?: Partial<AroundItem>) => {
    const other = byId.get(otherId);
    if (other) rel.push({ key: `${r.id}:${role}`, role, text: other.title, object: other, target: { type: 'object', objectId: other.id }, ...extra });
  };
  const direct = new Set<string>();
  for (const r of relationships) {
    if (r.type === 'depends_on' && r.sourceId === me.id) row(r, r.targetId, 'به این وابسته است');
    else if (r.type === 'depends_on' && r.targetId === me.id) { if (byId.get(r.sourceId) && isActiveContext(byId.get(r.sourceId)!)) { direct.add(r.sourceId); row(r, r.sourceId, 'روی این سوار است'); } }
    else if (r.type === 'supersedes' && r.sourceId === me.id) row(r, r.targetId, 'جای این را گرفته');
    else if (r.type === 'supersedes' && r.targetId === me.id) row(r, r.sourceId, 'جایش را این گرفت');
    else if (r.type === 'derived_from' && r.sourceId === me.id) row(r, r.targetId, 'از این مشتق شده');
    else if (r.type === 'derived_from' && r.targetId === me.id) row(r, r.sourceId, 'از این مشتق شد');
    else if (r.type === 'overrides' && r.sourceId === me.id) row(r, r.targetId, 'این را برای بخش خودش کنار می‌گذارد');
    else if (r.type === 'overrides' && r.targetId === me.id) row(r, r.sourceId, 'این را کنار می‌گذارد');
  }
  // how many further pieces of knowledge rest on it only through others («و ۳ مورد دورتر»)
  const far = dependentsOf(me.id, relationships, objects).filter((id) => !direct.has(id)).length;
  const firstDependent = rel.find((i) => i.role === 'روی این سوار است');
  if (far > 0 && firstDependent) firstDependent.far = far;
  else if (far > 0) rel.push({ key: 'far', role: 'روی این سوار است', text: 'موارد دورتر', far });

  // ── thoughts, source, outputs (the provenance chain is the single source of truth for the last two) ──
  const prov = provenanceOf({ objectId, objects, relationships, notes: input.notes, deliverables: input.deliverables });
  const about = thoughtsAbout(input.thoughts.map((t, i) => ({ ...t, key: t.key ?? `t${i}` })), objectId, objects, nodes);
  const thoughtItems: AroundItem[] = about.map((t) => ({ key: `about:${t.key}`, text: stripAbout(t.text) || t.text, target: { type: 'thought', nodeId: t.nodeId } }));
  const sourceItems: AroundItem[] = prov.links.filter((l) => l.kind === 'thought' || l.kind === 'source').map((l, i) => ({
    key: `src:${i}`, text: l.text, ...(l.target?.type === 'note' ? { target: { type: 'note' as const, noteId: l.target.noteId, nodeId: l.target.nodeId } } : {}),
  }));
  const outputItems: AroundItem[] = prov.links.filter((l) => l.kind === 'output').map((l, i) => ({
    key: `out:${i}`, text: l.text, ...(l.target?.type === 'output' ? { target: { type: 'output' as const, deliverableId: l.target.deliverableId } } : {}),
  }));

  const groups: AroundGroup[] = [
    { id: 'relations', title: 'رابطه‌ها و وابستگی‌ها', empty: 'به مورد دیگری وصل نیست.', items: rel },
    { id: 'thoughts', title: 'فکرهای باز دربارهٔ این', empty: 'فکر بازی دربارهٔ این نیست.', items: thoughtItems },
    { id: 'outputs', title: 'خروجی‌هایی که از این استفاده کرده‌اند', empty: 'هنوز در هیچ خروجی‌ای استفاده نشده.', items: outputItems },
    { id: 'source', title: 'منبع', empty: 'منبعی ثبت نشده؛ یعنی خودت مستقیم نوشته‌ای.', items: sourceItems },
  ];
  return { groups, total: groups.reduce((n, g) => n + g.items.length, 0) };
}

export interface RelatedSuggestion { objectId: string; label: string; score?: number }

/**
 * «مرتبط‌های معنایی» (recipe findRelated, later): `null` while no provider is registered for slot `'related'` — the view then shows nothing
 * at all (not an empty state, not a spinner). With a provider: only suggestions that point at a live, other piece of knowledge, best first.
 * A provider that fails throws; the view shows the error with a retry (no invented answer).
 */
export async function relatedFor(me: Pick<ContextObject, 'id' | 'title' | 'content' | 'nodeId'>, objects: ContextObject[], alreadyAround: Set<string>): Promise<RelatedSuggestion[] | null> {
  const provider = getSlotProvider('related');
  if (!provider) return null;
  const live = new Map(objects.filter(isActiveContext).map((o) => [o.id, o]));
  const out = await provider({ text: `${me.title}\n${me.content}`, nodeId: me.nodeId });
  return out
    .filter((s) => s.slot === 'related' && s.targetId && s.targetId !== me.id && live.has(s.targetId) && !alreadyAround.has(s.targetId))
    .map((s) => ({ objectId: s.targetId!, label: live.get(s.targetId!)!.title, ...(s.score !== undefined ? { score: s.score } : {}) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
