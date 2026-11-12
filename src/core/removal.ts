/**
 * Removal, said BEFORE it is done (docs/removal.md). Pure.
 *
 *  · nodeRemovalPlan — what a node delete does to the tree and to what reaches whom, for BOTH modes:
 *      «move»    the node goes; its knowledge, notes, Thoughts and files and its direct sub-sections go to a target (default: its parent)
 *      «archive» the node and its whole branch go; the branch's knowledge is ARCHIVED; notes, Thoughts and files go to the target
 *  · permanent delete — the words to look for (so «also found in …» can be listed) and how to scrub a line out of a note
 */

import type { ContextObject, ContextRelationship, Note, Thought, TreeNode } from '../types';
import { effectiveFor, inForce } from './effectiveContext';
import { canDelete, defaultTransferTarget, flatten, subtreeIds } from './nodeTree';
import type { NodeContent } from './nodeTree';
import { isActiveContext } from './contextStatus';

export type RemovalMode = 'move' | 'archive';

export interface TreePreviewRow { id: string; label: string; depth: number; state: 'kept' | 'removed' | 'moved'; /** where a section ends up when it moves (its new parent) */ to?: string }
export interface RemovalEffect {
  lost: Array<{ object: ContextObject; nodes: string[] }>;
  gained: Array<{ object: ContextObject; nodes: string[] }>;
  sentences: string[];
}
export interface NodeRemovalPlan {
  ok: boolean;
  reason?: string;
  mode: RemovalMode;
  /** the section the content goes to (absent when the branch is empty) */
  target?: string;
  /** sections that disappear: the node (move) or the whole branch (archive) */
  removed: string[];
  tree: TreePreviewRow[];
  counts: NodeContent & { archived: number; branchNodes: number };
  effect: RemovalEffect;
}

const TYPE_WORD = { Constraint: 'خط قرمز', Decision: 'تصمیم', Fact: 'دانش' } as const;
const isLive = (o: ContextObject) => isActiveContext(o) && !o.sample;

export function nodeRemovalPlan(input: {
  nodes: TreeNode[]; objects: ContextObject[]; notes: Pick<Note, 'nodeId'>[]; files?: Array<{ nodeId?: string }>; relationships?: ContextRelationship[];
  thoughts?: Pick<Thought, 'nodeId'>[];
  id: string; mode?: RemovalMode; transferTo?: string; now?: Date;
}): NodeRemovalPlan {
  const { nodes, objects, id } = input;
  const mode = input.mode ?? 'move';
  const files = input.files ?? [];
  const thoughts = input.thoughts ?? [];
  const rels = input.relationships ?? [];
  const now = input.now ?? new Date();
  const label = (nid: string) => nodes.find((n) => n.id === nid)?.label ?? nid;
  const branch = subtreeIds(nodes, id);
  const removed = mode === 'archive' ? branch : [id];
  const inBranch = new Set(branch);
  const here = nodes.find((n) => n.id === id);
  const direct = { objects: objects.filter((o) => o.nodeId === id && !o.sample).length, notes: input.notes.filter((n) => n.nodeId === id).length, thoughts: thoughts.filter((t) => t.nodeId === id).length, files: files.filter((f) => f.nodeId === id).length, children: nodes.filter((n) => n.parentId === id).length };
  const branchObjects = objects.filter((o) => inBranch.has(o.nodeId) && isLive(o));
  const empty0 = { objects: 0, notes: 0, thoughts: 0, files: 0, children: 0, archived: 0, branchNodes: branch.length };
  const fail = (reason: string): NodeRemovalPlan => ({ ok: false, reason, mode, removed, tree: [], counts: { ...empty0 }, effect: { lost: [], gained: [], sentences: [] } });
  if (!here) return fail('این بخش وجود ندارد.');
  const target = input.transferTo ?? defaultTransferTarget(nodes, id);
  // a branch with content needs somewhere to put notes, Thoughts, files, and knowledge (move), or raw material and files (archive).
  const archivedCount = mode === 'archive' ? branchObjects.length : 0;
  const notesFiles = (mode === 'archive'
    ? { notes: input.notes.filter((n) => inBranch.has(n.nodeId)).length, thoughts: thoughts.filter((t) => inBranch.has(t.nodeId)).length, files: files.filter((f) => f.nodeId && inBranch.has(f.nodeId)).length }
    : { notes: direct.notes, thoughts: direct.thoughts, files: direct.files });
  const needsPlace = mode === 'archive' ? notesFiles.notes + notesFiles.thoughts + notesFiles.files > 0 : direct.objects + direct.notes + direct.thoughts + direct.files + direct.children > 0;
  if (mode === 'move') {
    const check = canDelete(nodes, id, objects.filter((o) => !o.sample), input.notes, needsPlace ? target : undefined, files, thoughts);
    if (!check.ok) return fail(check.reason);
  } else {
    // The branch's knowledge stays archived; its raw material, Thoughts and files need a home.
    if (!here.parentId && nodes.filter((n) => !n.parentId).length <= 1) return fail('این آخرین بخش اصلی است؛ دانش باید جایی بماند. اول یک بخش دیگر بساز.');
    if (target && (!nodes.some((n) => n.id === target) || inBranch.has(target))) return fail(inBranch.has(target) ? 'مقصد نمی‌تواند خودِ بخش یا زیرشاخه‌اش باشد.' : 'بخش مقصد وجود ندارد.');
  }
  if (needsPlace && !target) return fail('این بخش خالی نیست؛ محتوایش باید به جایی برود.');

  // — the tree after —
  const parentOf = (n: TreeNode): string | undefined => (mode === 'move' && n.parentId === id ? target : n.parentId);
  const after = nodes.filter((n) => !removed.includes(n.id)).map((n) => ({ ...n, parentId: parentOf(n) }));
  const preview: TreePreviewRow[] = [];
  const beforeFlat = flatten(nodes);
  const afterDepth = new Map(flatten(after).map((x) => [x.node.id, x.depth]));
  const movedIds = new Set(mode === 'move' ? nodes.filter((n) => n.parentId === id).map((n) => n.id) : []);
  for (const { node, depth } of beforeFlat) {
    if (removed.includes(node.id)) { preview.push({ id: node.id, label: node.label, depth, state: 'removed' }); continue; }
    if (movedIds.has(node.id)) { preview.push({ id: node.id, label: node.label, depth: afterDepth.get(node.id) ?? depth, state: 'moved', ...(target ? { to: label(target) } : {}) }); continue; }
    preview.push({ id: node.id, label: node.label, depth: afterDepth.get(node.id) ?? depth, state: 'kept' });
  }

  // — what reaches whom, before and after (approved, live knowledge only) —
  const truthBefore = objects.filter((o) => o.status === 'Confirmed' && !o.sample);
  const truthAfter = truthBefore.filter((o) => !(mode === 'archive' && inBranch.has(o.nodeId))).map((o) => (mode === 'move' && o.nodeId === id && target ? { ...o, nodeId: target } : o));
  const lostBy = new Map<string, { object: ContextObject; nodes: string[] }>();
  const gainBy = new Map<string, { object: ContextObject; nodes: string[] }>();
  for (const n of after) {
    const b = new Map(inForce(effectiveFor(n.id, truthBefore, nodes, rels, now)).map((i) => [i.object.id, i.object]));
    const a = new Map(inForce(effectiveFor(n.id, truthAfter, after, rels, now)).map((i) => [i.object.id, i.object]));
    for (const [oid, o] of b) if (!a.has(oid)) { const e = lostBy.get(oid) ?? { object: o, nodes: [] }; e.nodes.push(n.label); lostBy.set(oid, e); }
    for (const [oid, o] of a) if (!b.has(oid)) { const e = gainBy.get(oid) ?? { object: o, nodes: [] }; e.nodes.push(n.label); gainBy.set(oid, e); }
  }
  const where = (ns: string[]) => (ns.length <= 2 ? ns.map((x) => `«${x}»`).join(' و ') : `«${ns[0]}» و ${ns.length - 1} بخش دیگر`);
  const lost = [...lostBy.values()], gained = [...gainBy.values()];
  const sentences = [
    ...lost.map((l) => `${TYPE_WORD[l.object.type]} «${l.object.title}» دیگر به ${where(l.nodes)} نمی‌رسد${mode === 'archive' && inBranch.has(l.object.nodeId) ? ' (بایگانی می‌شود)' : ''}.`),
    ...gained.map((g) => `${TYPE_WORD[g.object.type]} «${g.object.title}» حالا به ${where(g.nodes)} هم می‌رسد.`),
  ];
  return {
    ok: true, mode, ...(target ? { target } : {}), removed, tree: preview,
    counts: { ...direct, archived: archivedCount, branchNodes: branch.length, ...(mode === 'archive' ? { objects: branchObjects.length, notes: notesFiles.notes, thoughts: notesFiles.thoughts, files: notesFiles.files } : {}) },
    effect: { lost, gained, sentences },
  };
}

// ───────────────────────── permanent delete: the words to look for ─────────────────────────

const DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
/** the same text however it was typed: Persian / Arabic digits, ZWNJ, ك/ي, spacing */
export const normalizeForMatch = (s: string): string => s
  .replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d).replace(/ك/g, 'ک').replace(/ي/g, 'ی').replace(/[‌‍‎‏]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * what a piece of knowledge «says»: each long line, its title, and every long run of digits in it (a card number, a phone, an id —
 * the thing a person pastes by mistake — is found in a note even when the sentence around it is different). Short bits are too
 * common to mean anything. Digit needles start with `#` and are compared without spaces and dashes.
 */
export function needlesOf(o: Pick<ContextObject, 'title' | 'content' | 'examples'>): string[] {
  const all = [o.title, ...o.content.split(/\r?\n/), ...(o.examples ?? []).flatMap((e) => [e.text])].map(normalizeForMatch);
  const lines = all.filter((p) => p.length >= 8 || (p === normalizeForMatch(o.title) && p.length >= 6));
  const runs = all.flatMap((p) => p.match(/\d[\d\s-]{6,}\d/g) ?? []).map((r) => r.replace(/[\s-]/g, '')).filter((r) => r.length >= 8).map((r) => `#${r}`);
  return [...new Set([...lines, ...runs])];
}
export const containsAny = (text: string, needles: string[]): boolean => {
  const t = normalizeForMatch(text);
  const flat = t.replace(/[\s-]/g, '');
  return needles.some((n) => (n.startsWith('#') ? flat.includes(n.slice(1)) : t.includes(n)));
};

/** the lines of a text that say one of the needles are removed; every other line stays as typed */
export function scrubLines(content: string, needles: string[]): { content: string; removed: number } {
  const lines = content.split(/\r?\n/);
  const keep = lines.filter((l) => !containsAny(l, needles));
  return { content: keep.join('\n'), removed: lines.length - keep.length };
}
