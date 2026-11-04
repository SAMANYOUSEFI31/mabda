/**
 * «دامنهٔ اثر»: where does ONE piece of knowledge reach, and what changes if its home moves (to another section, or to
 * «همه‌جا»)? Said BEFORE it is confirmed, in the same spirit as `moveEffect`. The object is simulated as Confirmed so a
 * proposal also shows what it WOULD reach. Pure.
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { effectiveFor, inForce } from './effectiveContext';

export type ScopeTarget = { kind: 'global' } | { kind: 'node'; nodeId: string };
export interface ScopeEffect { gained: string[]; lost: string[]; sentence: string }

const reaches = (nodeId: string, o: ContextObject, nodes: TreeNode[], rels: ContextRelationship[], now: Date | string | number) =>
  inForce(effectiveFor(nodeId, [{ ...o, status: 'Confirmed', sample: false }], nodes, rels, now)).some((i) => i.object.id === o.id);

export function scopeEffect(nodes: TreeNode[], rels: ContextRelationship[], o: ContextObject, target: ScopeTarget, now: Date | string | number): ScopeEffect {
  const next: ContextObject = target.kind === 'global' ? { ...o, reach: 'global' } : { ...o, nodeId: target.nodeId, ...(o.reach === 'global' ? { reach: 'position' as const } : {}) };
  const gained: string[] = [], lost: string[] = [];
  for (const n of nodes) {
    const was = reaches(n.id, o, nodes, rels, now), will = reaches(n.id, next, nodes, rels, now);
    if (!was && will) gained.push(n.label); else if (was && !will) lost.push(n.label);
  }
  const list = (ns: string[]) => (ns.length <= 3 ? ns.map((x) => `«${x}»`).join('، ') : `«${ns.slice(0, 3).join('»، «')}» و ${ns.length - 3} بخش دیگر`);
  const parts = [gained.length ? `این بخش‌ها آن را می‌گیرند: ${list(gained)}` : '', lost.length ? `این بخش‌ها از دست می‌دهند: ${list(lost)}` : ''].filter(Boolean);
  return { gained, lost, sentence: parts.length ? `${parts.join('. ')}.` : 'دامنهٔ اثر عوض نمی‌شود.' };
}
