/**
 * «فضای فکر»: everything that is NOT truth yet, in one place — persisted Thoughts plus the existing proposal/review records:
 *   • waiting      : suggestions (Proposed), knowledge that needs a look (Needs Review) and unapproved rewrites of confirmed
 *                    knowledge (a draft) — «منتظر تصمیم تو»; this is a passage, not a place, so it lives here, on top
 *   • thoughts     : open Thoughts that have not become Knowledge
 *   • assumptions  : confirmed working assumptions (they ARE approved and consumed, so they stay visible in the truth too)
 * Pure.
 */

import type { ContextObject, ContextRelationship, Note, TreeNode } from '../types';
import { planDecisions } from './decisionGraph';
import { layerIndex, orderByStructure } from './decisionOrder';
import { subtreeIds } from './nodeTree';
import { thoughtInScope } from './thoughtAbout';
import { convertedTo, thinkingOf } from './thinkingMarkers';
import type { NoteThinkingItem, ThinkingKind } from './thinkingMarkers';

export type SpaceKind = ThinkingKind | 'waiting';
export interface SpaceFilter { kind?: SpaceKind; nodeId?: string }
export interface WaitingItem { type: 'proposal' | 'review' | 'draft'; object: ContextObject }
export interface SpaceView {
  waiting: WaitingItem[];
  thoughts: NoteThinkingItem[];
  assumptions: ContextObject[];
  /** waiting item id → how many waiting items of its sub-sections come after it (the «اول این را روشن کن» line; display order only) */
  structure: Record<string, number>;
  /** the unfiltered counts (the chips) */
  counts: Record<SpaceKind, number>;
}

const live = (o: ContextObject) => o.status !== 'Archived' && o.status !== 'Superseded' && !o.sample;

/** the three lists, filtered by kind and by node (a node's whole sub-tree) */
export function thinkingSpace(input: { objects: ContextObject[]; notes: Pick<Note, 'id' | 'nodeId' | 'content'>[]; thoughts?: NoteThinkingItem[]; nodes: TreeNode[]; relationships?: ContextRelationship[] }, filter: SpaceFilter = {}): SpaceView {
  const { objects, notes, nodes } = input;
  const waitingAll: WaitingItem[] = [
    ...objects.filter((o) => live(o) && o.status === 'Proposed').map((o) => ({ type: 'proposal' as const, object: o })),
    ...objects.filter((o) => live(o) && o.status === 'Needs Review').map((o) => ({ type: 'review' as const, object: o })),
    ...objects.filter((o) => live(o) && o.status === 'Confirmed' && !!o.draft).map((o) => ({ type: 'draft' as const, object: o })),
  ];
  const thoughtsAll = (input.thoughts ?? thinkingOf(notes)).filter((i) => i.status !== 'resolved' && !convertedTo(i, objects));
  const assumptionsAll = objects.filter((o) => live(o) && o.status === 'Confirmed' && o.assumption);
  const ids = filter.nodeId ? new Set(subtreeIds(nodes, filter.nodeId)) : null;
  const inNode = (id: string) => !ids || ids.has(id);
  // a thought is also in the view of every section / knowledge it names with @«…» (its «دربارهٔ»), not only its home
  const inScope = (t: NoteThinkingItem) => !ids || thoughtInScope(t, ids, objects, nodes);
  const k = filter.kind;
  // the order of «منتظر تصمیم تو»: the upper section's item before its sub-sections' (ties only; depends_on layers come first)
  const layers = layerIndex(planDecisions(objects, input.relationships ?? []));
  const structure: Record<string, number> = {};
  const orderWaiting = (items: WaitingItem[]): WaitingItem[] => {
    const r = orderByStructure(items, { idOf: (w) => w.object.id, objectOf: (w) => w.object, nodes, layers });
    for (const [id, below] of r.below) structure[id] = below.length;
    return r.items;
  };
  const waitingShown = !k || k === 'waiting' ? waitingAll.filter((w) => inNode(w.object.nodeId)) : [];
  const newest = (w: WaitingItem) => w.object.source?.at ?? w.object.createdAt;
  const waitingOrdered = (['proposal', 'review', 'draft'] as const).flatMap((t) => orderWaiting(waitingShown.filter((w) => w.type === t).sort(t === 'proposal' ? (a, b) => newest(b).localeCompare(newest(a)) : () => 0)));
  return {
    structure,
    waiting: waitingOrdered,
    thoughts: !k || (k !== 'waiting' && k !== 'assumption') ? thoughtsAll.filter((t) => inScope(t) && (!k || t.kind === k)) : k === 'assumption' ? thoughtsAll.filter((t) => inScope(t) && t.kind === 'assumption') : [],
    assumptions: !k || k === 'assumption' ? assumptionsAll.filter((o) => inNode(o.nodeId)) : [],
    counts: {
      waiting: waitingAll.length,
      idea: thoughtsAll.filter((t) => t.kind === 'idea').length,
      question: thoughtsAll.filter((t) => t.kind === 'question').length,
      assumption: thoughtsAll.filter((t) => t.kind === 'assumption').length + assumptionsAll.length,
      open_decision: thoughtsAll.filter((t) => t.kind === 'open_decision').length,
    },
  };
}

/** «۳ فکر باز» on a node: open thoughts + what waits for approval, in THAT node (not its children — they have their own) */
export function openThoughtCount(input: { objects: ContextObject[]; notes: Pick<Note, 'id' | 'nodeId' | 'content'>[]; thoughts?: NoteThinkingItem[] }, nodeId: string): number {
  const v = thinkingSpace({ ...input, nodes: [] });
  return v.waiting.filter((w) => w.object.nodeId === nodeId).length + v.thoughts.filter((t) => t.nodeId === nodeId).length;
}
