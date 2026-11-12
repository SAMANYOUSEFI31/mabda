/**
 * «اثرگذاران و اثرپذیران» of one object — built ONLY from what the engines already know (no new relation):
 *   above  (what shapes it): its dependencies (depends_on), the Constraints in force at its node with their origin,
 *                            exceptions (overrides) that touch it, and the main inputs it inherits (effectiveFor)
 *   below  (what it shapes): the decisions that rest on it (decisionGraph.dependentsOf), the assets built from it or
 *                            from them (usedContext), and the nodes where it is in force (reach / sub-tree / exceptions)
 * Pure.
 */

import type { ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../types';
import { dependentsOf } from './decisionGraph';
import { effectiveFor, inForce, isExpired, reachOf } from './effectiveContext';
import type { EffectiveItem } from './effectiveContext';
import { subtreeIds } from './nodeTree';
import { isActiveContext } from './contextStatus';

export interface ExceptionLink { by: ContextObject; target: ContextObject; /** this object is the one that sets aside (`overrides`) or the one set aside (`overridden`) */ role: 'overrides' | 'overridden' }

export interface Influence {
  shapedBy: {
    dependencies: ContextObject[];
    constraints: EffectiveItem[];
    exceptions: ExceptionLink[];
    inputs: EffectiveItem[];
  };
  shapes: {
    /** every decision that rests on it, directly or through others */
    dependents: ContextObject[];
    /** assets built from it or from anything that rests on it */
    assets: GeneratedDeliverable[];
    /** where it is in force */
    scope: { kind: 'global' | 'subtree'; nodeIds: string[]; exceptNodeIds: string[] };
  };
}

const INPUT_CAP = 8;

export function influenceOf(objectId: string, objects: ContextObject[], nodes: TreeNode[], relations: ContextRelationship[], deliverables: GeneratedDeliverable[], now: Date | string | number): Influence | undefined {
  const me = objects.find((o) => o.id === objectId);
  if (!me) return undefined;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const liveOf = (ids: string[]) => ids.map((id) => byId.get(id)).filter((o): o is ContextObject => !!o && isActiveContext(o));

  // above
  const dependencies = liveOf(relations.filter((r) => r.type === 'depends_on' && r.sourceId === objectId).map((r) => r.targetId));
  const here = inForce(effectiveFor(me.nodeId, objects, nodes, relations, now)).filter((i) => i.object.id !== objectId);
  const constraints = here.filter((i) => i.object.type === 'Constraint');
  const inputs = here.filter((i) => i.object.type !== 'Constraint' && i.origin === 'inherited').slice(0, INPUT_CAP);
  const exceptions: ExceptionLink[] = [];
  for (const r of relations) {
    if (r.type !== 'overrides' || (r.sourceId !== objectId && r.targetId !== objectId)) continue;
    const by = byId.get(r.sourceId), target = byId.get(r.targetId);
    if (by && target) exceptions.push({ by, target, role: r.sourceId === objectId ? 'overrides' : 'overridden' });
  }

  // below
  const dependents = liveOf(dependentsOf(objectId, relations, objects));
  const reaching = new Set([objectId, ...dependents.map((o) => o.id)]);
  const assets = deliverables.filter((d) => (d.usedContext ?? []).some((u) => reaching.has(u.id)));
  const kind = reachOf(me) === 'global' ? 'global' : 'subtree';
  const nodeIds = kind === 'global' ? nodes.map((n) => n.id) : subtreeIds(nodes, me.nodeId);
  const except = new Set<string>();
  for (const r of relations) {
    if (r.type !== 'overrides' || r.targetId !== objectId) continue;
    const by = byId.get(r.sourceId);
    if (by && isActiveContext(by) && !isExpired(by, now)) for (const n of subtreeIds(nodes, by.nodeId)) except.add(n);
  }
  return { shapedBy: { dependencies, constraints, exceptions, inputs }, shapes: { dependents, assets, scope: { kind, nodeIds: nodeIds.filter((n) => !except.has(n)), exceptNodeIds: [...except] } } };
}

/** how many things shape this one (above) and how many it shapes (below): the one-line summary of the inspector */
export function influenceSummary(inf: Influence, fmt: (n: number) => string = String): { before: number; after: number; sentence: string } {
  const before = inf.shapedBy.dependencies.length + inf.shapedBy.constraints.length + inf.shapedBy.inputs.length;
  const after = inf.shapes.dependents.length + inf.shapes.assets.length;
  const sentence = !before && !after
    ? 'هنوز چیزی به این وصل نیست.'
    : before && after ? `${fmt(before)} چیز روی این اثر دارد و ${fmt(after)} چیز از آن اثر می‌گیرد.`
    : before ? `${fmt(before)} چیز روی این اثر دارد و چیزی از آن اثر نمی‌گیرد.`
    : `چیزی روی این اثر ندارد و ${fmt(after)} چیز از آن اثر می‌گیرد.`;
  return { before, after, sentence };
}

const KIND_FA = { Fact: 'واقعیتی', Decision: 'تصمیمی', Constraint: 'خط قرمزی' } as const;
/** ONE plain sentence about an item for the top of the inspector: what it is, where, how far it reaches, and — only when it matters — that it is not final */
export function aboutSentence(o: Pick<ContextObject, 'type' | 'status' | 'assumption' | 'reach'>, nodeLabel: string, opts: { review?: boolean; expired?: boolean } = {}): string {
  const where = nodeLabel ? ` در «${nodeLabel}»` : '';
  const base = o.assumption ? `فرضی${where}` : `${KIND_FA[o.type]}${where}`;
  const reach = o.type === 'Constraint' || (o.type === 'Decision' && reachOf(o) === 'global') ? (reachOf(o) === 'global' ? '؛ همه‌جا اعمال می‌شود' : '؛ فقط در همین بخش اعمال می‌شود') : '';
  const state = opts.expired ? ' که قدیمی شده' : o.status === 'Proposed' ? ' که هنوز تأیید نشده' : o.status === 'Needs Review' || opts.review ? ' که نیاز به بازبینی دارد' : o.assumption ? ' که هنوز واقعیت نیست' : '';
  return `${base}${state}${reach}.`;
}
