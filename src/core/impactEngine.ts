/**
 * Impact engine (decisions v3.1 §3): when a Context object changes, assets built from the old version become «stale».
 * Pure: input = assets (with usedContext = exact id+version injected) + current objects.
 */

import type { ContextObject, GeneratedDeliverable, UsedContextRef } from '../types';

export type StaleReasonKind = 'version_changed' | 'superseded' | 'archived' | 'removed';

export interface StaleReason {
  kind: StaleReasonKind;
  objectId: string;
  /** the object that is current now (for superseded: the head of the chain) */
  currentId?: string;
  title: string;
  usedVersion: number;
  currentVersion?: number;
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
    return { kind: 'removed', objectId: used.id, title: used.id, usedVersion: used.version, message: 'یکی از Contextهای استفاده‌شده دیگر وجود ندارد.' };
  }
  if (obj.status === 'Superseded') {
    const head = headOf(obj, byId);
    if (head.status === 'Archived') {
      return { kind: 'archived', objectId: obj.id, currentId: head.id, title: head.title, usedVersion: used.version, currentVersion: head.version, message: `«${head.title}» بایگانی شد.` };
    }
    if (head.id !== obj.id) {
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
  reasons.map((r) => `${r.objectId}>${r.currentId ?? r.objectId}@${r.currentVersion ?? 'x'}:${r.kind}`).sort().join('|');

export function staleReasonsOf(d: Pick<GeneratedDeliverable, 'usedContext'>, objects: ContextObject[]): StaleReason[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out: StaleReason[] = [];
  const seen = new Set<string>();
  for (const used of d.usedContext ?? []) {
    const r = reasonFor(used, byId);
    if (!r) continue;
    const key = `${r.objectId}:${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** The list of stale assets with the reason. Assets without lineage (usedContext empty) are never stale. */
export function computeStaleAssets(deliverables: Array<Pick<GeneratedDeliverable, 'id' | 'usedContext'>>, objects: ContextObject[]): StaleAsset[] {
  const out: StaleAsset[] = [];
  for (const d of deliverables) {
    const reasons = staleReasonsOf(d, objects);
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
