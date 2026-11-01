/**
 * «چه چیزی عوض شد» — the last N days of Context changes, from the version history, and for every change the assets
 * it made stale (impactEngine). Pure: the server only supplies the version rows.
 */

import type { ContextObject, GeneratedDeliverable } from '../types';
import { computeStaleAssets } from './impactEngine';

export interface VersionRow { objectId: string; version: number; type: string; title: string; content: string; createdAt: string }

export type ChangeKind = 'created' | 'edited' | 'superseded' | 'archived';

export interface ChangeEvent {
  id: string;
  kind: ChangeKind;
  at: string;
  objectId: string;
  title: string;
  version: number;
  /** content before this change (edits only) */
  before?: string;
  after?: string;
  /** assets that are stale because of this object (current state, not a guess) */
  staleAssets: Array<{ id: string; title: string; message: string }>;
}

export const DEFAULT_DAYS = 7;
const DAY_MS = 86_400_000;

export function buildChangeFeed(input: {
  objects: ContextObject[];
  versions: VersionRow[];
  deliverables: GeneratedDeliverable[];
  now?: Date;
  days?: number;
}): ChangeEvent[] {
  const since = (input.now ?? new Date()).getTime() - (input.days ?? DEFAULT_DAYS) * DAY_MS;
  const inWindow = (iso: string) => new Date(iso).getTime() >= since;
  const byObject = new Map<string, VersionRow[]>();
  for (const v of input.versions) byObject.set(v.objectId, [...(byObject.get(v.objectId) ?? []), v]);
  const stale = computeStaleAssets(input.deliverables, input.objects);
  const titleOf = (id: string) => input.deliverables.find((d) => d.id === id)?.title ?? id;
  const staleFor = (objectId: string): ChangeEvent['staleAssets'] =>
    stale.flatMap((s) => s.reasons.filter((r) => r.objectId === objectId || r.currentId === objectId).map((r) => ({ id: s.deliverableId, title: titleOf(s.deliverableId), message: r.message })))
      .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);

  const events: ChangeEvent[] = [];
  for (const [objectId, rows] of byObject) {
    const sorted = [...rows].sort((a, b) => a.version - b.version);
    for (const row of sorted) {
      if (!inWindow(row.createdAt)) continue;
      const prev = sorted.find((r) => r.version === row.version - 1);
      events.push(row.version === 1
        ? { id: `${objectId}@${row.version}`, kind: 'created', at: row.createdAt, objectId, title: row.title, version: 1, after: row.content, staleAssets: [] }
        : { id: `${objectId}@${row.version}`, kind: 'edited', at: row.createdAt, objectId, title: row.title, version: row.version, before: prev?.content, after: row.content, staleAssets: staleFor(objectId) });
    }
  }
  for (const o of input.objects) {
    if (!inWindow(o.updatedAt)) continue;
    if (o.status === 'Superseded') events.push({ id: `${o.id}#superseded`, kind: 'superseded', at: o.updatedAt, objectId: o.id, title: o.title, version: o.version, staleAssets: staleFor(o.id) });
    if (o.status === 'Archived') events.push({ id: `${o.id}#archived`, kind: 'archived', at: o.updatedAt, objectId: o.id, title: o.title, version: o.version, staleAssets: staleFor(o.id) });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

export const KIND_FA: Record<ChangeKind, string> = { created: 'تازه ثبت شد', edited: 'ویرایش شد', superseded: 'جایگزین شد', archived: 'بایگانی شد' };

/** headline numbers for the summary line */
export const summarize = (events: ChangeEvent[]) => ({
  total: events.length,
  staleAssets: new Set(events.flatMap((e) => e.staleAssets.map((a) => a.id))).size,
});
