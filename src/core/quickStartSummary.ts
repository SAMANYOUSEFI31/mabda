/**
 * «شروع سریع چه ساخت»: what the quick start left in the workspace, node by node — approved vs waiting — so the user is not left
 * with «done» and no map. Pure; the dialog adds the «ببین» links.
 */

import type { ContextObject, TreeNode } from '../types';

export interface QuickStartRow { nodeId: string; label: string; confirmed: number; proposed: number }
export interface QuickStartSummary { rows: QuickStartRow[]; confirmed: number; proposed: number }

export function quickStartSummary(objects: Array<Pick<ContextObject, 'nodeId' | 'status'>>, nodes: Array<Pick<TreeNode, 'id' | 'label'>>): QuickStartSummary {
  const by = new Map<string, QuickStartRow>();
  for (const o of objects) {
    const row = by.get(o.nodeId) ?? { nodeId: o.nodeId, label: nodes.find((n) => n.id === o.nodeId)?.label ?? '', confirmed: 0, proposed: 0 };
    if (o.status === 'Confirmed') row.confirmed++; else row.proposed++;
    by.set(o.nodeId, row);
  }
  const rows = [...by.values()].sort((a, b) => nodes.findIndex((n) => n.id === a.nodeId) - nodes.findIndex((n) => n.id === b.nodeId));
  return { rows, confirmed: rows.reduce((s, r) => s + r.confirmed, 0), proposed: rows.reduce((s, r) => s + r.proposed, 0) };
}
