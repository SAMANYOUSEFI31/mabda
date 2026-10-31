/**
 * Rules of the 3-layer tree (decisions v3.1 §4):
 *  - system nodes: rename only (no delete, no move)
 *  - user nodes: create / move / delete freely under any node
 *  - delete a user node only when it is empty, or after moving its content to another node
 * Pure functions: the server enforces them, the UI uses the same functions to explain why an action is disabled.
 */

import type { ContextObject, Note, TreeNode } from '../types';

export const byOrder = (a: TreeNode, b: TreeNode) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id);

export const childrenOf = (nodes: TreeNode[], parentId: string | undefined): TreeNode[] =>
  nodes.filter((n) => (n.parentId ?? undefined) === parentId).sort(byOrder);

/** the node itself + every descendant (the «scope» of a node chat) */
export function subtreeIds(nodes: TreeNode[], id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (cur: string) => {
    if (seen.has(cur)) return;
    seen.add(cur);
    out.push(cur);
    for (const c of childrenOf(nodes, cur)) walk(c.id);
  };
  if (nodes.some((n) => n.id === id)) walk(id);
  return out;
}

/** node → root chain, node first. Cycle-safe. */
export function ancestorIds(nodes: TreeNode[], id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = nodes.find((n) => n.id === id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur.id);
    cur = cur.parentId ? nodes.find((n) => n.id === cur!.parentId) : undefined;
  }
  return out;
}

export type Check = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Check => ({ ok: false, reason });

export function canRename(nodes: TreeNode[], id: string, label: string): Check {
  if (!nodes.some((n) => n.id === id)) return no('این گره وجود ندارد.');
  if (!label.trim()) return no('نام گره نمی‌تواند خالی باشد.');
  return { ok: true };
}

export function canCreateUnder(nodes: TreeNode[], parentId: string, label: string): Check {
  if (!nodes.some((n) => n.id === parentId)) return no('گرهٔ والد وجود ندارد.');
  if (!label.trim()) return no('نام گره نمی‌تواند خالی باشد.');
  return { ok: true };
}

export function canMove(nodes: TreeNode[], id: string, newParentId: string): Check {
  const node = nodes.find((n) => n.id === id);
  if (!node) return no('این گره وجود ندارد.');
  if (node.isSystem) return no('گره‌های سیستمی فقط تغییر نام دارند و جابه‌جا نمی‌شوند.');
  if (!nodes.some((n) => n.id === newParentId)) return no('مقصد وجود ندارد.');
  if (subtreeIds(nodes, id).includes(newParentId)) return no('گره را نمی‌شود زیر خودش یا زیرشاخه‌هایش گذاشت.');
  return { ok: true };
}

export interface NodeContent {
  objects: number;
  notes: number;
  children: number;
}

export function contentOf(nodes: TreeNode[], id: string, objects: Pick<ContextObject, 'nodeId'>[], notes: Pick<Note, 'nodeId'>[]): NodeContent {
  return {
    objects: objects.filter((o) => o.nodeId === id).length,
    notes: notes.filter((n) => n.nodeId === id).length,
    children: nodes.filter((n) => n.parentId === id).length,
  };
}

export type DeleteCheck = Check | { ok: false; reason: string; needsTransfer: true; content: NodeContent };

/** Delete only when empty; otherwise the caller must pass `transferTo` (the content moves there). */
export function canDelete(
  nodes: TreeNode[],
  id: string,
  objects: Pick<ContextObject, 'nodeId'>[],
  notes: Pick<Note, 'nodeId'>[],
  transferTo?: string,
): DeleteCheck {
  const node = nodes.find((n) => n.id === id);
  if (!node) return no('این گره وجود ندارد.');
  if (node.isSystem) return no('گره‌های سیستمی حذف نمی‌شوند؛ فقط می‌توان نامشان را عوض کرد.');
  const content = contentOf(nodes, id, objects, notes);
  const empty = content.objects + content.notes + content.children === 0;
  if (empty) return { ok: true };
  if (!transferTo) return { ok: false, reason: 'این گره خالی نیست؛ محتوا را به گرهٔ دیگری منتقل کن.', needsTransfer: true, content };
  if (!nodes.some((n) => n.id === transferTo)) return no('گرهٔ مقصد وجود ندارد.');
  if (subtreeIds(nodes, id).includes(transferTo)) return no('مقصد نمی‌تواند خودِ گره یا زیرشاخه‌اش باشد.');
  return { ok: true };
}

export const nextOrder = (nodes: TreeNode[], parentId: string | undefined): number =>
  childrenOf(nodes, parentId).reduce((m, n) => Math.max(m, (n.order ?? 0) + 1), 0);

/** Re-number siblings so that `id` sits at `index` (0-based). Returns the new order for every sibling. */
export function reorderSiblings(nodes: TreeNode[], parentId: string | undefined, id: string, index: number): Array<{ id: string; order: number }> {
  const sibs = childrenOf(nodes, parentId).filter((n) => n.id !== id);
  const at = Math.max(0, Math.min(index, sibs.length));
  const ids = [...sibs.slice(0, at).map((n) => n.id), id, ...sibs.slice(at).map((n) => n.id)];
  return ids.map((x, i) => ({ id: x, order: i }));
}

/** flattened for pickers: depth-first with depth */
export function flatten(nodes: TreeNode[]): Array<{ node: TreeNode; depth: number }> {
  const out: Array<{ node: TreeNode; depth: number }> = [];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const n of childrenOf(nodes, parentId)) {
      out.push({ node: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}
