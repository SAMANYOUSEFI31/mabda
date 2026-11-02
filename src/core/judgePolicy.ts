/**
 * When the semantic-contradiction judge may run. Never because a workspace was opened, built or reset — only when
 *   (a) an object that belongs to a candidate pair changed in THIS session and the pair has no fresh judgement
 *       (the client waits JUDGE_SETTLE_MS first, so a burst of edits is one call), or
 *   (b) the user presses «بررسی تناقض».
 * Without an AI key nothing runs at all. The daily cap is the plan's decisionJudgmentsPerDay (entitlements.config.ts).
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { pairsToJudge, type CandidatePair, type PairJudgment } from './contradictionCandidates';

/** how long to wait after the last change before asking (ms) */
export const JUDGE_SETTLE_MS = 6000;

/** id → version of every object as it was when the workspace finished loading */
export type VersionBaseline = Map<string, number>;

export const baselineOf = (objects: ContextObject[]): VersionBaseline => new Map(objects.map((o) => [o.id, o.version]));

/** ids of objects that are new or have a higher version than the baseline */
export function changedSince(objects: ContextObject[], baseline: VersionBaseline): Set<string> {
  const out = new Set<string>();
  for (const o of objects) { const v = baseline.get(o.id); if (v === undefined || o.version > v) out.add(o.id); }
  return out;
}

/** (a) candidate pairs with no fresh judgement where at least one object changed since the baseline */
export function pairsAfterChange(objects: ContextObject[], known: PairJudgment[], baseline: VersionBaseline, relationships: ContextRelationship[] = [], nodes: TreeNode[] = []): CandidatePair[] {
  const changed = changedSince(objects, baseline);
  if (changed.size === 0) return [];
  return pairsToJudge(objects, known, undefined, relationships, nodes).filter((p) => changed.has(p.a.id) || changed.has(p.b.id));
}
