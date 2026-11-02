/**
 * Impact engine (decisions v3.1 §3): when a Context object changes, assets built from the old version become «stale».
 * Pure: input = assets (with usedContext = exact id+version injected) + current objects.
 */

import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, UsedContextRef } from '../types';
import { needsReview } from './decisionGraph';
import type { ReviewNeed } from './decisionGraph';

export type StaleReasonKind = 'version_changed' | 'superseded' | 'archived' | 'removed' | 'dependency_changed';

export interface StaleReason {
  kind: StaleReasonKind;
  objectId: string;
  /** the object that is current now (for superseded: the head of the chain) */
  currentId?: string;
  title: string;
  usedVersion: number;
  currentVersion?: number;
  /** dependency_changed: the object it rests on that changed (and when) */
  dependencyId?: string;
  changedAt?: string;
  /** Persian, ready for the UI */
  message: string;
}

export interface StaleAsset {
  deliverableId: string;
  reasons: StaleReason[];
  /** changes whenever the set of reasons changes — the one-time half-price rebuild is tied to it */
  signature: string;
}

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);

/** follow supersededById to the newest object (cycle-safe) */
function headOf(start: ContextObject, byId: Map<string, ContextObject>): ContextObject {
  let cur = start;
  const seen = new Set<string>();
  while (cur.supersededById && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = byId.get(cur.supersededById);
    if (!next) break;
    cur = next;
  }
  return cur;
}

export function reasonFor(used: UsedContextRef, byId: Map<string, ContextObject>): StaleReason | null {
  const obj = byId.get(used.id);
  if (!obj) {
    return { kind: 'removed', objectId: used.id, title: used.id, usedVersion: used.version, message: 'یکی از دانش‌های استفاده‌شده دیگر وجود ندارد.' };
  }
  if (obj.status === 'Superseded') {
    const head = headOf(obj, byId);
    if (head.status === 'Archived') {
      return { kind: 'archived', objectId: obj.id, currentId: head.id, title: head.title, usedVersion: used.version, currentVersion: head.version, message: `«${head.title}» بایگانی شد.` };
    }
    if (head.id !== obj.id) {
      // «keep this one» resolutions supersede an object with an existing one, whose version need not be higher
      if (head.version <= used.version) {
        return { kind: 'superseded', objectId: obj.id, currentId: head.id, title: head.title, usedVersion: used.version, currentVersion: head.version, message: `«${obj.title}» با «${head.title}» جایگزین شد.` };
      }
      return {
        kind: 'superseded', objectId: obj.id, currentId: head.id, title: head.title, usedVersion: used.version, currentVersion: head.version,
        message: `«${head.title}» از نسخهٔ ${fa(used.version)} به ${fa(head.version)} تغییر کرد.`,
      };
    }
  }
  if (obj.status === 'Archived') {
    return { kind: 'archived', objectId: obj.id, title: obj.title, usedVersion: used.version, currentVersion: obj.version, message: `«${obj.title}» بایگانی شد.` };
  }
  if (obj.version > used.version) {
    return {
      kind: 'version_changed', objectId: obj.id, title: obj.title, usedVersion: used.version, currentVersion: obj.version,
      message: `«${obj.title}» از نسخهٔ ${fa(used.version)} به ${fa(obj.version)} تغییر کرد.`,
    };
  }
  return null;
}

export const staleSignature = (reasons: StaleReason[]): string =>
  reasons.map((r) => `${r.objectId}>${r.currentId ?? r.objectId}@${r.currentVersion ?? 'x'}:${r.kind}${r.dependencyId ? `~${r.dependencyId}@${r.changedAt ?? ''}` : ''}`).sort().join('|');

/** an object the asset used rests on another object that changed since — and nobody has reviewed it (derived, see decisionGraph.needsReview) */
function dependencyReason(used: UsedContextRef, byId: Map<string, ContextObject>, review: Map<string, ReviewNeed>, builtAt?: string): StaleReason | null {
  const need = review.get(used.id);
  const obj = byId.get(used.id);
  if (!need || !obj) return null;
  // a rebuild reads the Context again: only changes AFTER the asset was built make it stale
  const fresh = need.changedDependencies.filter((c) => !builtAt || c.at > builtAt);
  if (!fresh.length) return null;
  const last = fresh[fresh.length - 1];
  const dep = byId.get(last.id);
  const depTitle = dep ? (dep.supersededById ? byId.get(dep.supersededById)?.title ?? dep.title : dep.title) : last.id;
  return {
    kind: 'dependency_changed', objectId: obj.id, title: obj.title, usedVersion: used.version, currentVersion: obj.version, dependencyId: last.id, changedAt: last.at,
    message: `«${obj.title}» به «${depTitle}» وابسته است و «${depTitle}» تغییر کرده؛ هنوز بازبینی نشده.`,
  };
}

export function staleReasonsOf(d: Pick<GeneratedDeliverable, 'usedContext'> & { createdAt?: string }, objects: ContextObject[], review?: Map<string, ReviewNeed>): StaleReason[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out: StaleReason[] = [];
  const seen = new Set<string>();
  for (const used of d.usedContext ?? []) {
    const r = reasonFor(used, byId) ?? (review ? dependencyReason(used, byId, review, d.createdAt) : null);
    if (!r) continue;
    const key = `${r.objectId}:${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** The list of stale assets with the reason. Assets without lineage (usedContext empty) are never stale. */
export function computeStaleAssets(
  deliverables: Array<Pick<GeneratedDeliverable, 'id' | 'usedContext'> & { createdAt?: string }>,
  objects: ContextObject[],
  /** with the `depends_on` relations and the change log, an asset also goes stale when a decision it rests on changed (`dependency_changed`) */
  graph?: { relationships: ContextRelationship[]; changes: ContextChange[] },
): StaleAsset[] {
  const review = graph ? needsReview(objects, graph.relationships, graph.changes) : undefined;
  const out: StaleAsset[] = [];
  for (const d of deliverables) {
    const reasons = staleReasonsOf(d, objects, review);
    if (reasons.length) out.push({ deliverableId: d.id, reasons, signature: staleSignature(reasons) });
  }
  return out;
}

/** assets that are stale after a change but were not before — the «این تغییر روی N دارایی اثر دارد» number */
export function newlyStale(before: StaleAsset[], after: StaleAsset[]): StaleAsset[] {
  const was = new Map(before.map((s) => [s.deliverableId, s.signature]));
  return after.filter((s) => was.get(s.deliverableId) !== s.signature);
}

/** The half-price rebuild is allowed once per distinct change set. */
export function halfPriceRebuildAvailable(d: Pick<GeneratedDeliverable, 'halfPriceUsedFor'>, stale: StaleAsset | undefined): boolean {
  return !!stale && d.halfPriceUsedFor !== stale.signature;
}

/** Sentence for the toast after a change. Empty when nothing is affected. */
export function impactMessage(count: number): string {
  return count > 0 ? `این تغییر روی ${fa(count)} دارایی اثر دارد.` : '';
}
