/**
 * What is IN FORCE at a node — the one answer every consumer shares (AI generation guardrails, node chat, the Context
 * pack, the output validator, the «آنچه اینجا اثر دارد» view, MCP get_context). Pure.
 *
 * Rules (docs/spine.md):
 *  • an object in node M applies to M and to M's sub-nodes — never to M's parent and never to a sibling;
 *  • a Constraint (or anything marked reach = 'global') applies everywhere;
 *  • an `overrides` relation (child-node object → ancestor-node object) switches the ancestor object off for the child's
 *    node and its sub-tree only, and only while the overriding object is live and not expired;
 *  • `validUntil` in the past → expired: kept in history, never in force.
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { ancestorIds } from './nodeTree';

export type Origin = 'own' | 'inherited' | 'global' | 'overridden' | 'expired';

export interface EffectiveItem {
  object: ContextObject;
  origin: Origin;
  /** the node the object lives in */
  fromNodeId: string;
  /** origin = 'overridden': the object that switched it off */
  overriddenBy?: string;
}

export const ORIGIN_FA: Record<Origin, string> = { own: 'مال این گره', inherited: 'ارث رسیده', global: 'همه‌جا', overridden: 'کنار گذاشته‌شده', expired: 'منقضی' };
/** origins that are in force */
export const IN_FORCE: ReadonlySet<Origin> = new Set<Origin>(['own', 'inherited', 'global']);

export const reachOf = (o: Pick<ContextObject, 'type' | 'reach'>): 'global' | 'position' => o.reach ?? (o.type === 'Constraint' ? 'global' : 'position');

const isLive = (o: ContextObject) => o.status !== 'Archived' && o.status !== 'Superseded';
const toMs = (d: Date | string | number) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Date.parse(d));

/** `validUntil` is a date (YYYY-MM-DD) or a timestamp; a date is valid through the END of that day */
export function isExpired(o: Pick<ContextObject, 'validUntil'>, now: Date | string | number): boolean {
  if (!o.validUntil) return false;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(o.validUntil) ? Date.parse(`${o.validUntil}T23:59:59.999Z`) : Date.parse(o.validUntil);
  return Number.isFinite(t) && t < toMs(now);
}

/** an `overrides` edge counts only when its source sits in a strict descendant node of its target and is live and not expired */
function validOverrides(objects: ContextObject[], nodes: TreeNode[], relations: ContextRelationship[], now: Date | string | number) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out: Array<{ by: ContextObject; target: ContextObject }> = [];
  for (const r of relations) {
    if (r.type !== 'overrides') continue;
    const by = byId.get(r.sourceId), target = byId.get(r.targetId);
    if (!by || !target || !isLive(by) || isExpired(by, now)) continue;
    if (by.nodeId === target.nodeId || !ancestorIds(nodes, by.nodeId).includes(target.nodeId)) continue;
    out.push({ by, target });
  }
  return out;
}

/** why an `overrides` edge would not be accepted (the repo and the UI use the same words) */
export function overrideProblem(by: ContextObject | undefined, target: ContextObject | undefined, nodes: TreeNode[]): string | undefined {
  if (!by || !target) return 'یکی از دو مورد پیدا نشد.';
  if (by.id === target.id) return 'یک مورد را نمی‌شود با خودش کنار گذاشت.';
  if (by.nodeId === target.nodeId || !ancestorIds(nodes, by.nodeId).includes(target.nodeId)) return 'مورد کنار گذاشته‌شده باید در یکی از گره‌های بالاتر (والد یا اجداد) مورد جایگزین باشد.';
  return undefined;
}

/**
 * Every live object that could touch `nodeId`, each with where it comes from. Items with origin overridden / expired are
 * listed (so the UI can say why) but are NOT in force — use `inForce` / `effectiveObjects` for what a model may see.
 */
export function effectiveFor(nodeId: string, objects: ContextObject[], nodes: TreeNode[], relations: ContextRelationship[], now: Date | string | number): EffectiveItem[] {
  const chain = ancestorIds(nodes, nodeId); // the node and its parents, nearest first
  const inChain = new Set(chain);
  const overrides = validOverrides(objects, nodes, relations, now).filter((x) => inChain.has(x.by.nodeId)); // only overrides whose subtree contains this node
  const killedBy = new Map<string, string>();
  for (const { by, target } of overrides) if (!killedBy.has(target.id)) killedBy.set(target.id, by.id);
  const rank = (i: EffectiveItem) => (i.origin === 'own' ? 0 : i.origin === 'inherited' ? 1 : i.origin === 'global' ? 2 : 3);
  const out: EffectiveItem[] = [];
  for (const o of objects) {
    if (!isLive(o)) continue;
    const here = inChain.has(o.nodeId);
    if (!here && reachOf(o) !== 'global') continue;
    const base: Origin = o.nodeId === nodeId ? 'own' : here ? 'inherited' : 'global';
    const item: EffectiveItem = { object: o, origin: base, fromNodeId: o.nodeId };
    if (isExpired(o, now)) item.origin = 'expired';
    else if (killedBy.has(o.id) && o.nodeId !== nodeId) { item.origin = 'overridden'; item.overriddenBy = killedBy.get(o.id); }
    out.push(item);
  }
  return out.sort((a, b) => rank(a) - rank(b) || chain.indexOf(a.fromNodeId) - chain.indexOf(b.fromNodeId) || a.object.createdAt.localeCompare(b.object.createdAt) || a.object.id.localeCompare(b.object.id));
}

export const inForce = (items: EffectiveItem[]): EffectiveItem[] => items.filter((i) => IN_FORCE.has(i.origin));

/** the objects a model may see at this node */
export const effectiveObjects = (nodeId: string, objects: ContextObject[], nodes: TreeNode[], relations: ContextRelationship[], now: Date | string | number): ContextObject[] =>
  inForce(effectiveFor(nodeId, objects, nodes, relations, now)).map((i) => i.object);

/** the guardrails at this node: Confirmed Constraints in force */
export const guardrailsFor = (nodeId: string, objects: ContextObject[], nodes: TreeNode[], relations: ContextRelationship[], now: Date | string | number): ContextObject[] =>
  effectiveObjects(nodeId, objects, nodes, relations, now).filter((o) => o.type === 'Constraint' && o.status === 'Confirmed');
