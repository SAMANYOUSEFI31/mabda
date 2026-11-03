/**
 * Level 2 of docs/design-principles.md: which features are SHOWN right now. A feature that has no data yet is not hidden
 * for ever — it is out of the way until there is something in it (or the user goes looking: «بیشتر» and the search find it).
 * Pure: the page asks, this decides; nothing is removed.
 */

export interface FeatureState {
  now: Date;
  /** the change records of this workspace (only `objectId` and `at` are read) */
  changes: Array<{ objectId: string; at: string }>;
  relationships: Array<{ type: string }>;
  contradictions: number;
  /** metrics that are not archived */
  metrics: number;
  savedPacks: number;
  proposed: number;
}

export interface VisibleFeatures {
  /** a change in the last 7 days */
  weeklyReview: boolean;
  /** a dependency exists, so an order of decisions exists */
  waitingDecisions: boolean;
  contradictions: boolean;
  /** a metric is defined: its card and «انتظار در برابر نتیجه» */
  metrics: boolean;
  /** one is saved */
  packs: boolean;
  proposals: boolean;
}

export const RECENT_DAYS = 7;

export function visibleFeatures(s: FeatureState): VisibleFeatures {
  const since = s.now.getTime() - RECENT_DAYS * 86_400_000;
  const recentChange = s.changes.some((c) => !c.objectId.startsWith('metric:') && !c.objectId.startsWith('node:') && new Date(c.at).getTime() >= since);
  return {
    weeklyReview: recentChange,
    waitingDecisions: s.relationships.some((r) => r.type === 'depends_on'),
    contradictions: s.contradictions > 0,
    metrics: s.metrics > 0,
    packs: s.savedPacks > 0,
    proposals: s.proposed > 0,
  };
}

/** the views of «منبع حقیقت»: structure, document and canvas always; the table sits under «⋯» */
export const PRIMARY_CONTEXT_VIEWS = ['doc', 'read', 'canvas'] as const;
export const MORE_CONTEXT_VIEWS = ['table'] as const;
