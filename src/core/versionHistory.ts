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
