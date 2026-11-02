/**
 * What to show next to an AI suggestion so the user can see an inconsistency herself (the inbox treats each suggestion as a
 * «proposed change»). Pure. Nothing here judges meaning: it only finds the existing objects the suggestion is about.
 *  • `replaces`: the live object it would edit/replace — same slot, or same node + same type + the same title
 *  • `related`:  other live objects in the same slot, or in the same node with a close title (up to 3)
 */

import type { ContextObject } from '../types';
import { titleSimilarity } from './textDiff';

const live = (o: ContextObject) => o.status === 'Confirmed' || o.status === 'Needs Review';
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export interface ProposalContext { replaces?: ContextObject; related: ContextObject[] }

export function proposalContext(proposal: ContextObject, objects: ContextObject[], maxRelated = 3): ProposalContext {
  const others = objects.filter((o) => o.id !== proposal.id && live(o));
  const sameSlot = proposal.slotKey ? others.filter((o) => o.slotKey === proposal.slotKey) : [];
  const sameTitle = others.filter((o) => o.nodeId === proposal.nodeId && o.type === proposal.type && norm(o.title) === norm(proposal.title));
  const replaces = sameSlot[0] ?? sameTitle[0];
  const scored = others
    .filter((o) => o.id !== replaces?.id && o.nodeId === proposal.nodeId)
    .map((o) => ({ o, score: titleSimilarity(o.title, proposal.title) }))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score || a.o.id.localeCompare(b.o.id))
    .map((x) => x.o);
  const related = [...sameSlot.filter((o) => o.id !== replaces?.id), ...scored].filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i).slice(0, maxRelated);
  return { ...(replaces ? { replaces } : {}), related };
}
