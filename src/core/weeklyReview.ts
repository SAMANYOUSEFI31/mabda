/**
 * The weekly review («این هفته», ~5 minutes): three sections in a fixed order — what changed, what needs a review, which
 * decisions wait — each with one-click actions in the UI. Pure: it only gathers what the other engines already derive.
 * Nothing here notifies anyone; `reviewDue` only drives a quiet marker in the attention panel.
 */

import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, WorkstreamSpec } from '../types';
import { buildChangeDigest, DEFAULT_DAYS } from './changeDigest';
import type { Digest } from './changeDigest';
import { calculateReadinessAndGaps } from './contextEngine';
import { needsReview, planDecisions, waitingDecisions } from './decisionGraph';
import type { ReviewNeed, WaitingDecisions } from './decisionGraph';
import { assumptionsDue, decisionsDue } from './assumptions';

const DAY_MS = 86_400_000;

export interface WeeklyReviewData {
  digest: Digest;
  /** objects whose dependency changed after they were last written or reviewed */
  reviews: Array<{ object: ContextObject; need: ReviewNeed; dependencyTitles: string[] }>;
  waiting: WaitingDecisions;
  /** assumptions whose review date has come, and decisions that ask «نتیجه چه شد؟» */
  due: { assumptions: ContextObject[]; decisions: ContextObject[] };
  /** how many items the three sections hold in total (what the review is about) */
  total: number;
}

export function buildWeeklyReview(input: { objects: ContextObject[]; relationships: ContextRelationship[]; changes: ContextChange[]; deliverables: GeneratedDeliverable[]; now?: Date }): WeeklyReviewData {
  const digest = buildChangeDigest({ changes: input.changes, objects: input.objects, relationships: input.relationships, deliverables: input.deliverables, now: input.now, days: DEFAULT_DAYS });
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const reviews = [...needsReview(input.objects, input.relationships, input.changes)]
    .filter(([id]) => byId.has(id))
    .map(([id, need]) => ({ object: byId.get(id)!, need, dependencyTitles: need.changedDependencies.map((d) => byId.get(d.id)?.title ?? d.id) }))
    .sort((a, b) => b.need.since.localeCompare(a.need.since) || a.object.id.localeCompare(b.object.id));
  const waiting = waitingDecisions(planDecisions(input.objects, input.relationships));
  const now = input.now ?? new Date();
  const due = { assumptions: assumptionsDue(input.objects, now), decisions: decisionsDue(input.objects, input.changes, now) };
  return { digest, reviews, waiting, due, total: digest.total + reviews.length + waiting.ready.length + waiting.blocked.length + waiting.concurrent.length + due.assumptions.length + due.decisions.length };
}

/** a quiet «it is time» marker: a week since the last review (or never) AND something to look at */
export function reviewDue(lastAt: string | null | undefined, data: Pick<WeeklyReviewData, 'total'>, now: Date = new Date()): boolean {
  if (data.total === 0) return false;
  if (!lastAt) return true;
  return now.getTime() - new Date(lastAt).getTime() >= DEFAULT_DAYS * DAY_MS;
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
