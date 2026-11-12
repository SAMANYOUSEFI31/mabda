/**
 * Semantic contradictions, step 1 (code): which PAIRS are worth asking about. Code never decides that two claims
 * conflict — it only narrows N² pairs down to a few candidates; the decision layer answers one closed question per pair
 * (server/ai/service.ts judgeContradictions). Rules for a candidate (any one is enough):
 *   · same slot      — both objects fill the same Gap item (slotKey) but say different things
 *   · same node      — same node and similar titles
 *   · linked         — the two live objects are tied by depends_on, whatever their titles look like
 *   · same node+type — same node, same type (e.g. two Decisions under «ارسال») and their TEXT overlaps enough
 *   · inherits_conflict — one object sits in an ANCESTOR node of the other's node (what it says is inherited by the other) and
 *                         their subject overlaps (same similarity thresholds); an explicit `overrides` exception silences it
 *   · number / qualifier differs — similar titles, but a quantity in the same unit class or a qualifier word differs
 */

import type { Contradiction, ContextObject, ContextRelationship, TreeNode } from '../types';
import { ancestorIds } from './nodeTree';
import { reachOf } from './effectiveContext';
import { blockedPairs, groupPairs } from './pairBlocking';
import { detectContradictions, extractQuantities, jaccard, normalizeFa, titleTokens } from './contextEngine';

export type CandidateReason = 'same_slot' | 'same_node' | 'linked' | 'same_node_same_type' | 'inherits_conflict' | 'number_differs' | 'qualifier_differs';

export interface CandidatePair {
  /** stable key: ids sorted, joined with `|` */
  key: string;
  a: ContextObject;
  b: ContextObject;
  reasons: CandidateReason[];
}

export const MAX_CANDIDATES = 10;
/** how many objects of one ancestor node are paired with a descendant's object (keeps parent/child pairing bounded) */
const ANCESTOR_FANOUT = 12;
const SAME_NODE_TITLE_SIMILARITY = 0.5;
const TOPIC_SIMILARITY = 0.34;
/** token overlap of the CONTENT (not the title) that makes two same-node, same-type objects worth asking about */
export const SAME_TYPE_CONTENT_OVERLAP = 0.2;

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

/** index pairs of live objects tied by a depends_on edge */
function linkedPairs(active: ContextObject[], relationships: ContextRelationship[]): Array<[number, number]> {
  const at = new Map(active.map((o, i) => [o.id, i]));
  const out: Array<[number, number]> = [];
  for (const r of relationships) {
    if (r.type !== 'depends_on') continue;
    const i = at.get(r.sourceId), j = at.get(r.targetId);
    if (i !== undefined && j !== undefined && i !== j) out.push([Math.min(i, j), Math.max(i, j)]);
  }
  return out;
}

/** index pairs (ancestor object, descendant object): the ancestor node's strongest objects first (Constraint, Decision, Fact) */
function inheritedPairs(active: ContextObject[], nodes: TreeNode[]): Array<[number, number]> {
  if (!nodes.length) return [];
  const byNode = new Map<string, number[]>();
  active.forEach((o, i) => byNode.set(o.nodeId, [...(byNode.get(o.nodeId) ?? []), i]));
  const weight = (o: ContextObject) => (o.type === 'Constraint' ? 0 : o.type === 'Decision' ? 1 : 2);
  for (const list of byNode.values()) list.sort((x, y) => weight(active[x]) - weight(active[y]) || x - y);
  const chains = new Map<string, string[]>();
  const out: Array<[number, number]> = [];
  active.forEach((o, j) => {
    let chain = chains.get(o.nodeId);
    if (!chain) { chain = ancestorIds(nodes, o.nodeId).slice(1); chains.set(o.nodeId, chain); }
    for (const a of chain) for (const i of (byNode.get(a) ?? []).slice(0, ANCESTOR_FANOUT)) out.push([Math.min(i, j), Math.max(i, j)]);
  });
  return out;
}

/** is there a place where both are in force at once? (same section · one is the other's ancestor · either reaches everywhere) */
export function coGoverning(a: ContextObject, b: ContextObject, ancestors: (nodeId: string) => string[]): boolean {
  if (reachOf(a) === 'global' || reachOf(b) === 'global') return true;
  return a.nodeId === b.nodeId || ancestors(a.nodeId).includes(b.nodeId) || ancestors(b.nodeId).includes(a.nodeId);
}

export function candidatePairs(objects: ContextObject[], limit = MAX_CANDIDATES, relationships: ContextRelationship[] = [], nodes: TreeNode[] = []): CandidatePair[] {
  const active = live(objects).filter((o) => o.content.trim().length > 0);
  const linked = linkedPairs(active, relationships);
  const linkedSet = new Set(linked.map(([i, j]) => `${i}|${j}`));
  const contentTokens = new Map(active.map((o) => [o.id, titleTokens(o.content)]));
  const tokens = new Map(active.map((o) => [o.id, titleTokens(o.title)]));
  const quantities = new Map(active.map((o) => [o.id, extractQuantities(`${o.title} ${o.content}`)]));
  const quals = new Map(active.map((o) => [o.id, qualifiersOf(`${o.title} ${o.content}`)]));
  const out: Array<CandidatePair & { score: number }> = [];

  // pairs worth looking at share a title word or a slot (N² → bounded by blocking, see pairBlocking.ts)
  const index = new Map(active.map((o, i) => [o.id, i]));
  const chainOf = (nodeId: string) => (nodes.length ? ancestorIds(nodes, nodeId).slice(1) : []);
  const chains = new Map<string, string[]>();
  const ancestors = (nodeId: string) => { let c = chains.get(nodeId); if (!c) { c = chainOf(nodeId); chains.set(nodeId, c); } return c; };
  const excepted = new Set(relationships.filter((r) => r.type === 'overrides').map((r) => pairKey(r.sourceId, r.targetId)));
  const pairs = blockedPairs(active.map((o) => tokens.get(o.id)!), { extra: [...groupPairs(active.map((o) => o.slotKey)), ...groupPairs(active.map((o) => `${o.nodeId}|${o.type}`)), ...linked, ...inheritedPairs(active, nodes)] });
  {
    for (const [i, j] of pairs) {
      const a = active[i];
      const b = active[j];
      if (normalizeFa(a.content) === normalizeFa(b.content)) continue; // identical claims agree
      // two pieces of knowledge can only contradict where BOTH are in force: the same section, a section and its ancestor,
      // or a «همه‌جا» item (compared with everything). Two sibling sections never govern the same place — unless a person linked them.
      if (nodes.length && !linkedSet.has(`${index.get(a.id)}|${index.get(b.id)}`) && !coGoverning(a, b, ancestors)) continue;
      const sim = jaccard(tokens.get(a.id)!, tokens.get(b.id)!);
      const reasons: CandidateReason[] = [];

      if (a.slotKey && a.slotKey === b.slotKey) reasons.push('same_slot');
      if (a.nodeId === b.nodeId && sim >= SAME_NODE_TITLE_SIMILARITY) reasons.push('same_node');
      if (linkedSet.has(`${index.get(a.id)}|${index.get(b.id)}`)) reasons.push('linked');
      if (a.nodeId === b.nodeId && a.type === b.type && jaccard(contentTokens.get(a.id)!, contentTokens.get(b.id)!) >= SAME_TYPE_CONTENT_OVERLAP) reasons.push('same_node_same_type');
      if (a.nodeId !== b.nodeId && !excepted.has(pairKey(a.id, b.id)) && (ancestors(b.nodeId).includes(a.nodeId) || ancestors(a.nodeId).includes(b.nodeId))
        && (sim >= TOPIC_SIMILARITY || jaccard(contentTokens.get(a.id)!, contentTokens.get(b.id)!) >= SAME_TYPE_CONTENT_OVERLAP)) reasons.push('inherits_conflict');
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
export function pairsToJudge(objects: ContextObject[], known: PairJudgment[], limit = MAX_CANDIDATES, relationships: ContextRelationship[] = [], nodes: TreeNode[] = []): CandidatePair[] {
  const byKey = new Map(known.map((j) => [j.key, j]));
  return candidatePairs(objects, limit, relationships, nodes).filter((p) => {
    const j = byKey.get(p.key);
    return !(j && (j.resolution || isFresh(p, j)));
  });
}

export const REASON_FA: Record<CandidateReason, string> = {
  same_slot: 'هر دو یک جای خالی را پر می‌کنند',
  same_node: 'در یک بخش و با عنوان نزدیک',
  linked: 'یکی به دیگری وابسته است',
  same_node_same_type: 'هم‌نوع در یک بخش و با متن نزدیک',
  inherits_conflict: 'یکی در بخش والدِ دیگری است و موضوعشان یکی است',
  number_differs: 'عددهای متفاوت',
  qualifier_differs: 'خط قرمزهای متفاوت',
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
    out.push({ id: `contra_${aId}_${bId}`, source: 'semantic', itemA: a, itemB: b, reason: j.reason || 'این دو ادعا با هم نمی‌خوانند.', suggestedResolution: 'یکی را نگه دار یا اگر هر دو درست‌اند، بخش‌هایشان را جدا کن.' });
  }
  return out;
}
