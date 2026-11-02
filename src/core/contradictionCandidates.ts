/**
 * Semantic contradictions, step 1 (code): which PAIRS are worth asking about. Code never decides that two claims
 * conflict — it only narrows N² pairs down to a few candidates; the decision layer answers one closed question per pair
 * (server/ai/service.ts judgeContradictions). Rules for a candidate (any one is enough):
 *   · same slot      — both objects fill the same Gap item (slotKey) but say different things
 *   · same node      — same node and similar titles
 *   · number / qualifier differs — similar titles, but a quantity in the same unit class or a qualifier word differs
 */

import type { Contradiction, ContextObject } from '../types';
import { blockedPairs, groupPairs } from './pairBlocking';
import { detectContradictions, extractQuantities, jaccard, normalizeFa, titleTokens } from './contextEngine';

export type CandidateReason = 'same_slot' | 'same_node' | 'number_differs' | 'qualifier_differs';

export interface CandidatePair {
  /** stable key: ids sorted, joined with `|` */
  key: string;
  a: ContextObject;
  b: ContextObject;
  reasons: CandidateReason[];
}

export const MAX_CANDIDATES = 10;
const SAME_NODE_TITLE_SIMILARITY = 0.5;
const TOPIC_SIMILARITY = 0.34;

/** words that flip or bound a claim: «نداریم» vs «داریم», «حداکثر» vs «حداقل», «ماهانه» vs «سالانه» … */
const QUALIFIERS = ['نداریم', 'ندارد', 'نمی', 'بدون', 'هرگز', 'همیشه', 'فقط', 'حداکثر', 'حداقل', 'ماهانه', 'سالانه', 'رایگان', 'انحصاری', 'اجباری', 'اختیاری'];
const qualifiersOf = (text: string): Set<string> => {
  const t = normalizeFa(text);
  return new Set(QUALIFIERS.filter((q) => t.includes(normalizeFa(q))));
};
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export const pairKey = (aId: string, bId: string) => (aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`);

/** The Confirmed / Proposed objects that can contradict each other (Archived and Superseded never take part). */
const live = (os: ContextObject[]) => os.filter((o) => o.status === 'Confirmed' || o.status === 'Proposed');

export function candidatePairs(objects: ContextObject[], limit = MAX_CANDIDATES): CandidatePair[] {
  const active = live(objects).filter((o) => o.content.trim().length > 0);
  const tokens = new Map(active.map((o) => [o.id, titleTokens(o.title)]));
  const quantities = new Map(active.map((o) => [o.id, extractQuantities(`${o.title} ${o.content}`)]));
  const quals = new Map(active.map((o) => [o.id, qualifiersOf(`${o.title} ${o.content}`)]));
  const out: Array<CandidatePair & { score: number }> = [];

  // pairs worth looking at share a title word or a slot (N² → bounded by blocking, see pairBlocking.ts)
  const pairs = blockedPairs(active.map((o) => tokens.get(o.id)!), { extra: groupPairs(active.map((o) => o.slotKey)) });
  {
    for (const [i, j] of pairs) {
      const a = active[i];
      const b = active[j];
      if (normalizeFa(a.content) === normalizeFa(b.content)) continue; // identical claims agree
      const sim = jaccard(tokens.get(a.id)!, tokens.get(b.id)!);
      const reasons: CandidateReason[] = [];

      if (a.slotKey && a.slotKey === b.slotKey) reasons.push('same_slot');
      if (a.nodeId === b.nodeId && sim >= SAME_NODE_TITLE_SIMILARITY) reasons.push('same_node');
      if (sim >= TOPIC_SIMILARITY) {
        const qa = quantities.get(a.id)!;
        const qb = quantities.get(b.id)!;
        const shared = new Set(qa.map((q) => q.cls).filter((c) => qb.some((q) => q.cls === c)));
        for (const cls of shared) {
          const va = qa.filter((q) => q.cls === cls);
          const vb = qb.filter((q) => q.cls === cls);
          if (!va.some((x) => vb.some((y) => y.value === x.value))) { reasons.push('number_differs'); break; }
        }
        if (!sameSet(quals.get(a.id)!, quals.get(b.id)!)) reasons.push('qualifier_differs');
      }
      if (reasons.length) out.push({ key: pairKey(a.id, b.id), a, b, reasons, score: reasons.length + sim });
    }
  }
  return out.sort((x, y) => y.score - x.score || x.key.localeCompare(y.key)).slice(0, limit).map(({ score: _s, ...p }) => p);
}

/** a judgement is valid only for the exact versions it was made on */
export interface PairJudgment { key: string; aVersion: number; bVersion: number; conflict: boolean; reason: string; resolution?: string | null }

export const isFresh = (p: CandidatePair, j: PairJudgment | undefined) => {
  if (!j) return false;
  const lo = p.a.id < p.b.id ? p.a : p.b;
  const hi = lo === p.a ? p.b : p.a;
  return j.aVersion === lo.version && j.bVersion === hi.version;
};

/** candidates that still need a judgement (no fresh answer, not already resolved by the user) */
export function pairsToJudge(objects: ContextObject[], known: PairJudgment[], limit = MAX_CANDIDATES): CandidatePair[] {
  const byKey = new Map(known.map((j) => [j.key, j]));
  return candidatePairs(objects, limit).filter((p) => {
    const j = byKey.get(p.key);
    return !(j && (j.resolution || isFresh(p, j)));
  });
}

export const REASON_FA: Record<CandidateReason, string> = {
  same_slot: 'هر دو یک شکاف را پر می‌کنند',
  same_node: 'در یک گره و با عنوان نزدیک',
  number_differs: 'عددهای متفاوت',
  qualifier_differs: 'قیدهای متفاوت',
};

/**
 * What the user has to resolve: the rule-based contradictions (certain numeric / «no discount» conflicts) plus every
 * pair the decision layer called a conflict for the CURRENT versions. A pair the user already resolved never comes back.
 */
export function unresolvedContradictions(objects: ContextObject[], judgments: PairJudgment[]): Contradiction[] {
  const byKey = new Map(judgments.map((j) => [j.key, j]));
  const out: Contradiction[] = [];
  const seen = new Set<string>();
  for (const c of detectContradictions(objects)) {
    const key = pairKey(c.itemA.id, c.itemB.id);
    if (byKey.get(key)?.resolution) continue;
    seen.add(key);
    out.push({ ...c, source: 'rule' });
  }
  const live = new Map(objects.filter((o) => o.status === 'Confirmed' || o.status === 'Proposed').map((o) => [o.id, o]));
  for (const j of judgments) {
    if (!j.conflict || j.resolution || seen.has(j.key)) continue;
    const [aId, bId] = j.key.split('|');
    const a = live.get(aId), b = live.get(bId);
    if (!a || !b || a.version !== j.aVersion || b.version !== j.bVersion) continue; // edited since: it will be judged again
    out.push({ id: `contra_${aId}_${bId}`, source: 'semantic', itemA: a, itemB: b, reason: j.reason || 'این دو ادعا با هم نمی‌خوانند.', suggestedResolution: 'یکی را نگه دار یا اگر هر دو درست‌اند، گره‌هایشان را جدا کن.' });
  }
  return out;
}
