/**
 * «حقیقت در دو لحظه»: what the source of truth said at one moment versus another — and, with the same engine, «اگر همه را
 * تأیید کنم» (today's truth + everything waiting). Pure; nothing here reads or writes a database.
 *
 *  • truthAt(date)   : each piece of knowledge is rebuilt AS IT WAS by undoing, newest first, the changes recorded after the date
 *                      (every change keeps the before and after of the fields it altered). Only Confirmed knowledge that was in
 *                      force counts: archived, superseded, expired, proposed and sample items are not truth. A permanently deleted
 *                      item left no content, so it cannot be rebuilt and is simply absent (never reconstructed from anything else).
 *  • compareTruth    : added · removed · changed (with a word diff) · moved to another section · its reach changed.
 *  • truthIfApproved : today's truth plus the pending ones (proposals, items waiting for a look, drafts of confirmed knowledge).
 *
 * Known limit, said in the UI docs: the shape of the tree itself (a whole section moved) is read as it is NOW; only the knowledge's
 * own section at that time is honoured.
 */

import type { ContextChange, ContextObject, GeneratedDeliverable, TreeNode } from '../types';
import { normalizeFa } from './contextEngine';
import { reachOf } from './effectiveContext';
import { subtreeIds } from './nodeTree';
import { diffWords, isSame } from './textDiff';
import type { DiffSegment } from './textDiff';

export interface TruthItem { id: string; title: string; content: string; type: ContextObject['type']; nodeId: string; reach: 'global' | 'position'; version: number; assumption: boolean }
export type TruthSet = Map<string, TruthItem>;

const ms = (d: Date | string | number) => (typeof d === 'object' ? d.getTime() : new Date(d).getTime());
const REVERTIBLE = ['title', 'content', 'type', 'nodeId', 'status', 'reach', 'validUntil', 'assumption'] as const;
type State = Pick<ContextObject, 'title' | 'content' | 'type' | 'nodeId' | 'status' | 'reach' | 'validUntil' | 'assumption' | 'version'>;

const toItem = (o: ContextObject, s: State): TruthItem => ({ id: o.id, title: s.title, content: s.content, type: s.type, nodeId: s.nodeId, reach: reachOf({ type: s.type, reach: s.reach }), version: s.version, assumption: !!s.assumption });
const inForce = (s: Pick<State, 'status' | 'validUntil'>, atMs: number) => s.status === 'Confirmed' && !(s.validUntil && new Date(s.validUntil).getTime() < atMs);

/** changes per object, oldest first, built once (the cost is the number of changes, not objects × changes) */
function indexChanges(changes: ContextChange[]): Map<string, ContextChange[]> {
  const by = new Map<string, ContextChange[]>();
  for (const c of changes) { if (c.objectId.startsWith('node:') || c.objectId.startsWith('metric:')) continue; const l = by.get(c.objectId); if (l) l.push(c); else by.set(c.objectId, [c]); }
  for (const l of by.values()) l.sort((a, b) => a.at.localeCompare(b.at) || a.toVersion - b.toVersion);
  return by;
}

/** the state of ONE object at a moment, or null when it did not exist yet */
function stateAt(o: ContextObject, list: ContextChange[] | undefined, atMs: number): State | null {
  const born = list?.find((c) => c.kind === 'created' || c.kind === 'imported');
  if (born ? new Date(born.at).getTime() > atMs : new Date(o.createdAt).getTime() > atMs) return null;
  const st: State = { title: o.title, content: o.content, type: o.type, nodeId: o.nodeId, status: o.status, reach: o.reach, validUntil: o.validUntil, assumption: o.assumption, version: o.version };
  if (!list) return st;
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    if (new Date(c.at).getTime() <= atMs) break;
    const b = c.before as Record<string, unknown> | undefined;
    if (b) for (const k of REVERTIBLE) if (k in b) (st as unknown as Record<string, unknown>)[k] = b[k];
    if (c.toVersion > c.fromVersion && c.kind !== 'created' && c.kind !== 'imported') st.version = c.fromVersion;
  }
  return st;
}

export function truthAt(input: { objects: ContextObject[]; changes: ContextChange[] }, at: Date | string | number): TruthSet {
  const atMs = ms(at);
  const by = indexChanges(input.changes);
  const out: TruthSet = new Map();
  for (const o of input.objects) {
    if (o.sample) continue;
    const st = stateAt(o, by.get(o.id), atMs);
    if (st && inForce(st, atMs)) out.set(o.id, toItem(o, st));
  }
  return out;
}

/** today's truth plus what is waiting: proposals, items that need a look, and the pending rewrite of confirmed knowledge */
export function truthIfApproved(input: { objects: ContextObject[] }, opts: { now?: Date | string | number; only?: Set<string> } = {}): TruthSet {
  const nowMs = ms(opts.now ?? Date.now());
  const chosen = (id: string) => !opts.only || opts.only.has(id);
  const out: TruthSet = new Map();
  for (const o of input.objects) {
    if (o.sample || o.status === 'Archived' || o.status === 'Superseded') continue;
    let s: State | null = null;
    if (o.status === 'Confirmed') {
      const take = !!o.draft && chosen(o.id);
      s = { title: take ? o.draft!.title : o.title, content: take ? o.draft!.content : o.content, type: o.type, nodeId: o.nodeId, status: 'Confirmed', reach: o.reach, validUntil: o.validUntil, assumption: o.assumption, version: o.version + (take ? 1 : 0) };
    } else if ((o.status === 'Proposed' || o.status === 'Needs Review') && chosen(o.id)) {
      s = { title: o.title, content: o.content, type: o.type, nodeId: o.nodeId, status: 'Confirmed', reach: o.reach, validUntil: o.validUntil, assumption: o.assumption, version: o.version };
    }
    if (s && inForce(s, nowMs)) out.set(o.id, toItem(o, s));
  }
  return out;
}

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved' | 'reach';
export interface TruthDelta {
  id: string;
  kinds: ChangeKind[];
  before?: TruthItem;
  after?: TruthItem;
  /** word diff of the text (title + content) — only when it changed */
  diff?: DiffSegment[];
  /** the section it belongs to NOW (or, for a removed item, where it was) */
  nodeId: string;
}
export interface TruthComparison {
  deltas: TruthDelta[];
  counts: Record<ChangeKind, number> & { total: number };
}

/** the same words with the same meaning: Persian/Arabic digits, ی/ك, half-spaces and spacing do not count as a change (Postel) */
const norm = (s: string) => normalizeFa(s.replace(/[‌‏]/g, ' ')).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g, ' ').trim();
const text = (i: TruthItem) => `${i.title}\n${i.content}`;

/** old id → the object that replaced it (a rewrite of confirmed knowledge is a replacement; to a person it is ONE item that changed) */
export function successionOf(objects: Array<Pick<ContextObject, 'id' | 'supersededById'>>): Map<string, string> {
  return new Map(objects.filter((o) => o.supersededById).map((o) => [o.id, o.supersededById!]));
}

export function compareTruth(a: TruthSet, b: TruthSet, opts: { nodes?: TreeNode[]; scopeNodeId?: string; succession?: Map<string, string> } = {}): TruthComparison {
  const scope = opts.scopeNodeId && opts.nodes ? new Set(subtreeIds(opts.nodes, opts.scopeNodeId)) : null;
  const inScope = (i?: TruthItem) => !!i && (!scope || scope.has(i.nodeId));
  const deltas: TruthDelta[] = [];
  // a removed item whose replacement appeared is ONE changed item (follow a chain of replacements; stop at a cycle)
  const merged = new Set<string>();
  const heir = new Map<string, string>();
  if (opts.succession) {
    for (const id of a.keys()) {
      if (b.has(id)) continue;
      let cur = opts.succession.get(id);
      for (let hop = 0; cur && hop < 20 && !(b.has(cur) && !a.has(cur)); hop++) cur = opts.succession.get(cur);
      if (cur && b.has(cur) && !a.has(cur) && !merged.has(cur)) { heir.set(id, cur); merged.add(cur); }
    }
  }
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    if (merged.has(id)) continue;
    const x = a.get(id), y = b.get(heir.get(id) ?? id);
    if (!inScope(x) && !inScope(y)) continue;
    if (!x && y) { deltas.push({ id, kinds: ['added'], after: y, nodeId: y.nodeId }); continue; }
    if (x && !y) { deltas.push({ id, kinds: ['removed'], before: x, nodeId: x.nodeId }); continue; }
    const replaced = heir.has(id);
    if (!x || !y) continue;
    const kinds: ChangeKind[] = [];
    let diff: DiffSegment[] | undefined;
    if (replaced || norm(text(x)) !== norm(text(y)) || x.type !== y.type) { diff = diffWords(text(x), text(y)); if (!isSame(diff) || x.type !== y.type) kinds.push('changed'); else diff = undefined; }
    if (x.nodeId !== y.nodeId) kinds.push('moved');
    if (x.reach !== y.reach) kinds.push('reach');
    if (kinds.length) deltas.push({ id: replaced ? y.id : id, kinds, before: x, after: y, ...(diff ? { diff } : {}), nodeId: y.nodeId });
  }
  const counts = { added: 0, removed: 0, changed: 0, moved: 0, reach: 0, total: deltas.length };
  for (const d of deltas) for (const k of d.kinds) counts[k]++;
  return { deltas, counts };
}

/** the reason a person wrote for the latest change of one of these objects inside the window (a replacement keeps it on the OLD object) */
export function reasonFor(ids: string[], changes: ContextChange[], from: Date | string | number, to: Date | string | number): string | undefined {
  const lo = ms(from), hi = ms(to), want = new Set(ids);
  let best: ContextChange | undefined;
  for (const c of changes) {
    if (!want.has(c.objectId) || !c.reason?.trim()) continue;
    const t = new Date(c.at).getTime();
    if (t <= lo || t > hi) continue;
    if (!best || c.at > best.at) best = c;
  }
  return best?.reason?.trim();
}

/** the most telling change: a guardrail or a global decision that changed or went away, else the first changed one */
export function mostImportant(c: TruthComparison): TruthDelta | undefined {
  const weight = (d: TruthDelta) => { const i = d.after ?? d.before!; return (i.type === 'Constraint' ? 0 : i.reach === 'global' ? 1 : i.type === 'Decision' ? 2 : 3) * 10 + (d.kinds.includes('removed') ? 0 : d.kinds.includes('changed') ? 1 : d.kinds.includes('added') ? 2 : 3); };
  return [...c.deltas].sort((p, q) => weight(p) - weight(q) || (p.after ?? p.before!).title.localeCompare((q.after ?? q.before!).title))[0];
}

export interface SectionGroup { nodeId: string; label: string; deltas: TruthDelta[] }

/** the changes grouped by section, in tree order (a section the tree no longer has comes last under «بخش نامشخص») */
export function groupBySection(c: TruthComparison, nodes: TreeNode[]): SectionGroup[] {
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const by = new Map<string, TruthDelta[]>();
  for (const d of c.deltas) by.set(d.nodeId, [...(by.get(d.nodeId) ?? []), d]);
  return [...by].map(([nodeId, deltas]) => ({ nodeId, label: nodes.find((n) => n.id === nodeId)?.label ?? 'بخش نامشخص', deltas }))
    .sort((p, q) => (order.get(p.nodeId) ?? 1e9) - (order.get(q.nodeId) ?? 1e9));
}

export interface AffectedOutput { id: string; title: string; because: string[] }

/** outputs built before `until` from knowledge that changed or went away in this comparison — they would need a look (Context Replay) */
export function affectedOutputs(c: TruthComparison, deliverables: Array<Pick<GeneratedDeliverable, 'id' | 'title' | 'usedContext' | 'createdAt'> & { archivedAt?: string }>, until?: Date | string | number): AffectedOutput[] {
  const hit = new Map(c.deltas.filter((d) => d.kinds.includes('changed') || d.kinds.includes('removed')).map((d) => [d.id, (d.before ?? d.after!).title]));
  const out: AffectedOutput[] = [];
  for (const d of deliverables) {
    if (d.archivedAt) continue;
    if (until !== undefined && new Date(d.createdAt).getTime() > ms(until)) continue;
    const because = d.usedContext.filter((u) => hit.has(u.id)).map((u) => hit.get(u.id)!);
    if (because.length) out.push({ id: d.id, title: d.title, because: [...new Set(because)] });
  }
  return out;
}

/** a short sentence: «۳ افزوده، ۲ تغییر، ۱ حذف» — an empty comparison says so calmly */
export function summarySentence(c: TruthComparison, fa: (n: number) => string = String): string {
  const parts = [
    c.counts.added ? `${fa(c.counts.added)} افزوده` : '', c.counts.changed ? `${fa(c.counts.changed)} تغییر` : '', c.counts.removed ? `${fa(c.counts.removed)} حذف` : '',
    c.counts.moved ? `${fa(c.counts.moved)} جابه‌جا` : '', c.counts.reach ? `${fa(c.counts.reach)} تغییر در جای اعمال` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('، ') : 'چیزی عوض نشده است.';
}

/** Markdown for copying: the summary, then each section with its changes (a word diff reads as ~~old~~ **new**) */
export function toMarkdown(c: TruthComparison, nodes: TreeNode[], title: string, fa: (n: number) => string = String, outputs: AffectedOutput[] = []): string {
  const kindFa: Record<ChangeKind, string> = { added: 'افزوده', removed: 'حذف‌شده', changed: 'تغییر', moved: 'جابه‌جا', reach: 'جای اعمال' };
  const lines = [`# ${title}`, '', summarySentence(c, fa), ''];
  for (const g of groupBySection(c, nodes)) {
    lines.push(`## ${g.label}`);
    for (const d of g.deltas) {
      const i = d.after ?? d.before!;
      const how = d.kinds.map((k) => kindFa[k]).join('، ');
      lines.push(`- **${i.title}** — ${how}`);
      if (d.diff) lines.push(`  ${d.diff.map((s) => (s.kind === 'del' ? `~~${s.text.trim()}~~ ` : s.kind === 'add' ? `**${s.text.trim()}** ` : s.text)).join('').replace(/\s+/g, ' ').trim()}`);
    }
    lines.push('');
  }
  if (outputs.length) { lines.push('## خروجی‌هایی که باید دوباره دیده شوند'); for (const o of outputs) lines.push(`- ${o.title} (از روی: ${o.because.join('، ')})`); }
  return lines.join('\n').trim();
}

/** quick presets for the two moments; `milestones` are the moments an approval happened (newest first) */
export function presetMoments(now: Date, milestones: string[]): { weekAgo: string; lastApproval?: string; startOfMonth: string } {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const lastApproval = milestones[0] ? new Date(new Date(milestones[0]).getTime() - 1).toISOString() : undefined;
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return { weekAgo, ...(lastApproval ? { lastApproval } : {}), startOfMonth };
}

/** when approvals happened (a proposal accepted, a status made Confirmed, a confirmed creation), newest first, one per minute */
export function approvalMoments(changes: ContextChange[], limit = 8, objects: Array<Pick<ContextObject, 'id' | 'status'>> = []): string[] {
  // an edit of knowledge that is confirmed now is an approval too (a «ویرایش تأییدشده»); a draft of something not confirmed is not
  const confirmed = new Set(objects.filter((o) => o.status === 'Confirmed').map((o) => o.id));
  const at = changes
    .filter((c) => !c.objectId.startsWith('node:') && !c.objectId.startsWith('metric:') && (c.kind === 'proposal_accepted' || ((c.kind === 'status_changed' || c.kind === 'created') && (c.after as { status?: string } | undefined)?.status === 'Confirmed') || (c.kind === 'edited' && c.toVersion > c.fromVersion && confirmed.has(c.objectId))))
    .map((c) => c.at).sort().reverse();
  const out: string[] = [];
  for (const t of at) if (!out.length || Math.abs(new Date(out[out.length - 1]).getTime() - new Date(t).getTime()) > 60_000) out.push(t);
  return out.slice(0, limit);
}

