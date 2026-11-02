/**
 * One Markdown representation of the Context tree. The reading view, the "Markdown" tab, copy and download
 * all come from here (the Context pack and MCP use their own compact format on top of the same objects).
 * Pure: no UI, no I/O.
 */

import type { ContextObject, ContextStatus, ContextType, TreeNode } from '../types';
import { byOrder, childrenOf, subtreeIds } from './nodeTree';

const TYPE_FA: Record<ContextType, string> = { Fact: 'واقعیت', Decision: 'تصمیم', Constraint: 'قید' };
const STATUS_FA: Record<ContextStatus, string> = {
  Confirmed: 'تأییدشده', Proposed: 'پیشنهادی (تأییدنشده)', 'Needs Review': 'نیازمند بازبینی', Superseded: 'جایگزین‌شده', Archived: 'بایگانی',
};
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number) => String(n).replace(/\d/g, (d) => FA[Number(d)]);
const isActive = (o: ContextObject) => o.status !== 'Archived' && o.status !== 'Superseded';
const heading = (level: number, text: string) => `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${text}`;

function nodeSection(node: TreeNode, nodes: TreeNode[], objects: ContextObject[], level: number, out: string[]): void {
  out.push(heading(level, node.label), '');
  if (node.description) out.push(`> ${node.description}`, '');
  const own = objects.filter((o) => o.nodeId === node.id && isActive(o));
  if (own.length === 0 && childrenOf(nodes, node.id).length === 0) out.push('_هنوز چیزی در این بخش ثبت نشده است._', '');
  for (const o of own) {
    out.push(heading(level + 1, o.title), '');
    out.push(`_${TYPE_FA[o.type]} · ${STATUS_FA[o.status]} · نسخهٔ ${fa(o.version)}_`, '');
    out.push(o.content.trim(), '');
  }
  for (const child of childrenOf(nodes, node.id).sort(byOrder)) nodeSection(child, nodes, objects, level + 1, out);
}

/** Markdown of a node and everything under it (`nodeId` omitted = the whole tree under `title`). */
export function contextToMarkdown(input: { nodes: TreeNode[]; objects: ContextObject[]; nodeId?: string; title?: string }): string {
  const { nodes, objects, nodeId, title } = input;
  const out: string[] = [];
  if (nodeId) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return '';
    const inScope = new Set(subtreeIds(nodes, nodeId));
    nodeSection(node, nodes, objects.filter((o) => inScope.has(o.nodeId)), 1, out);
  } else {
    if (title) out.push(heading(1, title), '');
    for (const root of childrenOf(nodes, undefined).sort(byOrder)) nodeSection(root, nodes, objects, title ? 2 : 1, out);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
