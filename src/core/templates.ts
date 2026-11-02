/**
 * «ذخیره به‌عنوان قالب»: the user's own node (with its sub-tree and the knowledge in it) or workstream becomes a template she
 * can bring into any of her workspaces. What comes back are EXAMPLES: nodes are real, but the objects arrive as grey samples
 * (never seen by an AI or an engine) for her to replace with her own. Pure.
 */

import type { ContextObject, TreeNode, WorkstreamSpec } from '../types';

export interface NodeTemplateNode { label: string; description: string; children: NodeTemplateNode[] }
export interface NodeTemplateObject { /** the child-index path from the template's root node ([] = the root itself) */ path: number[]; type: ContextObject['type']; title: string; content: string; facets?: string[]; slotKey?: string }
export interface NodeTemplate { root: NodeTemplateNode; objects: NodeTemplateObject[] }

export function nodeTemplateOf(nodeId: string, nodes: TreeNode[], objects: ContextObject[]): NodeTemplate | undefined {
  const kids = (id: string) => nodes.filter((n) => n.parentId === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const root = nodes.find((n) => n.id === nodeId);
  if (!root) return undefined;
  const out: NodeTemplateObject[] = [];
  const walk = (n: TreeNode, path: number[]): NodeTemplateNode => {
    // only Confirmed, non-assumption knowledge of the user becomes an example (no samples, no proposals, no history)
    for (const o of objects.filter((x) => x.nodeId === n.id && x.status === 'Confirmed' && !x.sample && !x.assumption)) {
      out.push({ path, type: o.type, title: o.title, content: o.content, ...(o.facets?.length ? { facets: o.facets } : {}), ...(o.slotKey ? { slotKey: o.slotKey } : {}) });
    }
    return { label: n.label, description: n.description, children: kids(n.id).map((k, i) => walk(k, [...path, i])) };
  };
  return { root: walk(root, []), objects: out };
}

/** a workstream template is the spec without its id (the id is made when it is brought in) */
export const workstreamTemplateOf = (spec: WorkstreamSpec): Omit<WorkstreamSpec, 'id'> => { const { id: _id, ...rest } = spec; return rest; };
