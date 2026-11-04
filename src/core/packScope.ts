/**
 * The ONE scope rule for «بستهٔ دانش» and «درخواست برای AI» (docs/spine.md → «دامنهٔ بسته»). Pure.
 *
 * A scope is a set of picked sections plus a switch «با زیربخش‌ها». What is read is the knowledge IN FORCE at the picked
 * sections (src/core/effectiveContext.ts): their own, what they inherit from above, Constraints (and anything marked
 * «همه‌جا») — never a sibling's, never an expired or overridden one. With «با زیربخش‌ها» the sub-sections are read as
 * well; without it a sub-section is left out only because it was not picked. No section picked = the whole tree.
 *
 * Both consumers read the same `Standing` map, so a pack and a request can never disagree about what is «in scope», and
 * the explanation shown to the user («از کجا آمد؟ / چرا نیامد؟») comes from the same data as the text that is copied.
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { effectiveFor, reachOf } from './effectiveContext';
import type { Origin } from './effectiveContext';
import { ancestorIds, subtreeIds } from './nodeTree';

export interface ScopeSeeds {
  /** the nodes whose effective context is read */
  seeds: string[];
  /** the sections the user picked (existing ones only) */
  picked: string[];
  /** nothing picked: the whole tree */
  whole: boolean;
  withChildren: boolean;
}

/** picked nodes that exist, expanded to their sub-trees when `withChildren`; nothing picked = every node */
export function scopeSeeds(nodes: TreeNode[], nodeIds: string[] | undefined, withChildren: boolean): ScopeSeeds {
  const have = new Set(nodes.map((n) => n.id));
  const picked = [...new Set((nodeIds ?? []).filter((id) => have.has(id)))];
  if (picked.length === 0) return { seeds: nodes.map((n) => n.id), picked: [], whole: true, withChildren };
  const seeds = withChildren ? [...new Set(picked.flatMap((id) => subtreeIds(nodes, id)))] : picked;
  return { seeds, picked, whole: false, withChildren };
}

export interface Standing {
  origin: Origin;
  fromNodeId: string;
  overriddenBy?: string;
  /** read at one of the picked sections themselves (not only through a sub-section) */
  own: boolean;
}
const RANK: Record<Origin, number> = { own: 0, inherited: 1, global: 2, expired: 3, overridden: 4 };

/** the best standing of every live object over the seeds (in force iff its origin is own / inherited / global) */
export function standingOver(scope: ScopeSeeds, objects: ContextObject[], nodes: TreeNode[], relations: ContextRelationship[], now: Date | string | number): Map<string, Standing> {
  const out = new Map<string, Standing>();
  const pickedSet = new Set(scope.picked);
  for (const seed of scope.seeds) {
    for (const it of effectiveFor(seed, objects, nodes, relations, now)) {
      const cur = out.get(it.object.id);
      const own = !scope.whole && it.origin === 'own' && pickedSet.has(seed);
      if (!cur || RANK[it.origin] < RANK[cur.origin] || (RANK[it.origin] === RANK[cur.origin] && own && !cur.own)) {
        out.set(it.object.id, { origin: it.origin, fromNodeId: it.fromNodeId, ...(it.overriddenBy ? { overriddenBy: it.overriddenBy } : {}), own: own || (cur?.own ?? false) });
      } else if (own && !cur.own) cur.own = true;
    }
  }
  return out;
}

/** how an object relates to the picked sections: where it was written, in words the user knows */
export type Relation = 'global' | 'own' | 'above' | 'below' | 'whole';

export function relationOf(o: Pick<ContextObject, 'nodeId' | 'type' | 'reach'>, scope: ScopeSeeds, nodes: TreeNode[]): Relation {
  if (reachOf(o) === 'global') return 'global';
  if (scope.whole) return 'whole';
  if (scope.picked.includes(o.nodeId)) return 'own';
  if (scope.picked.some((p) => ancestorIds(nodes, p).includes(o.nodeId))) return 'above';
  return 'below';
}

const label = (nodes: TreeNode[], id: string) => nodes.find((n) => n.id === id)?.label ?? id;

/** «از "برند"، همه‌جا» · «از بخش بالاتر ("برند")» · «مال "محصول"» · «از زیربخش "قیمت"» — one phrase, never a code */
export function fromText(o: Pick<ContextObject, 'nodeId' | 'type' | 'reach'>, scope: ScopeSeeds, nodes: TreeNode[]): string {
  const name = label(nodes, o.nodeId);
  switch (relationOf(o, scope, nodes)) {
    case 'global': return `از «${name}»، همه‌جا`;
    case 'own': return `مال «${name}»`;
    case 'above': return `از بخش بالاتر («${name}»)`;
    case 'below': return `از زیربخش «${name}»`;
    default: return `در «${name}»`;
  }
}

/** why a thing is left out, one sentence */
export type LeftReason = 'scope' | 'child' | 'expired' | 'overridden' | 'facet' | 'status' | 'assumption' | 'budget' | 'unranked' | 'kind';
export const LEFT_REASON_FA: Record<LeftReason, string> = {
  scope: 'مال بخش دیگری است',
  child: 'زیربخشی که انتخاب نشده',
  expired: 'منقضی شده',
  overridden: 'در این بخش اعمال نمی‌شود (کنار گذاشته شده)',
  facet: 'بُعد دیگری دارد',
  status: 'تأییدنشده؛ تیکش نخورده',
  assumption: 'فرض است؛ تیکش نخورده',
  budget: 'بودجهٔ توکن پر شد',
  unranked: 'به درخواست ربطی پیدا نشد',
  kind: 'برای این نوع کار نمی‌آید',
};

/** the sentence for one skipped object (it names the node, the exception or the way to bring it in) */
export function leftWhy(reason: LeftReason, o: Pick<ContextObject, 'nodeId' | 'type' | 'reach' | 'validUntil'>, nodes: TreeNode[], extra?: { overriddenByTitle?: string }): string {
  const name = label(nodes, o.nodeId);
  switch (reason) {
    case 'scope': return o.type === 'Constraint' ? `خط قرمز فقط برای «${name}» است (محدودهٔ اثر: فقط این بخش)` : `مال «${name}» است و به بخش‌های انتخاب‌شده نمی‌رسد`;
    case 'child': return `در زیربخش «${name}» است؛ «با زیربخش‌ها» را روشن کن یا همان را تیک بزن`;
    case 'expired': return `تا ${o.validUntil ?? 'تاریخی که گذشته'} معتبر بود`;
    case 'overridden': return extra?.overriddenByTitle ? `«${extra.overriddenByTitle}» آن را در این بخش کنار گذاشته` : 'در این بخش کنار گذاشته شده';
    default: return LEFT_REASON_FA[reason];
  }
}

/** where a rule is going to apply, in plain words (the line under «محدودهٔ اثر» in the knowledge form and in the pack's preview) */
export function reachSentence(o: Pick<ContextObject, 'nodeId' | 'type' | 'reach'>, nodes: TreeNode[]): string {
  const name = label(nodes, o.nodeId);
  const subs = nodes.some((n) => n.parentId === o.nodeId);
  return reachOf(o) === 'global'
    ? 'این خط قرمز در همهٔ بسته‌ها و درخواست‌های AI می‌آید، هر بخشی که باشند.'
    : `این خط قرمز فقط در بسته‌ها و درخواست‌هایی می‌آید که دامنه‌شان «${name}»${subs ? ' یا یکی از زیربخش‌هایش' : ''} را بخواند (انتخاب مستقیم، یا بخش بالاترش با «با زیربخش‌ها»).`;
}
