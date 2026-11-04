/**
 * «فضای فکر»: everything that is NOT truth yet, in one place — drawn from the data that already exists (nothing is stored
 * separately; approving is a status change, not a move):
 *   • waiting      : suggestions (Proposed), knowledge that needs a look (Needs Review) and unapproved rewrites of confirmed
 *                    knowledge (a draft) — «منتظر تصمیم تو»; this is a passage, not a place, so it lives here, on top
 *   • thoughts     : lines of notes that are an idea / question / assumption / open decision and have not become knowledge
 *   • assumptions  : confirmed working assumptions (they ARE approved and consumed, so they stay visible in the truth too)
 * Pure.
 */

import type { ContextObject, Note, TreeNode } from '../types';
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
  /** the unfiltered counts (the chips) */
  counts: Record<SpaceKind, number>;
}

const live = (o: ContextObject) => o.status !== 'Archived' && o.status !== 'Superseded' && !o.sample;

/** the three lists, filtered by kind and by node (a node's whole sub-tree) */
export function thinkingSpace(input: { objects: ContextObject[]; notes: Pick<Note, 'id' | 'nodeId' | 'content'>[]; nodes: TreeNode[] }, filter: SpaceFilter = {}): SpaceView {
  const { objects, notes, nodes } = input;
  const waitingAll: WaitingItem[] = [
    ...objects.filter((o) => live(o) && o.status === 'Proposed').map((o) => ({ type: 'proposal' as const, object: o })),
    ...objects.filter((o) => live(o) && o.status === 'Needs Review').map((o) => ({ type: 'review' as const, object: o })),
    ...objects.filter((o) => live(o) && o.status === 'Confirmed' && !!o.draft).map((o) => ({ type: 'draft' as const, object: o })),
  ];
  const thoughtsAll = thinkingOf(notes).filter((i) => !convertedTo(i, objects));
  const assumptionsAll = objects.filter((o) => live(o) && o.status === 'Confirmed' && o.assumption);
  const ids = filter.nodeId ? new Set(subtreeIds(nodes, filter.nodeId)) : null;
  const inNode = (id: string) => !ids || ids.has(id);
  // a thought is also in the view of every section / knowledge it names with @«…» (its «دربارهٔ»), not only its home
  const inScope = (t: NoteThinkingItem) => !ids || thoughtInScope(t, ids, objects, nodes);
  const k = filter.kind;
  return {
    waiting: !k || k === 'waiting' ? waitingAll.filter((w) => inNode(w.object.nodeId)) : [],
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
export function openThoughtCount(input: { objects: ContextObject[]; notes: Pick<Note, 'id' | 'nodeId' | 'content'>[] }, nodeId: string): number {
  const v = thinkingSpace({ ...input, nodes: [] });
  return v.waiting.filter((w) => w.object.nodeId === nodeId).length + v.thoughts.filter((t) => t.nodeId === nodeId).length;
}
