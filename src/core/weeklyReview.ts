/**
 * The weekly review («این هفته», ~5 minutes): three sections in a fixed order — what changed, what needs a review, which
 * decisions wait — each with one-click actions in the UI. Pure: it only gathers what the other engines already derive.
 * Nothing here notifies anyone; `reviewDue` only drives a quiet marker in the attention panel.
 */

import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode, WorkstreamSpec } from '../types';
import { orderWaitingByStructure } from './decisionOrder';
import { buildChangeDigest, DEFAULT_DAYS } from './changeDigest';
import type { Digest } from './changeDigest';
import { calculateReadinessAndGaps } from './contextEngine';
import { needsReview, planDecisions, waitingDecisions } from './decisionGraph';
import type { ReviewNeed, WaitingDecisions } from './decisionGraph';
import { assumptionsDue, decisionsDue } from './assumptions';
import { addDays, daysBetween, tehranDay, tehranDayStart } from './tehranDate';
import { formatNumber } from '../ui/format';


export interface WeeklyReviewData {
  digest: Digest;
  /** objects whose dependency changed after they were last written or reviewed */
  reviews: Array<{ object: ContextObject; need: ReviewNeed; dependencyTitles: string[] }>;
  waiting: WaitingDecisions;
  /** decision id → how many waiting decisions of its sub-sections follow it (only when the tree is given; display order only) */
  structure: Record<string, number>;
  /** assumptions whose review date has come, and decisions that ask «نتیجه چه شد؟» */
  due: { assumptions: ContextObject[]; decisions: ContextObject[] };
  /** how many items the three sections hold in total (what the review is about) */
  total: number;
}

/**
 * where «what changed» starts: the last review itself (nothing seen in it comes back, nothing after it is missed), or, before
 * the first review, the start of the Tehran day a week ago (calendar days, not a sliding 7×24 h window)
 */
export function reviewWindowStart(lastAt: string | null | undefined, now: Date = new Date()): string {
  return lastAt ?? tehranDayStart(addDays(tehranDay(now), -DEFAULT_DAYS));
}

export function buildWeeklyReview(input: { objects: ContextObject[]; relationships: ContextRelationship[]; changes: ContextChange[]; deliverables: GeneratedDeliverable[]; now?: Date; nodes?: TreeNode[]; lastReviewAt?: string | null }): WeeklyReviewData {
  const digest = buildChangeDigest({ changes: input.changes, objects: input.objects, relationships: input.relationships, deliverables: input.deliverables, nodes: input.nodes, now: input.now, days: DEFAULT_DAYS, since: reviewWindowStart(input.lastReviewAt, input.now ?? new Date()) });
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const reviews = [...needsReview(input.objects, input.relationships, input.changes)]
    .filter(([id]) => byId.has(id))
    .map(([id, need]) => ({ object: byId.get(id)!, need, dependencyTitles: need.changedDependencies.map((d) => byId.get(d.id)?.title ?? d.id) }))
    .sort((a, b) => b.need.since.localeCompare(a.need.since) || a.object.id.localeCompare(b.object.id));
  const plan = planDecisions(input.objects, input.relationships);
  const ordered = input.nodes ? orderWaitingByStructure(waitingDecisions(plan), plan, input.objects, input.nodes) : undefined;
  const waiting = ordered?.waiting ?? waitingDecisions(plan);
  const structure = Object.fromEntries([...(ordered?.below ?? [])].map(([id, b]) => [id, b.length]));
  const now = input.now ?? new Date();
  const due = { assumptions: assumptionsDue(input.objects, now), decisions: decisionsDue(input.objects, input.changes, now) };
  return { digest, reviews, waiting, structure, due, total: digest.total + reviews.length + waiting.ready.length + waiting.blocked.length + waiting.concurrent.length + due.assumptions.length + due.decisions.length };
}

/**
 * a quiet «it is time» marker: a week since the last review (or never) AND something to look at. A week is counted in Tehran
 * calendar days (Saturday 23:30 → the next Saturday morning is a week), not in milliseconds.
 */
export function reviewDue(lastAt: string | null | undefined, data: Pick<WeeklyReviewData, 'total'>, now: Date = new Date()): boolean {
  if (data.total === 0) return false;
  if (!lastAt) return true;
  return daysBetween(tehranDay(lastAt), tehranDay(now)) >= DEFAULT_DAYS;
}

export interface WorkstreamReadiness { specId: string; title: string; score: number; status: 'ready' | 'needs_work' | 'blocked'; missing: number }

/** «آمادگی برای هر جریان کار» — the deterministic readiness of every workstream (never a model's opinion) */
export function readinessPerWorkstream(specs: WorkstreamSpec[], objects: ContextObject[], relationships: ContextRelationship[]): WorkstreamReadiness[] {
  return specs.map((s) => {
    const r = calculateReadinessAndGaps(s, objects, relationships);
    return { specId: s.id, title: s.title, score: r.score, status: r.status, missing: r.gaps.filter((g) => g.importance === 'required').length };
  });
}

/** how many outputs were built from this object (any version) — «چون این را تأیید کردی، N خروجی از آن استفاده می‌کنند» */
export function outputsUsing(objectId: string, deliverables: Array<Pick<GeneratedDeliverable, 'usedContext'>>): number {
  return deliverables.filter((d) => (d.usedContext ?? []).some((u) => u.id === objectId)).length;
}

/** the sentence that closes an acceptance; empty when no output uses the object */
export function acceptanceSentence(title: string, uses: number, fa: (n: number) => string): string {
  return uses > 0 ? `چون «${title}» را تأیید کردی، ${fa(uses)} خروجی تو از آن استفاده می‌کنند.` : '';
}

/**
 * The summary line of «این هفته»: everything she did in it counts, not only accepting and confirming (a due item she answered and a
 * number she recorded are changes too; before, a review of only those said «چیزی را تغییر ندادی»).
 */
export function weeklySummaryText(done: { accepted: number; due: number; numbers: number; outputs: number }): string {
  const parts = [
    done.accepted ? `${formatNumber(done.accepted)} مورد را پذیرفتی یا تأیید کردی` : '',
    done.due ? `به ${formatNumber(done.due)} سررسید جواب دادی` : '',
    done.numbers ? `${formatNumber(done.numbers)} عدد ثبت کردی` : '',
  ].filter(Boolean);
  if (!parts.length) return 'این هفته چیزی را تغییر ندادی؛ هرچه دیدی همان‌طور که بود ماند.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join('، ')} و ${parts[parts.length - 1]}` : parts[0];
  return `در این بازبینی ${list}.${done.accepted && done.outputs ? ` چون این موارد را تأیید کردی، ${formatNumber(done.outputs)} خروجی تو از آن‌ها استفاده می‌کنند.` : ''}`;
}
