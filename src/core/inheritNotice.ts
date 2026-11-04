/**
 * «خبر نرم ارث‌بری»: when approved knowledge changes in a section that has sub-sections AND the knowledge governs there too
 * (`effectiveFor` → inherited / global), ONE calm notice says so: «این تغییر در N زیربخش هم حاکم است؛ اگر خواستی نگاهی بینداز».
 *
 * A hint, never a verdict (docs/spine.md → «ساختار سرنخ است، نه حکم»): it creates no `needsReview`, changes no status, is not part
 * of any serious-warning counter, and a tap on «دیدم» closes it. Pure: the “seen” keys are kept by the caller.
 */

import type { ContextChange, ContextObject, ContextRelationship, TreeNode } from '../types';
import { isContentChange } from './changeLog';
import { effectiveFor, inForce, isExpired, reachOf } from './effectiveContext';
import { sharedTopic } from './mentions';
import { subtreeIds, treeOrder } from './nodeTree';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** changes of one section closer than this are ONE notice */
export const GROUP_GAP_MS = 6 * HOUR_MS;

export interface InheritSubNode {
  nodeId: string;
  label: string;
  /** approved knowledge of THAT sub-section whose topic overlaps with the change (the shared-words rule of mentions.ts) */
  overlapping: Array<{ id: string; title: string }>;
}
export interface InheritNotice {
  /** stable: the newest change of the group; «دیدم» stores it */
  key: string;
  nodeId: string;
  nodeLabel: string;
  at: string;
  objects: Array<{ id: string; title: string }>;
  /** the sub-sections where at least one changed item governs (overlapping ones first) */
  subNodes: InheritSubNode[];
  /** at least one of the items is «همه‌جا» (a red line): it governs outside this section too */
  everywhere: boolean;
}

/** the strict descendants of the object's section where it is IN FORCE (inherited or global): not overridden, not expired */
export function governedBelow(o: ContextObject, objects: ContextObject[], nodes: TreeNode[], relationships: ContextRelationship[], now: Date | string | number): string[] {
  if (o.status !== 'Confirmed' || o.sample || isExpired(o, now)) return [];
  return subtreeIds(nodes, o.nodeId)
    .filter((id) => id !== o.nodeId)
    .filter((id) => inForce(effectiveFor(id, objects, nodes, relationships, now)).some((i) => i.object.id === o.id));
}

/** a change that altered what the knowledge SAYS, or where / how far it reaches */
function altersReach(c: ContextChange): boolean {
  if (c.kind === 'superseded') return true;
  if (c.kind !== 'edited') return false;
  return isContentChange(c) || (!!c.after && ('reach' in c.after || 'nodeId' in c.after));
}

export function buildInheritNotices(input: {
  changes: ContextChange[];
  objects: ContextObject[];
  nodes: TreeNode[];
  relationships: ContextRelationship[];
  now?: Date;
  days?: number;
  /** keys already closed with «دیدم» */
  seen?: Iterable<string>;
}): InheritNotice[] {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - (input.days ?? 7) * DAY_MS).toISOString();
  const seen = new Set(input.seen ?? []);
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const label = new Map(input.nodes.map((n) => [n.id, n.label]));
  const order = new Map(treeOrder(input.nodes).map((id, i) => [id, i]));

  // one candidate per object: its newest qualifying change (a replacement counts for the object that REPLACED)
  const latest = new Map<string, { change: ContextChange; object: ContextObject }>();
  for (const c of input.changes) {
    if (c.at < since || !altersReach(c)) continue;
    const id = c.kind === 'superseded' ? (c.after as { supersededById?: unknown } | undefined)?.supersededById : c.objectId;
    const o = typeof id === 'string' ? byId.get(id) : undefined;
    if (!o || o.status !== 'Confirmed' || o.sample) continue;
    const cur = latest.get(o.id);
    if (!cur || cur.change.at < c.at || (cur.change.at === c.at && cur.change.id < c.id)) latest.set(o.id, { change: c, object: o });
  }

  // …then the changes of one section that are close in time become ONE notice
  const bySection = new Map<string, Array<{ change: ContextChange; object: ContextObject }>>();
  for (const x of latest.values()) bySection.set(x.object.nodeId, [...(bySection.get(x.object.nodeId) ?? []), x]);
  const out: InheritNotice[] = [];
  for (const [nodeId, items] of bySection) {
    items.sort((a, b) => a.change.at.localeCompare(b.change.at) || a.change.id.localeCompare(b.change.id));
    const groups: typeof items[] = [];
    for (const it of items) {
      const g = groups[groups.length - 1];
      if (g && Date.parse(it.change.at) - Date.parse(g[g.length - 1].change.at) <= GROUP_GAP_MS) g.push(it); else groups.push([it]);
    }
    for (const g of groups) {
      const newest = g[g.length - 1].change;
      const key = `inh:${newest.id}`;
      if (seen.has(key)) continue;
      const subs = new Map<string, InheritSubNode>();
      let everywhere = false;
      const objs: InheritNotice['objects'] = [];
      for (const { object } of g) {
        const below = governedBelow(object, input.objects, input.nodes, input.relationships, now);
        if (!below.length) continue;
        objs.push({ id: object.id, title: object.title });
        if (reachOf(object) === 'global') everywhere = true;
        for (const sub of below) {
          const entry = subs.get(sub) ?? { nodeId: sub, label: label.get(sub) ?? sub, overlapping: [] };
          // approved knowledge that BELONGS to that sub-section and talks about the same topic
          for (const other of input.objects) {
            if (other.nodeId !== sub || other.id === object.id || other.status !== 'Confirmed' || other.sample) continue;
            if (isExpired(other, now) || entry.overlapping.some((x) => x.id === other.id)) continue;
            if (sharedTopic(object.title, other.title, { loose: true })) entry.overlapping.push({ id: other.id, title: other.title });
          }
          subs.set(sub, entry);
        }
      }
      if (!subs.size) continue; // nothing governs below: no news
      const subNodes = [...subs.values()].sort((a, b) => b.overlapping.length - a.overlapping.length || (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0) || a.nodeId.localeCompare(b.nodeId));
      out.push({ key, nodeId, nodeLabel: label.get(nodeId) ?? nodeId, at: newest.at, objects: objs, subNodes, everywhere });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}

/** the one calm sentence */
export function inheritSentence(n: Pick<InheritNotice, 'subNodes' | 'objects' | 'nodeLabel'>, fa: (n: number) => string): string {
  const what = n.objects.length === 1 ? `«${n.objects[0].title}»` : `${fa(n.objects.length)} مورد در «${n.nodeLabel}»`;
  return `${what}: این تغییر در ${fa(n.subNodes.length)} زیربخش هم حاکم است؛ اگر خواستی نگاهی بینداز.`;
}
