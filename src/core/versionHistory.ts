/**
 * The history of ONE object as a path, not a pile of rows: draft edits are grouped and closed by the approval that ended
 * them («۳ پیش‌نویس» → «تأیید شد در نسخهٔ ۳»). The version counter itself does not change (every content edit is still +1:
 * that is the trace Context Replay and the impact engine read); this only decides how the Change records are SHOWN.
 *
 *  • milestone = the object became (or, while Confirmed, was edited as) confirmed knowledge at version N
 *  • draft     = a version made while the object was not Confirmed (Proposed, Needs Review, …); the creation counts as the first
 *  • event     = everything else (moved, superseded, archived, review accepted, outcome noted …), one quiet row each
 * A reason belongs to a confirmed edit (it is the only edit anything consumes); draft edits carry none (`reasonAllowed`).
 * Pure.
 */

import type { ContextChange, ContextObject } from '../types';

type Ch = ContextChange;

export type HistoryEntry =
  | { type: 'milestone'; id: string; version: number; at: string; how: 'created' | 'accepted' | 'status' | 'edited'; reason?: string; actor: Ch['actor']; actorLabel?: string; changes: Ch[] }
  | { type: 'drafts'; id: string; count: number; fromVersion: number; toVersion: number; at: string; until: string; changes: Ch[] }
  | { type: 'event'; id: string; at: string; change: Ch };

export interface ApprovalInfo { version: number; at: string; how: 'created' | 'accepted' | 'status' | 'edited' }

export interface VersionHistory {
  /** oldest first */
  entries: HistoryEntry[];
  /** the latest milestone, if the object was ever approved */
  lastApproval?: ApprovalInfo;
  /** drafts made after the last approval (the object is being rewritten, or was never approved) */
  draftsSinceApproval: number;
  /** status the record ends in (from the replay, not from the object) */
  status?: string;
}

const statusOf = (c: Ch): string | undefined => {
  const s = (c.after as { status?: unknown } | undefined)?.status;
  return typeof s === 'string' ? s : undefined;
};
/** the version number moved: the text (or type, reach, validity, record) changed */
const bumped = (c: Ch) => c.toVersion > c.fromVersion;

/** whether a reason may be written for an edit of an object in this status: only for confirmed knowledge, never for a draft */
export const reasonAllowed = (status: ContextObject['status'] | undefined): boolean => status === 'Confirmed';

export function versionHistory(changes: Ch[]): VersionHistory {
  const sorted = changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.at.localeCompare(b.c.at) || a.c.toVersion - b.c.toVersion || a.i - b.i)
    .map((x) => x.c);
  const entries: HistoryEntry[] = [];
  let status: string | undefined;
  let drafts: Ch[] = [];
  let last: ApprovalInfo | undefined;
  let draftsAfter = 0;

  const closeDrafts = () => {
    if (!drafts.length) return;
    entries.push({ type: 'drafts', id: `d:${drafts[0].id}`, count: drafts.length, fromVersion: drafts[0].toVersion, toVersion: drafts[drafts.length - 1].toVersion, at: drafts[0].at, until: drafts[drafts.length - 1].at, changes: drafts });
    drafts = [];
  };
  const milestone = (c: Ch, how: ApprovalInfo['how'], version: number) => {
    closeDrafts();
    entries.push({ type: 'milestone', id: `m:${c.id}`, version, at: c.at, how, ...(c.reason ? { reason: c.reason } : {}), actor: c.actor, ...(c.actorLabel ? { actorLabel: c.actorLabel } : {}), changes: [c] });
    last = { version, at: c.at, how };
    draftsAfter = 0;
  };

  for (const c of sorted) {
    const next = statusOf(c);
    if (c.kind === 'created' || c.kind === 'imported') {
      status = next ?? status;
      if (status === 'Confirmed') milestone(c, 'created', c.toVersion);
      else { drafts.push(c); draftsAfter++; }
      continue;
    }
    if (next && next !== status && (c.kind === 'proposal_accepted' || c.kind === 'status_changed' || c.kind === 'proposal_rejected' || c.kind === 'archived' || c.kind === 'superseded' || c.kind === 'contradiction_resolved')) {
      const was = status;
      status = next;
      if (next === 'Confirmed' && was !== 'Confirmed') milestone(c, c.kind === 'proposal_accepted' ? 'accepted' : 'status', c.toVersion);
      else { closeDrafts(); entries.push({ type: 'event', id: `e:${c.id}`, at: c.at, change: c }); }
      continue;
    }
    if (c.kind === 'edited' && bumped(c)) {
      if (status === 'Confirmed') milestone(c, 'edited', c.toVersion);
      else { drafts.push(c); draftsAfter++; }
      continue;
    }
    // moved, linked, ranked, review accepted, outcome noted …: a quiet row (it does not break a run of drafts)
    entries.push({ type: 'event', id: `e:${c.id}`, at: c.at, change: c });
  }
  closeDrafts();
  // a quiet row may have been pushed between drafts: keep time order
  entries.sort((a, b) => a.at.localeCompare(b.at));
  return { entries, ...(last ? { lastApproval: last } : {}), draftsSinceApproval: draftsAfter, ...(status ? { status } : {}) };
}

/** newest first, for display */
export const newestFirst = (h: VersionHistory): HistoryEntry[] => [...h.entries].reverse();

export const MILESTONE_FA: Record<ApprovalInfo['how'], string> = { created: 'ثبت و تأیید شد', accepted: 'تأیید شد', status: 'تأیید شد', edited: 'ویرایش تأییدشده' };
export const milestoneLabel = (e: Extract<HistoryEntry, { type: 'milestone' }>, fa: (n: number) => string): string =>
  e.how === 'edited' ? `ویرایش تأییدشده → نسخهٔ ${fa(e.version)}` : e.how === 'created' ? `ثبت و تأیید شد در نسخهٔ ${fa(e.version)}` : `تأیید شد در نسخهٔ ${fa(e.version)}`;
export const draftsLabel = (e: Extract<HistoryEntry, { type: 'drafts' }>, fa: (n: number) => string): string => `${fa(e.count)} پیش‌نویس`;

/** the last approval of every object, from one change list (records of metrics and nodes are not objects and are skipped) */
export function approvalsOf(changes: Ch[]): Record<string, ApprovalInfo> {
  const by = new Map<string, Ch[]>();
  for (const c of changes) {
    if (c.objectId.startsWith('metric:') || c.objectId.startsWith('node:')) continue;
    by.set(c.objectId, [...(by.get(c.objectId) ?? []), c]);
  }
  const out: Record<string, ApprovalInfo> = {};
  for (const [id, list] of by) { const a = versionHistory(list).lastApproval; if (a) out[id] = a; }
  return out;
}

export interface VersionText { version: number; title: string; content: string; at: string }

/**
 * The text of every version of ONE object, rebuilt from its Change records (each edit carries the before and after of the
 * title and the text), oldest first. Only versions whose text is known are listed; used by «مقایسهٔ دو نسخه» and by the
 * outputs' «what changed since you were built». Pure.
 */
export function versionTexts(changes: Ch[]): VersionText[] {
  const sorted = [...changes].sort((a, b) => a.at.localeCompare(b.at) || a.toVersion - b.toVersion);
  const out = new Map<number, VersionText>();
  let title = '', content = '';
  const put = (version: number, at: string) => { if (title || content) out.set(version, { version, title, content, at }); };
  for (const c of sorted) {
    const b = c.before as { title?: unknown; content?: unknown } | undefined;
    const a = c.after as { title?: unknown; content?: unknown } | undefined;
    if (c.kind === 'created' || c.kind === 'imported') {
      if (typeof a?.title === 'string') title = a.title;
      if (typeof a?.content === 'string') content = a.content;
      put(c.toVersion, c.at);
      continue;
    }
    if (!bumped(c)) continue;
    // an edit: what it started from (when nothing earlier is known) and what it produced
    if (!out.has(c.fromVersion)) {
      if (typeof b?.title === 'string') title = b.title;
      if (typeof b?.content === 'string') content = b.content;
      put(c.fromVersion, c.at);
    }
    if (typeof a?.title === 'string') title = a.title;
    if (typeof a?.content === 'string') content = a.content;
    put(c.toVersion, c.at);
  }
  return [...out.values()].sort((x, y) => x.version - y.version);
}
