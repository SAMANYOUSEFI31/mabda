/**
 * «پیشنهاد رابطه از بالادست»: while a decision or red line is written / edited in a sub-section, the approved decisions and red
 * lines that REACH that section from above (`effectiveFor`: inherited or global) are offered as «وابسته به» — only when their
 * topic overlaps (the shared-words rule of mentions.ts, plus one shared word, because the structure already says the two are close) and with the
 * reason in words. Being above or in the same section is never a reason by itself.
 *
 * A suggestion, never a link: the caller shows it, one tap accepts it, nothing is created here. Pure.
 */

import type { ContextObject, ContextRelationship, ContextType, TreeNode } from '../types';
import { dependentsOf } from './decisionGraph';
import { effectiveFor } from './effectiveContext';
import { sharedTopic } from './mentions';
import type { LinkSuggestion } from './mentions';

export const MAX_UPSTREAM = 3;
const BINDING = (t: ContextType) => t === 'Decision' || t === 'Constraint';

export function suggestUpstreamLinks(input: {
  title: string;
  type: ContextType;
  nodeId: string;
  selfId?: string;
  objects: ContextObject[];
  nodes: TreeNode[];
  relationships: ContextRelationship[];
  now?: Date;
  /** already linked, or turned down before */
  dismissed?: Iterable<string>;
}): LinkSuggestion[] {
  if (!BINDING(input.type) || !input.title.trim()) return [];
  const now = input.now ?? new Date();
  const no = new Set(input.dismissed ?? []);
  const have = new Set(input.relationships.filter((r) => r.type === 'depends_on' && r.sourceId === input.selfId).map((r) => r.targetId));
  const rests = new Set(input.selfId ? dependentsOf(input.selfId, input.relationships, input.objects) : []); // the reverse link would close a cycle
  const label = new Map(input.nodes.map((n) => [n.id, n.label]));
  const pool = input.objects.filter((o) => o.id !== input.selfId);
  const rank = (origin: string) => (origin === 'inherited' ? 0 : 1); // the nearest sections above first
  const out: Array<LinkSuggestion & { score: number; r: number }> = [];
  for (const it of effectiveFor(input.nodeId, pool, input.nodes, input.relationships, now)) {
    const o = it.object;
    if (it.origin !== 'inherited' && it.origin !== 'global') continue;
    if (o.nodeId === input.nodeId || o.status !== 'Confirmed' || o.sample || !BINDING(o.type)) continue;
    if (have.has(o.id) || no.has(o.id) || rests.has(o.id)) continue;
    const shared = sharedTopic(input.title, o.title, { loose: true });
    if (!shared) continue;
    out.push({ targetId: o.id, title: o.title, because: shared.join('، '), fromNode: label.get(o.nodeId) ?? o.nodeId, score: shared.length, r: rank(it.origin) });
  }
  return out
    .sort((a, b) => b.score - a.score || a.r - b.r || a.title.localeCompare(b.title) || a.targetId.localeCompare(b.targetId))
    .slice(0, MAX_UPSTREAM)
    .map(({ score: _s, r: _r, ...sg }) => sg);
}
