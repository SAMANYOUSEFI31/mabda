/**
 * «چه چیزی عوض شد» — the last N days of the Change log, grouped by WHO did it, and for every change the outputs that now
 * need a review (impactEngine, the current state — not a guess). Pure: the server only supplies the log.
 */

import type { ContextChange, ContextChangeActor, ContextObject, ContextRelationship, GeneratedDeliverable } from '../types';
import { isContentChange } from './changeLog';
import { computeStaleAssets } from './impactEngine';

export const DEFAULT_DAYS = 7;
const DAY_MS = 86_400_000;

export interface DigestEntry {
  change: ContextChange;
  title: string;
  /** outputs that need a review because of THIS object (empty for changes that say nothing new, e.g. a move) */
  reviewAssets: Array<{ id: string; title: string; message: string }>;
}
export interface DigestGroup {
  key: string;
  actor: ContextChangeActor;
  label?: string;
  entries: DigestEntry[];
}
export interface Digest { groups: DigestGroup[]; total: number; assetsToReview: number }

export function buildChangeDigest(input: {
  changes: ContextChange[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  now?: Date;
  days?: number;
}): Digest {
  const since = new Date((input.now ?? new Date()).getTime() - (input.days ?? DEFAULT_DAYS) * DAY_MS).toISOString();
  const titleOf = new Map(input.objects.map((o) => [o.id, o.title]));
  const stale = computeStaleAssets(input.deliverables, input.objects, { relationships: input.relationships, changes: input.changes });
  const dTitle = new Map(input.deliverables.map((d) => [d.id, d.title]));
  const assetsFor = (objectId: string): DigestEntry['reviewAssets'] =>
    stale.flatMap((s) => s.reasons.filter((r) => r.objectId === objectId || r.currentId === objectId || r.dependencyId === objectId).map((r) => ({ id: s.deliverableId, title: dTitle.get(s.deliverableId) ?? s.deliverableId, message: r.message })))
      .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);

  const groups = new Map<string, DigestGroup>();
  let total = 0;
  const seenAssets = new Set<string>();
  for (const c of input.changes.filter((x) => x.at >= since).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))) {
    const key = `${c.actor}:${c.actorLabel ?? ''}`;
    const g = groups.get(key) ?? { key, actor: c.actor, ...(c.actorLabel ? { label: c.actorLabel } : {}), entries: [] };
    const reviewAssets = isContentChange(c) ? assetsFor(c.objectId) : [];
    reviewAssets.forEach((a) => seenAssets.add(a.id));
    g.entries.push({ change: c, title: titleOf.get(c.objectId) ?? c.objectId, reviewAssets });
    groups.set(key, g);
    total++;
  }
  // people first, then AIs/imports by size
  const rank: Record<ContextChangeActor, number> = { user: 0, mcp: 1, chat: 2, coach: 3, import: 4, system: 5 };
  return { groups: [...groups.values()].sort((a, b) => rank[a.actor] - rank[b.actor] || b.entries.length - a.entries.length), total, assetsToReview: seenAssets.size };
}
