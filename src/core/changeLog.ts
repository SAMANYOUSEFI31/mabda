/**
 * Helpers for the Change log (docs/spine.md → Change). Pure.
 * A Change is append-only; its `reason` lives only here — never in an object's text and never in a model prompt.
 */

import type { ContextChange, ContextChangeActor, ContextChangeKind, ContextObject, ObjectSource } from '../types';

export const TRACKED_FIELDS = ['type', 'title', 'content', 'nodeId', 'slotKey', 'provenance', 'status', 'reach', 'validUntil'] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];
const CONTENT_FIELDS: TrackedField[] = ['type', 'title', 'content', 'reach', 'validUntil']; // where / how long an object applies changes what outputs see

/** only the fields that differ, as {before, after}; undefined when nothing differs */
export function diffFields(a: Partial<ContextObject>, b: Partial<ContextObject>, fields: readonly TrackedField[] = TRACKED_FIELDS): { before: Record<string, unknown>; after: Record<string, unknown> } | undefined {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const f of fields) {
    const x = a[f] ?? null;
    const y = b[f] ?? null;
    if (x !== y) { before[f] = x; after[f] = y; }
  }
  return Object.keys(after).length ? { before, after } : undefined;
}

/** the kind a status transition is recorded as */
export function statusChangeKind(from: ContextObject['status'], to: ContextObject['status']): ContextChangeKind {
  if (from === 'Proposed' && to === 'Confirmed') return 'proposal_accepted';
  if (from === 'Proposed' && to === 'Archived') return 'proposal_rejected';
  if (to === 'Archived') return 'archived';
  if (to === 'Superseded') return 'superseded';
  return 'status_changed';
}

const ACTOR_OF_SOURCE: Record<ObjectSource['kind'], ContextChangeActor> = {
  mcp: 'mcp', chat: 'chat', coach: 'coach', file: 'import', note: 'import', paste: 'import', asset: 'import', user: 'user',
};
/** who is behind an object that arrives with a `source` (no source = the user typed it) */
export function actorOfSource(source?: ObjectSource): { actor: ContextChangeActor; label?: string } {
  if (!source) return { actor: 'user' };
  return { actor: ACTOR_OF_SOURCE[source.kind] ?? 'system', ...(source.label ? { label: source.label } : {}) };
}

/** a change that altered what the object SAYS (not just where it lives or its status) */
export function isContentChange(c: Pick<ContextChange, 'kind' | 'after'>): boolean {
  if (c.kind === 'superseded' || c.kind === 'archived') return true;
  if (c.kind === 'contradiction_resolved') return (c.after as { status?: string } | undefined)?.status === 'Superseded' || !!c.after && CONTENT_FIELDS.some((f) => f in c.after!);
  if (c.kind === 'edited') return !!c.after && CONTENT_FIELDS.some((f) => f in c.after!);
  return false;
}

/** changes that count as «this object was looked at / written by someone» for the review baseline (linking its dependencies counts: the user just looked at it) */
export function isBaselineChange(c: Pick<ContextChange, 'kind' | 'after'>): boolean {
  return c.kind === 'created' || c.kind === 'imported' || c.kind === 'proposal_accepted' || c.kind === 'review_accepted' || (c.kind === 'edited' && (isContentChange(c) || (!!c.after && 'dependsOn' in c.after)));
}

const REASON_TAIL = /\n*\[دلیل جایگزینی: ([\s\S]*)\]\s*$/;
/**
 * Old versions of the app glued the replacement reason to the END of the object's text («[دلیل جایگزینی: …]»).
 * Splits it off: returns the clean text and the reason (undefined when there is none).
 */
export function splitSupersedeReason(content: string): { content: string; reason?: string } {
  const m = REASON_TAIL.exec(content);
  if (!m) return { content };
  return { content: content.slice(0, m.index), reason: m[1].trim() };
}

export const CHANGE_KIND_FA: Record<ContextChangeKind, string> = {
  created: 'ثبت شد', edited: 'ویرایش شد', status_changed: 'وضعیت عوض شد', superseded: 'جایگزین شد', archived: 'بایگانی شد',
  proposal_accepted: 'پیشنهاد تأیید شد', proposal_rejected: 'پیشنهاد رد شد', contradiction_resolved: 'تناقض حل شد', imported: 'وارد شد', review_accepted: 'بدون تغییر پذیرفته شد',
};
export const ACTOR_FA: Record<ContextChangeActor, string> = { user: 'خودت', mcp: 'AI بیرونی', chat: 'گفتگو', coach: 'مربی دانش', import: 'ورود', system: 'سامانه' };
