/**
 * Rules of the tree. THE TREE IS DATA: no node is locked and no node id is known to the code (the five nodes of the default
 * start are an ordinary starting point, see startTemplate.ts). What stays:
 *  - every piece of knowledge lives in some node, so there is always at least one root (the last one is not deleted)
 *  - a node with content is deleted only after the content moves somewhere (default: its parent; a root → another root)
 *  - a node never moves under itself
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

/** the value of the «سطح اصلی» choice in a picker; the API and the core use '' for «no parent» */
export const ROOT_TARGET = '__root';

/** `newParentId === ''` = the top level (a main section). A node moves under any node that is not itself or inside itself. */
export function canMove(nodes: TreeNode[], id: string, newParentId: string): Check {
  const node = nodes.find((n) => n.id === id);
  if (!node) return no('این گره وجود ندارد.');
  if (!newParentId) return { ok: true };
  if (!nodes.some((n) => n.id === newParentId)) return no('مقصد وجود ندارد.');
  if (subtreeIds(nodes, id).includes(newParentId)) return no('گره را نمی‌شود زیر خودش یا زیرشاخه‌هایش گذاشت.');
  return { ok: true };
}

/** the quick moves of the node menu: where each one would put the node (undefined = not possible now). '' = the top level */
export function quickMoves(nodes: TreeNode[], id: string): { up?: number; down?: number; outdent?: { parentId: string }; indent?: { parentId: string } } {
  const node = nodes.find((n) => n.id === id);
  if (!node) return {};
  const sibs = childrenOf(nodes, node.parentId ?? undefined);
  const at = sibs.findIndex((n) => n.id === id);
  const prev = sibs[at - 1];
  const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
  return {
    ...(at > 0 ? { up: at - 1 } : {}),
    ...(at >= 0 && at < sibs.length - 1 ? { down: at + 1 } : {}),
    ...(parent ? { outdent: { parentId: parent.parentId ?? '' } } : {}),
    ...(prev ? { indent: { parentId: prev.id } } : {}),
  };
}

export interface NodeContent {
  objects: number;
  notes: number;
  /** files added to this node */
  files: number;
  children: number;
}

export function contentOf(nodes: TreeNode[], id: string, objects: Pick<ContextObject, 'nodeId'>[], notes: Pick<Note, 'nodeId'>[], files: Array<{ nodeId?: string }> = []): NodeContent {
  return {
    files: files.filter((f) => f.nodeId === id).length,
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
  files: Array<{ nodeId?: string }> = [],
): DeleteCheck {
  const node = nodes.find((n) => n.id === id);
  if (!node) return no('این گره وجود ندارد.');
  if (!node.parentId && nodes.filter((n) => !n.parentId).length <= 1) return no('این آخرین گرهٔ اصلی است؛ دانش باید جایی بماند. اول یک گرهٔ دیگر بساز.');
  const content = contentOf(nodes, id, objects, notes, files);
  const empty = content.objects + content.notes + content.files + content.children === 0;
  if (empty) return { ok: true };
  if (!transferTo) return { ok: false, reason: 'این بخش خالی نیست؛ محتوایش را به بخش دیگری ببر.', needsTransfer: true, content };
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

/**
 * Where something with no place of its own goes (a note, a file, an extracted piece of knowledge, an answer to a Gap):
 * the first root of the tree, by order. It is an ordinary node — rename it, move it, delete it — nothing knows its id.
 * '' only when the workspace has no node at all (a brand-new, still empty one).
 */
export function defaultNodeId(nodes: TreeNode[]): string {
  return childrenOf(nodes, undefined)[0]?.id ?? nodes.slice().sort(byOrder)[0]?.id ?? '';
}

/** `hint` when that node exists, otherwise the default place (a template's or a spec item's `nodeId` is only a hint) */
export const resolveNodeId = (nodes: TreeNode[], hint: string | undefined | null): string => (hint && nodes.some((n) => n.id === hint) ? hint : defaultNodeId(nodes));

/** the node ids in tree order (depth first, siblings by `order`): the order knowledge is laid out for an AI */
export const treeOrder = (nodes: TreeNode[]): string[] => flatten(nodes).map((x) => x.node.id);

/** where the content of a node about to be deleted goes by default: its parent; a root → the next other root; none when it is the last root */
export function defaultTransferTarget(nodes: TreeNode[], id: string): string | undefined {
  const node = nodes.find((n) => n.id === id);
  if (!node) return undefined;
  if (node.parentId && nodes.some((n) => n.id === node.parentId)) return node.parentId;
  return childrenOf(nodes, undefined).find((n) => n.id !== id)?.id;
}
